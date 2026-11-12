import { useEffect, useState } from "react";
import { PAIRING_CODE_LIFETIME_MS } from "../scanner/useDeskScanner.ts";
import type { DeskScannerState } from "../scanner/useDeskScanner.ts";

interface Props {
  state: DeskScannerState;
  onUnpair: () => void;
}

/** The address the Librarian opens on the phone: the scanner page of the site this desk page is served from. */
export function scannerUrl(): string {
  return `${window.location.origin}/scan.html`;
}

/** "482 913": the code in two groups of three, easier to read across a desk. */
function groupedCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

function useSecondsLeft(receivedAt: number): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.ceil((receivedAt + PAIRING_CODE_LIFETIME_MS - now) / 1000));
}

function Countdown({ receivedAt }: { receivedAt: number }) {
  const seconds = useSecondsLeft(receivedAt);
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return <span>{`A new code in ${clock}`}</span>;
}

/**
 * The desk page's side of pairing: the code to type on the phone's scanner page,
 * or, once a phone is paired, its status and the last scan it sent.
 */
export function PairingPanel({ state, onUnpair }: Props) {
  return (
    <section className="pairing" aria-labelledby="pairing-title">
      <div className="pairing__head">
        <h2 className="pairing__title" id="pairing-title">
          Phone scanner
        </h2>
        <span className={`pairing__chip pairing__chip--${state.kind}`} aria-live="polite" data-testid="pairing-status">
          {state.kind === "paired" ? "Phone paired" : state.kind === "waiting" ? "Not paired" : state.kind === "connecting" ? "Connecting..." : "Unavailable"}
        </span>
      </div>

      {state.kind === "waiting" && (
        <>
          <p className="pairing__label">Pairing code</p>
          <p className="pairing__code" data-testid="pairing-code" aria-label={`Pairing code ${state.code.split("").join(" ")}`}>
            {groupedCode(state.code)}
          </p>
          <p className="pairing__timer">
            <Countdown key={state.receivedAt} receivedAt={state.receivedAt} />
          </p>
          <ol className="pairing__steps">
            <li>
              On your phone, open <span className="pairing__url">{scannerUrl()}</span>
            </li>
            <li>Type the code and point the camera at a barcode.</li>
          </ol>
        </>
      )}

      {state.kind === "paired" && (
        <>
          <p className="pairing__note">Every barcode the phone reads appears here as if it were typed.</p>
          <p className="pairing__last" data-testid="pairing-last-scan">
            {state.lastScan === undefined ? "Waiting for the first scan..." : `Last scan from the phone: ${state.lastScan}`}
          </p>
          <button className="button button--quiet pairing__unpair" type="button" onClick={onUnpair}>
            Unpair this phone
          </button>
        </>
      )}

      {state.kind === "connecting" && <p className="pairing__note">Connecting to the server. Typed and USB scans keep working.</p>}
      {state.kind === "unavailable" && <p className="pairing__note">{state.message}</p>}
    </section>
  );
}
