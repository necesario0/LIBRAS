import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { SCAN_INPUT_MAX_LENGTH } from "@libras/shared";
import type { ScanInputPoint } from "./scan-input.ts";

/** A key that can be part of a scanned code (a space or Enter on a focused button must still press it). */
const SCAN_KEY = /^[0-9A-Za-z-]$/;

interface Props {
  input: ScanInputPoint;
  busy: boolean;
  /** What the desk expects next, shown in the empty field. */
  placeholder: string;
  /** When this changes the field takes the focus back, as after a click on a button elsewhere on the page. */
  focusKey?: unknown;
}

/**
 * The keyboard source of the scan input point. A USB barcode scanner types the
 * code into this field and presses Enter; so can a person. The field keeps the
 * focus, so a scan never needs a click first, and empties after each scan.
 */
export function ScanField({ input, busy, placeholder, focusKey }: Props) {
  const [text, setText] = useState("");
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!busy) field.current?.focus();
  }, [busy, focusKey]);

  // A scanner types without looking at where the focus is. After a click on Paid or Waived the focused
  // button goes away or stays, and the first character of the next scan would be lost or land on the button.
  // A character that can be part of a scanned code, typed with the focus anywhere else, moves the focus here first.
  useEffect(() => {
    const catchScan = (event: KeyboardEvent) => {
      if (busy || event.ctrlKey || event.metaKey || event.altKey || !SCAN_KEY.test(event.key)) return;
      if (document.activeElement !== field.current) field.current?.focus();
    };
    document.addEventListener("keydown", catchScan, true);
    return () => document.removeEventListener("keydown", catchScan, true);
  }, [busy]);

  function submit(event: FormEvent) {
    event.preventDefault();
    input.submit(text, "keyboard");
    setText("");
  }

  return (
    <form className="scan-field" onSubmit={submit} role="search">
      <label className="scan-field__label" htmlFor="scan-input">
        Scan or type a code
      </label>
      <div className="field scan-field__box">
        <svg className="scan-field__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 5h2v14H3zm4 0h1v14H7zm3 0h2v14h-2zm4 0h1v14h-1zm3 0h1v14h-1zm3 0h1v14h-1z" />
        </svg>
        <input
          ref={field}
          id="scan-input"
          className="field__input scan-field__input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          maxLength={SCAN_INPUT_MAX_LENGTH * 2}
          placeholder={placeholder}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => {
            // Keep the scanner's target: give the focus back unless the Librarian moved it to a control.
            requestAnimationFrame(() => {
              const active = document.activeElement;
              if (active === null || active === document.body) field.current?.focus();
            });
          }}
        />
        <kbd className="scan-field__enter" aria-hidden="true">
          Enter
        </kbd>
      </div>
    </form>
  );
}
