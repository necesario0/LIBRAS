import { ACCOUNT_TYPE_LABELS, counted, formatLibraryDate, formatPesos, totalOwedCentavos } from "@libras/shared";
import type { Clearance, DeskMember, FineOutcome, SettleFineResponse, UnsettledFine } from "@libras/shared";
import { FineActions } from "./FineActions.tsx";
import { FinePanel } from "./FinePanel.tsx";

function initialsOf(fullName: string): string {
  const parts = fullName.split(" ").filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** What stands in the way of Clearance, in a line: "2 Loans still out (1 overdue); 1 unsettled Fine, PHP 5". */
function clearanceReasons({ loansOut, unsettledFines }: Clearance): string {
  const reasons: string[] = [];
  if (loansOut.length > 0) {
    const overdue = loansOut.filter((loan) => loan.overdue).length;
    reasons.push(`${counted(loansOut.length, "Loan")} still out${overdue > 0 ? ` (${overdue} overdue)` : ""}`);
  }
  if (unsettledFines.length > 0) {
    reasons.push(`${counted(unsettledFines.length, "unsettled Fine")}, ${formatPesos(totalOwedCentavos({ unsettledFines }))}`);
  }
  return reasons.join("; ");
}

/**
 * Settles one of the Member's Fines in their desk session. Resolves with the
 * settlement (undefined when the Librarian's session is gone) and rejects with
 * the reason to show.
 */
export type SettleMemberFine = (fine: UnsettledFine, outcome: FineOutcome) => Promise<SettleFineResponse | undefined>;

/**
 * Who the scanned Digital ID belongs to: name, Account Type, and Loans against
 * the Loan Policy limit, whether they are cleared and what stands in the way,
 * then the Fines they have not settled, each with Paid and Waived.
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
                {atLimit ? "Loan limit reached" : loans.inLibraryOnly ? "In-library only, same day" : `${loans.loanPeriodDays ?? 0}-day loan period`}
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
      <div className="member-card__clearance" data-testid="desk-member-clearance-line">
        <span className="member-card__clearance-label">Clearance</span>
        <span
          className={`member-card__clearance-status${member.clearance.cleared ? " member-card__clearance-status--cleared" : ""}`}
          data-testid="desk-member-clearance"
        >
          {member.clearance.cleared ? "Cleared" : "Not cleared"}
        </span>
        {!member.clearance.cleared && (
          <span className="member-card__clearance-reasons" data-testid="desk-member-clearance-reasons">
            {clearanceReasons(member.clearance)}
          </span>
        )}
      </div>
      {member.clearance.unsettledFines.length > 0 && (
        <div className="member-card__fines" data-testid="desk-member-fines">
          <h3 className="member-card__fines-title">Unsettled Fines</h3>
          <ul className="member-card__fine-list">
            {member.clearance.unsettledFines.map((fine) => (
              <li key={fine.loanId}>
                <FinePanel
                  testId="desk-member-fine"
                  heading="h4"
                  title={<strong className="notice-panel__name">{fine.bookTitle}</strong>}
                  reason={`Copy ${fine.accessionNumber} - ${counted(fine.daysLate, "day")} late, returned ${formatLibraryDate(fine.returnedAt)}`}
                  amountCentavos={fine.amountCentavos}
                  actions={
                    <FineActions
                      amountCentavos={fine.amountCentavos}
                      memberName={member.fullName}
                      testId="desk-member-fine"
                      settle={(outcome) => settleFine(fine, outcome)}
                    />
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
