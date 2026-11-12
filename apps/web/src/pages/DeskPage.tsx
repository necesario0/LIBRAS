import { useRef, useState } from "react";
import type { DeskMember, StaffProfile } from "@libras/shared";
import { ApiError, identifyMember } from "../api.ts";
import { Brand } from "../components/Brand.tsx";
import { MemberCard } from "../components/MemberCard.tsx";
import { ScanField } from "../scan/ScanField.tsx";
import { useScanInput } from "../scan/scan-input.ts";

interface Props {
  staff: StaffProfile;
  onSignOut: () => void;
}

type DeskState =
  | { kind: "ready" }
  | { kind: "identifying" }
  | { kind: "member"; member: DeskMember }
  | { kind: "refused"; message: string };

const STATUS: Record<DeskState["kind"], string> = {
  ready: "Waiting for a scan",
  identifying: "Checking the Digital ID...",
  member: "Member identified",
  refused: "Scan not accepted",
};

/** The desk screen: every scan arrives through the one scan input point and is shown here. */
export function DeskPage({ staff, onSignOut }: Props) {
  const [state, setState] = useState<DeskState>({ kind: "ready" });
  // Only the newest scan may change the screen: an older answer that arrives late is dropped.
  const latestScan = useRef(0);

  const scanInput = useScanInput((reading) => {
    const scanNumber = ++latestScan.current;
    if (reading.kind === "rejected") {
      setState({ kind: "refused", message: reading.message });
      return;
    }
    setState({ kind: "identifying" });
    identifyMember(reading.code).then(
      (member) => {
        if (scanNumber !== latestScan.current) return;
        if (member === undefined) onSignOut();
        else setState({ kind: "member", member });
      },
      (error: unknown) => {
        if (scanNumber !== latestScan.current) return;
        setState({
          kind: "refused",
          message: error instanceof ApiError ? error.message : "Something went wrong. Please scan again.",
        });
      },
    );
  });

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
          <span className={`desk__status desk__status--${state.kind}`} role="status">
            {STATUS[state.kind]}
          </span>
          <h1 className="desk__title" id="desk-title">
            Ready for scanning
          </h1>
          <p className="desk__hint">Scan a Member's Digital ID to start a Loan, or scan a Copy to record a return.</p>
          <ScanField input={scanInput} busy={state.kind === "identifying"} />
          {state.kind === "refused" && (
            <p className="alert desk__alert" role="alert">
              {state.message}
            </p>
          )}
          {state.kind === "member" && <MemberCard member={state.member} />}
        </section>
      </main>
    </div>
  );
}
