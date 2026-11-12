import { useCallback, useEffect, useRef, useState } from "react";
import { PAIRING_CODE_SECONDS, readEventStream } from "@libras/shared";
import type { DeskScannerEventName, DeskScannerEvents } from "@libras/shared";
import { ApiError, openScannerStream, unpairScanner } from "../api.ts";

/** What the desk page shows about the phone scanner. */
export type DeskScannerState =
  /** The stream is opening or lost and being reopened. */
  | { kind: "connecting" }
  /** A pairing code is on show. `secondsLeft` counts from when the code arrived, by this computer's own timer. */
  | { kind: "waiting"; code: string; receivedAt: number }
  | { kind: "paired"; lastScan: string | undefined }
  /** The stream cannot be opened (not a Librarian, or the API is refusing). */
  | { kind: "unavailable"; message: string };

interface Options {
  /** A scan from the paired phone: hand it to the scan input point. */
  onScan: (text: string) => void;
  /** The Librarian's session is gone. */
  onSessionEnded: () => void;
}

const DESK_KEY = "libras.desk-id";
const MAX_RETRY_MS = 8000;

function savedDeskId(): string | undefined {
  try {
    return sessionStorage.getItem(DESK_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function saveDeskId(id: string): void {
  try {
    sessionStorage.setItem(DESK_KEY, id);
  } catch {
    // The pairing then ends with this page load.
  }
}

/** A response body as an async iterable of chunks (`ReadableStream` is not async iterable in every browser). */
async function* chunksOf(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * The desk page's link to the phone scanner: keeps the event stream open while
 * the page is, reconnects when it drops (resuming the pairing with the desk id),
 * and hands each scan to `onScan`. The pairing code, and whether a phone is
 * paired, come back as `state`; `unpair` lets the Librarian pair another phone.
 */
export function useDeskScanner(options: Options): { state: DeskScannerState; unpair: () => Promise<void> } {
  const [state, setState] = useState<DeskScannerState>({ kind: "connecting" });
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const deskId = useRef<string | undefined>(savedDeskId());

  useEffect(() => {
    const abort = new AbortController();

    function handle<Name extends DeskScannerEventName>(name: Name, payload: DeskScannerEvents[Name]) {
      if (name === "desk") {
        deskId.current = (payload as DeskScannerEvents["desk"]).deskId;
        saveDeskId(deskId.current);
      } else if (name === "pairing") {
        setState({ kind: "waiting", code: (payload as DeskScannerEvents["pairing"]).code, receivedAt: performance.now() });
      } else if (name === "paired") {
        setState({ kind: "paired", lastScan: undefined });
      } else if (name === "scan") {
        const { text } = payload as DeskScannerEvents["scan"];
        setState((current) => (current.kind === "paired" ? { kind: "paired", lastScan: text } : current));
        latest.current.onScan(text);
      }
    }

    async function run() {
      let retryMs = 500;
      while (!abort.signal.aborted) {
        try {
          const response = await openScannerStream(deskId.current, abort.signal);
          if (abort.signal.aborted) return;
          if (response === undefined) {
            latest.current.onSessionEnded();
            return;
          }
          if (response.status === 403) {
            setState({ kind: "unavailable", message: "This account cannot use the phone scanner." });
            return;
          }
          if (!response.ok || !response.body) throw new Error(`The scanner stream answered ${response.status}`);
          retryMs = 500;
          for await (const event of readEventStream(chunksOf(response.body))) {
            const name = event.event as DeskScannerEventName;
            if (name === "end") break;
            handle(name, JSON.parse(event.data) as DeskScannerEvents[typeof name]);
          }
          void response.body.cancel().catch(() => {});
        } catch (error) {
          if (abort.signal.aborted) return;
          if (error instanceof ApiError && error.code !== "unreachable") {
            setState({ kind: "unavailable", message: error.message });
            return;
          }
        }
        if (abort.signal.aborted) return;
        // Dropped (or the API ended it on purpose): show it, wait a moment, and take the pairing back.
        setState((current) => (current.kind === "paired" ? current : { kind: "connecting" }));
        await sleep(retryMs, abort.signal);
        retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
      }
    }
    void run();
    return () => abort.abort();
  }, []);

  const unpair = useCallback(async () => {
    const id = deskId.current;
    if (id === undefined) return;
    try {
      if (!(await unpairScanner(id))) latest.current.onSessionEnded();
    } catch {
      // The stream will say what is true; nothing to show here.
    }
  }, []);

  return { state, unpair };
}

export const PAIRING_CODE_LIFETIME_MS = PAIRING_CODE_SECONDS * 1000;
