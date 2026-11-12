import { ACCOUNT_TYPE_LABELS } from "@libras/shared";
import type { DeskMember } from "@libras/shared";

function initialsOf(fullName: string): string {
  const parts = fullName.split(" ").filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Who the scanned Digital ID belongs to: name, Account Type, and Loans against the Loan Policy limit. */
export function MemberCard({ member }: { member: DeskMember }) {
  const { loans } = member;
  const canBorrow = loans.limit > 0;
  const atLimit = canBorrow && loans.current >= loans.limit;

  return (
    <section className="member-card" aria-label={member.fullName}>
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
    </section>
  );
}
