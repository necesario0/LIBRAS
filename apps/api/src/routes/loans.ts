import { Router } from "express";
import { LOAN_MESSAGES, confirmLoanRequestSchema } from "@libras/shared";
import type { ConfirmLoanResponse, MyLoansResponse } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { identityOf, requireLibrarian, requireMember } from "../auth/guards.ts";
import { deskMember } from "../desk/members.ts";
import { confirmLoan, listLoans } from "../loans/index.ts";
import { parseBody } from "../validation.ts";

/** Loans: a Librarian confirms one at the desk, and a Member reads their own. */
export function loansRouter(deps: AppDeps): Router {
  const router = Router();

  router.post("/desk/loans", ...requireLibrarian(deps), async (req, res) => {
    const request = parseBody(confirmLoanRequestSchema, req.body, LOAN_MESSAGES.invalidRequest);
    const { loan, memberId } = await confirmLoan(deps, identityOf(res), request);
    const body: ConfirmLoanResponse = { loan, member: await deskMember(deps.db, identityOf(res), memberId) };
    res.status(201).json(body);
  });

  router.get("/members/me/loans", ...requireMember(deps), async (_req, res) => {
    const body: MyLoansResponse = await listLoans(deps, identityOf(res));
    res.json(body);
  });

  return router;
}
