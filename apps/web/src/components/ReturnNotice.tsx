import { formatLibraryDate } from "@libras/shared";
import type { ReturnedLoan } from "@libras/shared";

/**
 * The return the desk has just recorded: which Book and Copy came back, who had
 * it, and the day it was returned. A Copy that came back after its due day says
 * so; Tier 1 charges nothing for it.
 */
export function ReturnNotice({ loan }: { loan: ReturnedLoan }) {
  return (
    <section className="loan-notice" aria-label="Return recorded" data-testid="desk-return">
      <svg className="loan-notice__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9.2 16.6 4.9 12.3l-1.4 1.4 5.7 5.7L20.5 8.1l-1.4-1.4z" />
      </svg>
      <div className="loan-notice__text">
        <h2 className="loan-notice__title">{loan.bookTitle}</h2>
        <span className="loan-notice__copy">{`Copy ${loan.accessionNumber}`}</span>
        <span className="loan-notice__copy">
          {"Borrowed by "}
          <strong className="loan-notice__member" data-testid="desk-return-member">
            {loan.memberName}
          </strong>
        </span>
        {loan.late && (
          <span className="loan-notice__late" data-testid="desk-return-late">
            {`Returned late - was due ${formatLibraryDate(loan.dueAt)}`}
          </span>
        )}
      </div>
      <div className="loan-notice__due">
        <span className="loan-notice__due-label">Returned</span>
        <span className="loan-notice__due-date" data-testid="desk-return-date">
          {formatLibraryDate(loan.returnedAt)}
        </span>
      </div>
    </section>
  );
}
