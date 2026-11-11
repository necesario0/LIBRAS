import { useState } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/** A password input with the show/hide eye from the mobile designs. */
export function PasswordField({ value, onChange }: Props) {
  const [shown, setShown] = useState(false);
  return (
    <div className="field">
      <input
        className="field__input"
        type={shown ? "text" : "password"}
        name="password"
        autoComplete="current-password"
        placeholder="Password"
        aria-label="Password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        className="field__toggle"
        type="button"
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        onClick={() => setShown(!shown)}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {!shown && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  );
}
