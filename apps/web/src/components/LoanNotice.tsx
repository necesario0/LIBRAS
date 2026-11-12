import { formatLibraryDate } from "@libras/shared";
import type { DeskLoan } from "@libras/shared";

/** The Loan the desk has just confirmed: which Book and Copy went out, and the day it is due. */
export function LoanNotice({ loan }: { loan: DeskLoan }) {
  return (
    <section className="loan-notice" aria-label="Loan confirmed" data-testid="desk-loan">
      <svg className="loan-notice__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9.2 16.6 4.9 12.3l-1.4 1.4 5.7 5.7L20.5 8.1l-1.4-1.4z" />
      </svg>
      <div className="loan-notice__text">
        <h2 className="loan-notice__title">{loan.bookTitle}</h2>
        <span className="loan-notice__copy">{`Copy ${loan.accessionNumber}`}</span>
      </div>
      <div className="loan-notice__due">
        <span className="loan-notice__due-label">Due</span>
        <span className="loan-notice__due-date" data-testid="desk-loan-due">
          {formatLibraryDate(loan.dueAt)}
        </span>
      </div>
    </section>
  );
}
