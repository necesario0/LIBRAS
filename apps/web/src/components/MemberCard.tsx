import { ACCOUNT_TYPE_LABELS, formatLibraryDate, formatPesos } from "@libras/shared";
import type { DeskFine, DeskMember, FineOutcome } from "@libras/shared";
import { FineActions } from "./FineActions.tsx";

function initialsOf(fullName: string): string {
  const parts = fullName.split(" ").filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Settles one of the Member's Fines in their desk session. Rejects with the reason to show; resolves once it is settled. */
export type SettleMemberFine = (fine: DeskFine, outcome: FineOutcome) => Promise<void>;

/**
 * Who the scanned Digital ID belongs to: name, Account Type, and Loans against
 * the Loan Policy limit, then the Fines they have not settled, each with Paid
 * and Waived.
 */
export function MemberCard({ member, settleFine }: { member: DeskMember; settleFine: SettleMemberFine }) {
  const { loans } = member;
  const canBorrow = loans.limit > 0;
  const atLimit = canBorrow && loans.current >= loans.limit;

  return (
    <section className="member-card" aria-label={member.fullName}>
      <div className="member-card__head">
        <div className="member-card__who">
          <span className="member-card__avatar" aria-hidden="true">
            {initialsOf(member.fullName)}
          </span>
          <div className="member-card__names">
            <h2 className="member-card__name">{member.fullName}</h2>
            <span className="member-card__type">{ACCOUNT_TYPE_LABELS[member.accountType]}</span>
          </div>
        </div>
        <div className={`member-card__loans${atLimit || !canBorrow ? " member-card__loans--blocked" : ""}`}>
          <span className="member-card__loans-label">Loans</span>
          {canBorrow ? (
            <>
              <span className="member-card__loans-count" data-testid="desk-member-loans">
                {`${loans.current} of ${loans.limit}`}
              </span>
              <span className="member-card__loans-note">
                {atLimit ? "Loan limit reached" : `${loans.loanPeriodDays ?? 0}-day loan period`}
              </span>
            </>
          ) : (
            <>
              <span className="member-card__loans-count" data-testid="desk-member-loans">
                Cannot borrow
              </span>
              <span className="member-card__loans-note">{`${ACCOUNT_TYPE_LABELS[member.accountType]} accounts have a limit of 0`}</span>
            </>
          )}
        </div>
      </div>
      {member.unsettledFines.length > 0 && (
        <div className="member-card__fines" data-testid="desk-member-fines">
          <h3 className="member-card__fines-title">Unsettled Fines</h3>
          <ul className="member-card__fine-list">
            {member.unsettledFines.map((fine) => (
              <li className="return-panel return-panel--fine" key={fine.loanId} data-testid="desk-member-fine">
                <svg className="return-panel__icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
                <div className="return-panel__text">
                  <h4 className="return-panel__title">
                    <strong className="return-panel__name">{fine.bookTitle}</strong>
                  </h4>
                  <span className="return-panel__body">
                    {`Copy ${fine.accessionNumber} - ${fine.daysLate} ${fine.daysLate === 1 ? "day" : "days"} late, returned ${formatLibraryDate(fine.returnedAt)}`}
                  </span>
                </div>
                <div className="return-panel__side">
                  <span className="return-panel__side-label">Fine</span>
                  <span className="return-panel__amount" data-testid="desk-member-fine-amount">
                    {formatPesos(fine.amountCentavos)}
                  </span>
                </div>
                <div className="return-panel__actions">
                  <FineActions
                    amountCentavos={fine.amountCentavos}
                    memberName={member.fullName}
                    testId="desk-member-fine"
                    settle={(outcome) => settleFine(fine, outcome)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
