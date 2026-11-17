import { FINE_MESSAGES, SETTLE_AT_RETURN_MINUTES } from "@libras/shared";
import type { SettleFineRequest, SettleFineResponse } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { createAuditLog } from "../audit/index.ts";
import type { Identity } from "../auth/auth-provider.ts";
import { withTransaction } from "../db.ts";
import { deskMember } from "../desk/members.ts";
import { useDeskSession } from "../desk/sessions.ts";
import { AppError } from "../errors.ts";
import { lockMember } from "../loans/policy.ts";

/**
 * Settling a Fine (ADR 0010): a Librarian closes a Fine fixed at a return as
 * paid or waived. LIBRAS stores the outcome, the Librarian and the time, never
 * a payment. It happens in two places only, and the request says which:
 *
 * - `return`: on the return of the late Copy, by the Librarian who recorded that
 *   return (`fixed_by`), up to `SETTLE_AT_RETURN_MINUTES` after it. The Fine on
 *   screen is the one named; nobody else's Fine can be reached this way. A Fine
 *   whose Librarian is unknown (null `fixed_by`, see the migration) cannot be
 *   settled here.
 * - `desk_session`: in the desk session of the Fine's Member (ADR 0008), for as
 *   long as the session lasts. This is the place for a Fine left unsettled at its
 *   return and for earlier ones listed in the Member panel.
 *
 * A Fine that is not there for the Librarian (no such Fine, another Member's,
 * another Librarian's return) is refused the same way (404 `fine_not_found`).
 * A settled Fine cannot be settled again (409 `fine_already_settled`).
 *
 * Locks, in the order every writer uses: the Member's row, then the Fine's. The
 * update itself is guarded by `settled_at is null`, so two settlements at the
 * same moment give one winner whatever happens to the locks.
 */

type Deps = Pick<AppDeps, "db" | "clock">;

interface FineRow {
  fixed_by: string | null;
  fixed_at: Date;
  amount_centavos: number;
  settled_at: Date | null;
}

const notFound = () => new AppError(404, "fine_not_found", FINE_MESSAGES.notFound);
const alreadySettled = () => new AppError(409, "fine_already_settled", FINE_MESSAGES.alreadySettled);
const settleAtReturnEnded = () => new AppError(409, "settle_at_return_ended", FINE_MESSAGES.returnSettleEnded);

export async function settleFine(deps: Deps, librarian: Identity, request: SettleFineRequest): Promise<SettleFineResponse> {
  // In a desk session the Member is the session's. It is renewed like for any Copy scanned, and refused when it is over.
  const sessionMember = request.place === "desk_session" ? await useDeskSession(deps, librarian.userId, request.deskSession) : undefined;

  // Who the Fine's Member is decides the lock, which must come first: read it, lock, then read the Fine again.
  const named = await deps.db.query<{ member_id: string }>("select member_id from public.fines where loan_id = $1", [request.loan]);
  const memberId = named.rows[0]?.member_id;
  if (memberId === undefined || (sessionMember !== undefined && memberId !== sessionMember)) throw notFound();

  const settlement = await withTransaction(deps.db, async (tx) => {
    await lockMember(tx, memberId);
    const { rows } = await tx.query<FineRow>(
      `select fixed_by, fixed_at, amount_centavos, settled_at
         from public.fines where loan_id = $1
          for update`,
      [request.loan],
    );
    const fine = rows[0];
    if (!fine) throw notFound();
    if (request.place === "return" && fine.fixed_by !== librarian.userId) throw notFound();
    if (fine.settled_at !== null) throw alreadySettled();
    const now = deps.clock.now();
    if (request.place === "return" && now.getTime() - fine.fixed_at.getTime() > SETTLE_AT_RETURN_MINUTES * 60_000) {
      throw settleAtReturnEnded();
    }
    const updated = await tx.query(
      `update public.fines set settled_outcome = $2, settled_by = $3, settled_at = $4
        where loan_id = $1 and settled_at is null`,
      [request.loan, request.outcome, librarian.userId, now],
    );
    if (updated.rowCount !== 1) throw alreadySettled();
    // Last in the transaction, so a failed write leaves nothing in the audit log.
    await createAuditLog(deps).record(
      {
        type: "fine_settled",
        actorId: librarian.userId,
        subject: request.loan,
        data: { memberId, outcome: request.outcome, amountCentavos: fine.amount_centavos, place: request.place },
      },
      tx,
    );
    return { outcome: request.outcome, settledAt: now.toISOString() };
  });

  return { loanId: request.loan, settlement, member: await deskMember(deps.db, librarian, memberId) };
}
