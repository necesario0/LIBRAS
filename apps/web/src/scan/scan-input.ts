import { useEffect, useMemo, useRef } from "react";
import { readScan } from "@libras/shared";
import type { ScanReading } from "@libras/shared";

/**
 * The desk page's one scan input point.
 *
 * Every source of a scan hands its raw text to `submit` and nothing else:
 * - "keyboard": the scan field, which a USB barcode scanner types into and ends
 *   with Enter, exactly like a person typing a code by hand;
 * - "phone": the paired phone scanner page (a later ticket feeds its scans here).
 *
 * `submit` checks the text against the whitelist (`readScan` in
 * `@libras/shared`) before anything else sees it, then passes the reading on.
 * Adding a source means calling `submit`; the desk page itself does not change.
 */
export type ScanSource = "keyboard" | "phone";

export type ScanHandler = (reading: ScanReading, source: ScanSource) => void;

export interface ScanInputPoint {
  submit(raw: string, source: ScanSource): void;
}

export function createScanInput(handle: ScanHandler): ScanInputPoint {
  return {
    submit(raw, source) {
      handle(readScan(raw), source);
    },
  };
}

/** `createScanInput` for a React component: the same input point for the component's life, always calling the latest `handle`. */
export function useScanInput(handle: ScanHandler): ScanInputPoint {
  const latest = useRef(handle);
  useEffect(() => {
    latest.current = handle;
  });
  return useMemo(() => createScanInput((reading, source) => latest.current(reading, source)), []);
}
