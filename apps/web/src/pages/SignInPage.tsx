import { useState } from "react";
import type { FormEvent } from "react";
import type { StaffProfile } from "@libras/shared";
import { ApiError, signIn } from "../api.ts";
import { Brand } from "../components/Brand.tsx";
import { PasswordField } from "../components/PasswordField.tsx";
import openBook from "../assets/open-book.png";

export function SignInPage({ onSignedIn }: { onSignedIn: (staff: StaffProfile) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      onSignedIn(await signIn(email, password));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="sign-in">
      <aside className="sign-in__aside" aria-hidden="true">
        <div className="sign-in__illustration">
          <img src={openBook} alt="" />
        </div>
        <p className="sign-in__tagline">The library for problem solver</p>
      </aside>
      <section className="sign-in__panel">
        <form className="sign-in__form" onSubmit={submit} noValidate>
          <Brand />
          <h1 className="sign-in__title">Librarian desk</h1>
          <p className="sign-in__lede">Sign in with your library staff account. Members sign in on the LIBRAS app.</p>
          <div className="field">
            <input
              className="field__input"
              type="email"
              name="email"
              autoComplete="username"
              placeholder="Email"
              aria-label="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <PasswordField value={password} onChange={setPassword} />
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <button className="button" type="submit" disabled={busy}>
            {busy ? "Signing in..." : "Continue"}
          </button>
        </form>
      </section>
    </main>
  );
}
