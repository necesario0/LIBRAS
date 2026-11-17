import { useState } from "react";
import { formatLibraryDate, formatLibraryDateTime, formatPesos } from "@libras/shared";
import type { FineOutcome, FineSettlement, LoanFine, ReturnedLoan, SettleFineResponse } from "@libras/shared";
import { FineActions } from "./FineActions.tsx";
import { FinePanel } from "./FinePanel.tsx";

/**
 * The return the desk has just recorded: which Book and Copy came back, who had
 * it, the day it was returned, and whether that was on time or late against its
 * due date (the current one, after any Renewal: the date the Member saw). A
 * late Copy's Fine, fixed by this return, gets a panel with the Member's name,
 * how late it was and the amount, so the Librarian can tell the Member. When the
 * Copy is now set aside for a Hold, a panel tells the Librarian for which Member
 * and until when, so the Copy goes on the hold shelf and not back on the stacks.
 * The Fine can be settled right here as paid or waived, or left for later when
 * the Member is not at the desk.
 */
export function ReturnNotice({ loan, settleFine }: { loan: ReturnedLoan; settleFine: SettleReturnFine }) {
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
          {loan.late ? (
            <span className="loan-notice__late" data-testid="desk-return-late">
              {`Returned late - was due ${formatLibraryDate(loan.dueAt)}`}
            </span>
          ) : (
            <span className="loan-notice__copy" data-testid="desk-return-due">
              {`Returned on time - due ${formatLibraryDate(loan.dueAt)}`}
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
      {loan.fine && <ReturnFine key={loan.id} fine={loan.fine} memberName={loan.memberName} settle={(outcome) => settleFine(loan, outcome)} />}
      {loan.heldFor && (
        <div className="return-panel return-panel--hold" data-testid="desk-return-held">
          <svg className="return-panel__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 2h12a1 1 0 0 1 1 1v19l-7-4.4L5 22V3a1 1 0 0 1 1-1z" />
          </svg>
          <div className="return-panel__text">
            <h3 className="return-panel__title">
              {"Set aside for "}
              <strong className="return-panel__name" data-testid="desk-return-held-member">
                {loan.heldFor.memberName}
              </strong>
            </h3>
            <span className="return-panel__body">Put this Copy on the hold shelf, not back on the stacks. Only this Member can borrow it.</span>
          </div>
          <div className="return-panel__side">
            <span className="return-panel__side-label">Pickup Window ends</span>
            <span className="return-panel__side-value" data-testid="desk-return-held-until">
              {formatLibraryDateTime(loan.heldFor.pickupEndsAt)}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

/** "3 days late, at PHP 5 a day." or, once it reached the cap, "75 days late, at PHP 5 a day, up to the cap of PHP 300." */
function fineReason(fine: LoanFine): string {
  const days = `${fine.daysLate} ${fine.daysLate === 1 ? "day" : "days"} late, at ${formatPesos(fine.dailyRateCentavos)} a day`;
  const capped = fine.amountCentavos < fine.daysLate * fine.dailyRateCentavos;
  return capped ? `${days}, up to the cap of ${formatPesos(fine.capCentavos)}.` : `${days}.`;
}

/**
 * Settles the Fine of a return as the Librarian chose, in the place of that
 * return. Resolves with the settlement (undefined when the Librarian's session
 * is gone) and rejects with the reason to show.
 */
export type SettleReturnFine = (loan: ReturnedLoan, outcome: FineOutcome) => Promise<SettleFineResponse | undefined>;

interface ReturnFineProps {
  fine: LoanFine;
  memberName: string;
  settle: (outcome: FineOutcome) => Promise<SettleFineResponse | undefined>;
}

/** The Fine a late return fixed: whose it is, why, how much, and Paid and Waived (or how it was settled). */
function ReturnFine({ fine, memberName, settle }: ReturnFineProps) {
  const [settlement, setSettlement] = useState<FineSettlement | null>(fine.settlement);
  return (
    <FinePanel
      testId="desk-return-fine"
      heading="h3"
      title={
        <>
          {"Fine for "}
          <strong className="return-panel__name" data-testid="desk-return-fine-member">
            {memberName}
          </strong>
        </>
      }
      reason={fineReason(fine)}
      amountCentavos={fine.amountCentavos}
      actions={
        settlement ? (
          <span className="return-panel__settled" data-testid="desk-return-fine-settled">
            {`Settled: ${settlement.outcome}`}
          </span>
        ) : (
          <FineActions
            amountCentavos={fine.amountCentavos}
            memberName={memberName}
            hint="Member not here? Leave it. Scan their Digital ID later to settle it."
            testId="desk-return-fine"
            settle={async (outcome) => {
              const settled = await settle(outcome);
              if (settled) setSettlement(settled.settlement);
            }}
          />
        )
      }
    />
  );
}
