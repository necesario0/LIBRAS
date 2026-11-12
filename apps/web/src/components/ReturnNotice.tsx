import { formatLibraryDate, formatLibraryDateTime } from "@libras/shared";
import type { ReturnedLoan } from "@libras/shared";

/**
 * The return the desk has just recorded: which Book and Copy came back, who had
 * it, and the day it was returned. A Copy that came back after its due day says
 * so; Tier 1 charges nothing for it. When the Copy is now set aside for a Hold,
 * a second panel tells the Librarian for which Member and until when, so the
 * Copy goes on the hold shelf and not back on the stacks.
 */
export function ReturnNotice({ loan }: { loan: ReturnedLoan }) {
  return (
    <section className="return-notice" aria-label="Return recorded" data-testid="desk-return">
      <div className="loan-notice">
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
      </div>
      {loan.heldFor && (
        <div className="hold-shelf" data-testid="desk-return-held">
          <svg className="hold-shelf__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 2h12a1 1 0 0 1 1 1v19l-7-4.4L5 22V3a1 1 0 0 1 1-1z" />
          </svg>
          <div className="hold-shelf__text">
            <h3 className="hold-shelf__title">
              {"Set aside for "}
              <strong className="hold-shelf__member" data-testid="desk-return-held-member">
                {loan.heldFor.memberName}
              </strong>
            </h3>
            <span className="hold-shelf__body">Put this Copy on the hold shelf, not back on the stacks. Only this Member can borrow it.</span>
          </div>
          <div className="hold-shelf__until">
            <span className="hold-shelf__until-label">Pickup Window ends</span>
            <span className="hold-shelf__until-date" data-testid="desk-return-held-until">
              {formatLibraryDateTime(loan.heldFor.pickupEndsAt)}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
