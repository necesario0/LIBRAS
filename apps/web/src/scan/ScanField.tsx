import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { SCAN_INPUT_MAX_LENGTH } from "@libras/shared";
import type { ScanInputPoint } from "./scan-input.ts";

interface Props {
  input: ScanInputPoint;
  busy: boolean;
}

/**
 * The keyboard source of the scan input point. A USB barcode scanner types the
 * code into this field and presses Enter; so can a person. The field keeps the
 * focus, so a scan never needs a click first, and empties after each scan.
 */
export function ScanField({ input, busy }: Props) {
  const [text, setText] = useState("");
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!busy) field.current?.focus();
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
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          maxLength={SCAN_INPUT_MAX_LENGTH * 2}
          placeholder="Digital ID, then Enter"
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
