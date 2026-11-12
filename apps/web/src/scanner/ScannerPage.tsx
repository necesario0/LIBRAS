import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { PAIRING_CODE_LENGTH, SCANNER_MESSAGES } from "@libras/shared";
import { ApiError } from "../api.ts";
import { Brand } from "../components/Brand.tsx";
import { CameraView } from "./CameraView.tsx";
import { clearToken, leavePairing, loadToken, pair, pairingStatus, saveToken, sendScan } from "./scanner-api.ts";

/** How often the page checks that the pairing still stands (these requests also keep a sleeping host awake). */
const STATUS_INTERVAL_MS = 5000;
/** The same barcode in view is sent once, then ignored for this long. */
const REPEAT_IGNORE_MS = 3000;
/** How long the feedback for a read stays on screen. */
const FEEDBACK_MS = 3000;

type Phase =
  | { kind: "pairing" }
  | { kind: "scanning"; token: string; deskOnline: boolean }
  /** The API no longer knows this pairing (the desk page left, the Librarian unpaired, the API restarted). */
  | { kind: "lost" };

type FeedbackBody = { kind: "sent"; text: string } | { kind: "refused"; message: string };
/** What the last read did. `id` changes each time, so the same message shown twice still replays its flash. */
type Feedback = FeedbackBody & { id: number };

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
}

function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not every browser can vibrate.
  }
}

/** Keeps the screen on while the Librarian is scanning, where the browser allows it. */
function useScreenOn(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    let gone = false;
    const request = () => {
      navigator.wakeLock.request("screen").then(
        (sentinel) => {
          if (gone) void sentinel.release();
          else lock = sentinel;
        },
        () => {
          // Refused (low battery, hidden page): scanning works, the screen may dim.
        },
      );
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") request();
    };
    request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [active]);
}

function PairForm({ lost, onPaired }: { lost: boolean; onPaired: (token: string) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const token = await pair(code);
      saveToken(token);
      onPaired(token);
    } catch (failure) {
      setError(messageOf(failure));
      setBusy(false);
    }
  }

  const digits = code.replace(/\D/g, "");
  return (
    <form className="scanner__card" onSubmit={submit}>
      <h1 className="scanner__title">Use this phone as the scanner</h1>
      {lost ? (
        <p className="alert" role="alert">
          {SCANNER_MESSAGES.pairingLost}
        </p>
      ) : (
        <p className="scanner__lede">Open the desk page on the library computer. Type the pairing code it shows here.</p>
      )}
      <label className="scanner__label" htmlFor="pairing-code">
        Pairing code
      </label>
      <div className="field scanner__code-box">
        <input
          id="pairing-code"
          className="field__input scanner__code-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={PAIRING_CODE_LENGTH + 1}
          placeholder="000 000"
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            setError(undefined);
          }}
        />
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <button className="button scanner__button" type="submit" disabled={busy || digits.length !== PAIRING_CODE_LENGTH}>
        {busy ? "Connecting..." : "Connect"}
      </button>
    </form>
  );
}

/**
 * The scanner page, opened in the phone's browser. The Librarian types the
 * pairing code the desk page shows; from then on every barcode the camera reads
 * is sent to that desk page. The page keeps no Member or Loan data: all it can
 * do is send scans to the desk page it is paired with.
 */
export function ScannerPage() {
  const [phase, setPhase] = useState<Phase>({ kind: "pairing" });
  const [feedback, setFeedback] = useState<Feedback>();
  const [cameraProblem, setCameraProblem] = useState<string>();
  const [typed, setTyped] = useState("");
  const recent = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const feedbackId = useRef(0);
  const sending = useRef(Promise.resolve());

  const token = phase.kind === "scanning" ? phase.token : undefined;
  useScreenOn(token !== undefined);

  // A reload of this page keeps the pairing: check that the stored token still works.
  useEffect(() => {
    const stored = loadToken();
    if (stored === undefined) return;
    let gone = false;
    pairingStatus(stored).then(
      (status) => {
        if (!gone) setPhase({ kind: "scanning", token: stored, deskOnline: status.deskOnline });
      },
      (error: unknown) => {
        if (gone) return;
        if (error instanceof ApiError && error.code === "pairing_lost") {
          clearToken();
          setPhase({ kind: "lost" });
        } else {
          setPhase({ kind: "scanning", token: stored, deskOnline: true });
        }
      },
    );
    return () => {
      gone = true;
    };
  }, []);

  // While paired, keep checking that the pairing stands and the desk page is listening.
  useEffect(() => {
    if (token === undefined) return;
    let gone = false;
    const check = () => {
      pairingStatus(token).then(
        (status) => {
          if (!gone) setPhase({ kind: "scanning", token, deskOnline: status.deskOnline });
        },
        (error: unknown) => {
          if (gone || !(error instanceof ApiError) || error.code !== "pairing_lost") return;
          clearToken();
          setPhase({ kind: "lost" });
        },
      );
    };
    const timer = setInterval(check, STATUS_INTERVAL_MS);
    return () => {
      gone = true;
      clearInterval(timer);
    };
  }, [token]);

  useEffect(() => {
    if (feedback === undefined) return;
    const timer = setTimeout(() => setFeedback(undefined), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [feedback]);

  const show = useCallback((next: FeedbackBody) => {
    feedbackId.current += 1;
    setFeedback({ ...next, id: feedbackId.current });
  }, []);

  /** Sends one read to the desk page and shows what happened. Reads are sent one at a time, in order. */
  const send = useCallback(
    (text: string) => {
      if (token === undefined) return;
      sending.current = sending.current.then(async () => {
        try {
          await sendScan(token, text);
          vibrate(60);
          show({ kind: "sent", text });
          setPhase((current) => (current.kind === "scanning" ? { ...current, deskOnline: true } : current));
        } catch (error) {
          vibrate([80, 60, 80]);
          if (error instanceof ApiError && error.code === "pairing_lost") {
            clearToken();
            setPhase({ kind: "lost" });
            return;
          }
          if (error instanceof ApiError && error.code === "desk_offline") {
            setPhase((current) => (current.kind === "scanning" ? { ...current, deskOnline: false } : current));
          }
          show({ kind: "refused", message: messageOf(error) });
        }
      });
    },
    [token, show],
  );

  const onCameraRead = useCallback(
    (text: string) => {
      const now = performance.now();
      if (text === recent.current.text && now - recent.current.at < REPEAT_IGNORE_MS) return;
      recent.current = { text, at: now };
      send(text);
    },
    [send],
  );

  function submitTyped(event: FormEvent) {
    event.preventDefault();
    const text = typed.trim();
    if (text === "") return;
    setTyped("");
    send(text);
  }

  async function disconnect() {
    if (token !== undefined) await leavePairing(token);
    clearToken();
    setFeedback(undefined);
    setPhase({ kind: "pairing" });
  }

  return (
    <div className="scanner">
      <header className="scanner__bar">
        <Brand />
        {phase.kind === "scanning" && (
          <span
            className={`scanner__chip scanner__chip--${phase.deskOnline ? "ok" : "warn"}`}
            aria-live="polite"
            data-testid="scanner-link"
          >
            {phase.deskOnline ? "Connected to desk" : "Desk page offline"}
          </span>
        )}
      </header>

      <main className="scanner__main">
        {(phase.kind === "pairing" || phase.kind === "lost") && (
          <PairForm
            key={phase.kind}
            lost={phase.kind === "lost"}
            onPaired={(next) => {
              setFeedback(undefined);
              setPhase({ kind: "scanning", token: next, deskOnline: true });
            }}
          />
        )}

        {phase.kind === "scanning" && (
          <>
            <CameraView onRead={onCameraRead} onProblem={setCameraProblem} />
            <div className="scanner__feedback" aria-live="polite" data-testid="scanner-feedback">
              {feedback?.kind === "sent" && (
                <p className="scanner__sent" key={feedback.id}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9.5 16.6 5.4 12.5l-1.4 1.4 5.5 5.5L20.4 8.5 19 7.1z" />
                  </svg>
                  <span>
                    Sent <strong>{feedback.text}</strong> to the desk
                  </span>
                </p>
              )}
              {feedback?.kind === "refused" && (
                <p className="alert scanner__refused" role="alert" key={feedback.id}>
                  {feedback.message}
                </p>
              )}
              {feedback === undefined && !phase.deskOnline && <p className="alert scanner__refused">{SCANNER_MESSAGES.deskOffline}</p>}
              {feedback === undefined && phase.deskOnline && !cameraProblem && (
                <p className="scanner__hint">Point the camera at a barcode. It is sent as soon as it is read.</p>
              )}
            </div>
            {cameraProblem && (
              <p className="alert" role="alert">
                {cameraProblem}
              </p>
            )}
            <form className="scanner__typed" onSubmit={submitTyped}>
              <label className="scanner__label" htmlFor="typed-code">
                Barcode damaged? Type the code
              </label>
              <div className="field">
                <input
                  id="typed-code"
                  className="field__input"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={64}
                  placeholder="Accession number or code"
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                />
                <button className="scanner__send" type="submit" disabled={typed.trim() === ""}>
                  Send
                </button>
              </div>
            </form>
            <button className="button button--quiet scanner__button" type="button" onClick={() => void disconnect()}>
              Disconnect from the desk
            </button>
          </>
        )}
      </main>
    </div>
  );
}
