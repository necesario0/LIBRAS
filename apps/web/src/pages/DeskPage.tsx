import type { StaffProfile } from "@libras/shared";
import { Brand } from "../components/Brand.tsx";

interface Props {
  staff: StaffProfile;
  onSignOut: () => void;
}

/** The desk screen. Empty and ready for scanning: later tickets add the scan input, Loans and returns here. */
export function DeskPage({ staff, onSignOut }: Props) {
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
          <span className="desk__status">Waiting for a scan</span>
          <h1 className="desk__title" id="desk-title">
            Ready for scanning
          </h1>
          <p className="desk__hint">Scan a Member's Digital ID to start a Loan, or scan a Copy to record a return.</p>
        </section>
      </main>
    </div>
  );
}
