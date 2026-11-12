import { useRef, useState } from "react";
import { SCAN_MESSAGES } from "@libras/shared";
import type { DeskLoan, DeskMember, ScanReading, StaffProfile } from "@libras/shared";
import { ApiError, confirmLoan, identifyMember } from "../api.ts";
import { Brand } from "../components/Brand.tsx";
import { LoanNotice } from "../components/LoanNotice.tsx";
import { MemberCard } from "../components/MemberCard.tsx";
import { ScanField } from "../scan/ScanField.tsx";
import { useScanInput } from "../scan/scan-input.ts";

interface Props {
  staff: StaffProfile;
  onSignOut: () => void;
}

/** The Member at the desk: who they are, and the Digital ID code that was scanned, which confirms their Loans. */
interface Identified {
  member: DeskMember;
  digitalId: string;
}

/** What the last scan did, shown under the scan field. */
type Outcome = { kind: "none" } | { kind: "confirmed"; loan: DeskLoan } | { kind: "refused"; message: string };

type DeskState =
  | { kind: "ready"; outcome: Outcome }
  | { kind: "identifying" }
  | { kind: "member"; identified: Identified; outcome: Outcome }
  | { kind: "confirming"; identified: Identified };

type Status = "ready" | "identifying" | "member" | "confirming" | "confirmed" | "refused";

const STATUS: Record<Status, string> = {
  ready: "Waiting for a scan",
  identifying: "Checking the Digital ID...",
  member: "Member identified",
  confirming: "Recording the Loan...",
  confirmed: "Loan confirmed",
  refused: "Scan not accepted",
};

/** A Loan refused because of the Digital ID itself: the Member must show it again, so the desk forgets them. */
const DIGITAL_ID_REFUSALS = new Set(["digital_id_expired", "digital_id_invalid", "digital_id_used"]);

function statusOf(state: DeskState): Status {
  if (state.kind === "identifying" || state.kind === "confirming") return state.kind;
  if (state.outcome.kind !== "none") return state.outcome.kind;
  return state.kind;
}

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong. Please scan again.";
}

/**
 * The desk screen: every scan arrives through the one scan input point and is
 * shown here. A Digital ID identifies a Member; a Copy scanned after it
 * confirms a Loan for that Member.
 */
export function DeskPage({ staff, onSignOut }: Props) {
  const [state, setState] = useState<DeskState>({ kind: "ready", outcome: { kind: "none" } });
  // Only the newest scan may change the screen: an older answer that arrives late is dropped.
  const latestScan = useRef(0);

  const identified = state.kind === "member" || state.kind === "confirming" ? state.identified : undefined;
  const outcome: Outcome = state.kind === "ready" || state.kind === "member" ? state.outcome : { kind: "none" };

  /** Shows why a scan did nothing, keeping the Member who is at the desk. */
  function refuse(message: string) {
    const refused: Outcome = { kind: "refused", message };
    setState(identified ? { kind: "member", identified, outcome: refused } : { kind: "ready", outcome: refused });
  }

  function identify(code: string, scanNumber: number) {
    setState({ kind: "identifying" });
    identifyMember(code).then(
      (member) => {
        if (scanNumber !== latestScan.current) return;
        if (member === undefined) onSignOut();
        else setState({ kind: "member", identified: { member, digitalId: code }, outcome: { kind: "none" } });
      },
      (error: unknown) => {
        if (scanNumber !== latestScan.current) return;
        setState({ kind: "ready", outcome: { kind: "refused", message: messageOf(error) } });
      },
    );
  }

  function lend(to: Identified, copy: string, scanNumber: number) {
    setState({ kind: "confirming", identified: to });
    confirmLoan(to.digitalId, copy).then(
      (confirmed) => {
        if (scanNumber !== latestScan.current) return;
        if (confirmed === undefined) onSignOut();
        else {
          setState({
            kind: "member",
            identified: { member: confirmed.member, digitalId: to.digitalId },
            outcome: { kind: "confirmed", loan: confirmed.loan },
          });
        }
      },
      (error: unknown) => {
        if (scanNumber !== latestScan.current) return;
        const refused: Outcome = { kind: "refused", message: messageOf(error) };
        if (error instanceof ApiError && DIGITAL_ID_REFUSALS.has(error.code)) setState({ kind: "ready", outcome: refused });
        else setState({ kind: "member", identified: to, outcome: refused });
      },
    );
  }

  const scanInput = useScanInput((reading: ScanReading) => {
    const scanNumber = ++latestScan.current;
    if (reading.kind === "rejected") refuse(reading.message);
    else if (reading.kind === "digital_id") identify(reading.code, scanNumber);
    // A Copy with no Member at the desk: a later ticket records its return here.
    else if (!identified) refuse(SCAN_MESSAGES.notDigitalId);
    else lend(identified, reading.code, scanNumber);
  });

  const status = statusOf(state);
  const busy = state.kind === "identifying" || state.kind === "confirming";

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
            placeholder={identified ? "Copy barcode or accession number, then Enter" : "Digital ID, then Enter"}
          />
          {outcome.kind === "refused" && (
            <p className="alert desk__alert" role="alert">
              {outcome.message}
            </p>
          )}
          {outcome.kind === "confirmed" && <LoanNotice loan={outcome.loan} />}
          {identified && <MemberCard member={identified.member} />}
        </section>
      </main>
    </div>
  );
}
