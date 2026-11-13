import { useRef, useState } from "react";
import type { DeskLoan, DeskMember, ReturnedLoan, ScanReading, StaffProfile } from "@libras/shared";
import { ApiError, confirmLoan, endDeskSession, identifyMember, recordReturn } from "../api.ts";
import { Brand } from "../components/Brand.tsx";
import { LoanNotice } from "../components/LoanNotice.tsx";
import { MemberCard } from "../components/MemberCard.tsx";
import { PairingPanel } from "../components/PairingPanel.tsx";
import { ReturnNotice } from "../components/ReturnNotice.tsx";
import { ScanField } from "../scan/ScanField.tsx";
import { useScanInput } from "../scan/scan-input.ts";
import { useDeskScanner } from "../scanner/useDeskScanner.ts";

interface Props {
  staff: StaffProfile;
  onSignOut: () => void;
}

/** The Member at the desk: who they are, and the token of the desk session that lends to them (ADR 0008). */
interface Identified {
  member: DeskMember;
  deskSession: string;
}

/** What the last scan did, shown under the scan field. */
type Outcome =
  | { kind: "none" }
  | { kind: "confirmed"; loan: DeskLoan }
  | { kind: "returned"; loan: ReturnedLoan }
  | { kind: "refused"; message: string };

type DeskState =
  | { kind: "ready"; outcome: Outcome }
  | { kind: "identifying" }
  | { kind: "member"; identified: Identified; outcome: Outcome }
  | { kind: "confirming"; identified: Identified }
  | { kind: "returning" };

type Status = "ready" | "identifying" | "member" | "confirming" | "confirmed" | "returning" | "returned" | "set_aside" | "refused";

const STATUS: Record<Status, string> = {
  ready: "Waiting for a scan",
  identifying: "Checking the Digital ID...",
  member: "Member identified",
  confirming: "Recording the Loan...",
  confirmed: "Loan confirmed",
  returning: "Recording the return...",
  returned: "Return recorded",
  set_aside: "Return recorded - set aside for a Hold",
  refused: "Scan not accepted",
};

/** A Loan refused because the Member's desk session is over: the Member must show their Digital ID again, so the desk forgets them. */
const SESSION_ENDED = "desk_session_ended";

function statusOf(state: DeskState): Status {
  if (state.kind === "identifying" || state.kind === "confirming" || state.kind === "returning") return state.kind;
  // A returned Copy that is now set aside is not a routine return: the chip says so, in the accent color.
  if (state.outcome.kind === "returned" && state.outcome.loan.heldFor) return "set_aside";
  if (state.outcome.kind !== "none") return state.outcome.kind;
  return state.kind;
}

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong. Please scan again.";
}

/**
 * The desk screen: every scan arrives through the one scan input point and is
 * shown here. A Digital ID identifies a Member; a Copy scanned after it
 * confirms a Loan for that Member. A Copy scanned with no Member at the desk
 * records its return, and "Done with this Member" puts the desk back to that.
 * The pairing panel beside it links the Librarian's phone as a second scan source.
 */
export function DeskPage({ staff, onSignOut }: Props) {
  const [state, setState] = useState<DeskState>({ kind: "ready", outcome: { kind: "none" } });
  // Scans are handled one at a time, in the order they arrive: a Copy scanned while the
  // Digital ID before it is still being checked waits for the answer instead of being lost.
  const queue = useRef<Promise<void>>(Promise.resolve());
  // The Member at the desk as the scan being handled sees them, ahead of the next render.
  const atDesk = useRef<Identified | undefined>(undefined);

  const identified = state.kind === "member" || state.kind === "confirming" ? state.identified : undefined;
  const outcome: Outcome = state.kind === "ready" || state.kind === "member" ? state.outcome : { kind: "none" };

  /** Shows the Member at the desk (or nobody) and what the last scan did. A Member who leaves the desk has their desk session ended. */
  function show(member: Identified | undefined, result: Outcome) {
    const leaving = atDesk.current;
    if (leaving && leaving.deskSession !== member?.deskSession) void endDeskSession(leaving.deskSession);
    atDesk.current = member;
    setState(member ? { kind: "member", identified: member, outcome: result } : { kind: "ready", outcome: result });
  }

  async function identify(code: string) {
    setState({ kind: "identifying" });
    try {
      const identified = await identifyMember(code);
      if (identified === undefined) onSignOut();
      else show({ member: identified.member, deskSession: identified.deskSession.token }, { kind: "none" });
    } catch (error) {
      show(undefined, { kind: "refused", message: messageOf(error) });
    }
  }

  async function lend(to: Identified, copy: string) {
    setState({ kind: "confirming", identified: to });
    try {
      const confirmed = await confirmLoan(to.deskSession, copy);
      if (confirmed === undefined) onSignOut();
      else show({ member: confirmed.member, deskSession: to.deskSession }, { kind: "confirmed", loan: confirmed.loan });
    } catch (error) {
      const refused: Outcome = { kind: "refused", message: messageOf(error) };
      // The desk session is over (timed out, or ended): the Member must show their Digital ID again.
      show(error instanceof ApiError && error.code === SESSION_ENDED ? undefined : to, refused);
    }
  }

  async function giveBack(copy: string) {
    setState({ kind: "returning" });
    try {
      const returned = await recordReturn(copy);
      if (returned === undefined) onSignOut();
      else show(undefined, { kind: "returned", loan: returned });
    } catch (error) {
      show(undefined, { kind: "refused", message: messageOf(error) });
    }
  }

  async function handle(reading: ScanReading) {
    const member = atDesk.current;
    if (reading.kind === "rejected") show(member, { kind: "refused", message: reading.message });
    else if (reading.kind === "digital_id") await identify(reading.code);
    // A Copy with no Member at the desk is a Copy coming back.
    else if (!member) await giveBack(reading.code);
    else await lend(member, reading.code);
  }

  /** The Member has what they came for: end their desk session and forget them, so the next Copy scanned is a return. */
  function finishWithMember() {
    queue.current = queue.current.then(() => show(undefined, { kind: "none" }));
  }

  const scanInput = useScanInput((reading: ScanReading) => {
    queue.current = queue.current.then(() => handle(reading));
  });

  // The paired phone is the second source of the same scan input point.
  const phone = useDeskScanner({ onScan: (text) => scanInput.submit(text, "phone"), onSessionEnded: onSignOut });

  const status = statusOf(state);
  const busy = state.kind === "identifying" || state.kind === "confirming" || state.kind === "returning";

  return (
    <div className="desk">
      <header className="desk__bar">
        <Brand />
        <div className="desk__who">
          <div className="desk__name">
            <span>{staff.fullName}</span>
            <span className="desk__role">Librarian</span>
          </div>
          <button className="button button--quiet" type="button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>
      <main className="desk__main">
        <div className="desk__layout">
          <section className="desk__ready" aria-labelledby="desk-title">
            <span className={`desk__status desk__status--${status}`} role="status">
              {STATUS[status]}
            </span>
            <h1 className="desk__title" id="desk-title">
              Ready for scanning
            </h1>
            <p className="desk__hint" data-testid="desk-hint">
              {identified
                ? "Scan the Copy's barcode to confirm a Loan for this Member. If it cannot be read, type the accession number."
                : "Scan a Member's Digital ID to start a Loan, or scan a Copy to record a return."}
            </p>
            <ScanField
              input={scanInput}
              busy={busy}
              focusKey={identified?.deskSession}
              placeholder={identified ? "Copy barcode or accession number, then Enter" : "Digital ID or Copy, then Enter"}
            />
            {outcome.kind === "refused" && (
              <p className="alert desk__alert" role="alert">
                {outcome.message}
              </p>
            )}
            {outcome.kind === "confirmed" && <LoanNotice loan={outcome.loan} />}
            {outcome.kind === "returned" && <ReturnNotice loan={outcome.loan} />}
            {identified && <MemberCard member={identified.member} />}
            {identified && (
              <button className="button button--quiet desk__done" type="button" onClick={finishWithMember}>
                Done with this Member
              </button>
            )}
          </section>
          <PairingPanel state={phone.state} onUnpair={() => void phone.unpair()} />
        </div>
      </main>
    </div>
  );
}
