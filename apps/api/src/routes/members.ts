import { Router } from "express";
import {
  ACCOUNT_DELETION_MESSAGES,
  PASSWORD_CHANGE_MESSAGES,
  SIGN_UP_MESSAGES,
  changePasswordSchema,
  deleteAccountSchema,
  resendSignUpCodeRequestSchema,
  signInRequestSchema,
  signUpRequestSchema,
  verifySignUpRequestSchema,
} from "@libras/shared";
import type { ClearanceResponse, MemberLoanPolicyResponse, MemberMeResponse, VerifySignUpResponse } from "@libras/shared";
import type { z } from "zod";
import type { AppDeps } from "../app.ts";
import { createAuditLog, recordingSignInFailures } from "../audit/index.ts";
import { accessTokenOf, identityOf, memberOf, requireMember } from "../auth/guards.ts";
import { withIdentity } from "../auth/identity.ts";
import type { AttemptLimiter } from "../auth/attempt-limit.ts";
import { AppError } from "../errors.ts";
import { memberPolicy } from "../loans/policy.ts";
import { changeMemberPassword, verifyCurrentPassword } from "../members/change-password.ts";
import { deleteMemberAccount, verifyDeletionPassword } from "../members/delete-account.ts";
import { recordPasswordEvent } from "../members/password-audit.ts";
import { signInMember } from "../members/sign-in.ts";
import { resendSignUpCode, startSignUp, verifySignUp } from "../members/sign-up.ts";
import { clearanceOf, goodStandingOf, readStanding } from "../standing/index.ts";
import { parseBody, passwordRuleRefusal } from "../validation.ts";

const KNOWN_MESSAGES: ReadonlySet<string> = new Set(Object.values(SIGN_UP_MESSAGES));

/**
 * Turns the first thing wrong with a sign-up into an error the person can act
 * on. A message written in the shared schemas is passed on as it is; anything
 * else gets a general one, so a validation library's wording never reaches a Member.
 */
function signUpRefusal(error: z.ZodError): AppError {
  const issue = error.issues[0];
  const message = issue !== undefined && KNOWN_MESSAGES.has(issue.message) ? issue.message : undefined;
  if (message === SIGN_UP_MESSAGES.umakEmailRequired) return new AppError(400, "umak_email_required", message);
  if (issue?.path[0] === "acceptedTerms") return new AppError(400, "terms_not_accepted", SIGN_UP_MESSAGES.termsRequired);
  return new AppError(400, "invalid_request", message ?? "Check what you entered and try again.");
}

/** Sign-up, sign-in, the Member's own profile, their Clearance, and their account's settings (Delete my account included). */
export function membersRouter(deps: AppDeps, limiter: AttemptLimiter): Router {
  const router = Router();
  const audit = createAuditLog(deps);

  router.post("/members/sign-in", async (req, res) => {
    const { email, password } = parseBody(signInRequestSchema, req.body, "Enter your email and password.");
    const attempt = { portal: "member", email, clientAddress: req.ip } as const;
    res.json(
      await limiter.attempt(req.ip, () =>
        recordingSignInFailures({ audit, logger: deps.logger }, attempt, () => signInMember(deps, email, password)),
      ),
    );
  });

  router.post("/members/sign-up", async (req, res) => {
    const parsed = signUpRequestSchema.safeParse(req.body);
    if (!parsed.success) throw signUpRefusal(parsed.error);

    res.status(201).json(await startSignUp(deps, parsed.data));
  });

  router.post("/members/sign-up/verify", async (req, res) => {
    const { email, code } = parseBody(verifySignUpRequestSchema, req.body, SIGN_UP_MESSAGES.codeInvalid);
    const body: VerifySignUpResponse = { member: await verifySignUp(deps, email, code) };
    res.json(body);
  });

  router.post("/members/sign-up/resend", async (req, res) => {
    const { email } = parseBody(resendSignUpCodeRequestSchema, req.body, SIGN_UP_MESSAGES.emailInvalid);
    res.json(await resendSignUpCode(deps, email));
  });

  router.get("/members/me", ...requireMember(deps), (_req, res) => {
    const body: MemberMeResponse = { member: memberOf(res) };
    res.json(body);
  });

  // Read as the Member, so row-level security shows only their own Loans and Fines.
  router.get("/members/me/clearance", ...requireMember(deps), async (_req, res) => {
    const identity = identityOf(res);
    const standing = await withIdentity(deps.db, identity, (scope) => readStanding(scope, identity.userId, deps.clock.now()));
    const body: ClearanceResponse = { clearance: clearanceOf(standing), goodStanding: goodStandingOf(standing) };
    res.json(body);
  });

  // Read as the Member: row-level security lets them read their own row and the policy of their Account Type.
  router.get("/members/me/loan-policy", ...requireMember(deps), async (_req, res) => {
    const identity = identityOf(res);
    const policy = await withIdentity(deps.db, identity, (scope) => memberPolicy(scope, identity.userId, { lock: false }));
    const body: MemberLoanPolicyResponse = {
      accountType: policy.account_type,
      loanLimit: policy.loan_limit,
      loanPeriodDays: policy.loan_period_days,
      renewalLimit: policy.renewal_limit,
      fineDailyRateCentavos: policy.fine_daily_rate_centavos,
      fineCapCentavos: policy.fine_cap_centavos,
    };
    res.json(body);
  });

  // "Sign out of all devices": Supabase Auth ends every session, the caller's included, so the Member signs in again.
  router.post("/members/me/sign-out-all", ...requireMember(deps), async (req, res) => {
    await deps.auth.signOutEverywhere(accessTokenOf(res));
    await recordPasswordEvent(deps, { type: "signed_out_all_devices", memberId: memberOf(res).id, clientAddress: req.ip });
    res.status(204).end();
  });

  // Delete my account (ADR 0011). POST with a body, not DELETE: the password travels in the body.
  router.post("/members/me/delete", ...requireMember(deps), async (req, res) => {
    const { password } = parseBody(deleteAccountSchema, req.body, ACCOUNT_DELETION_MESSAGES.invalidRequest);
    const request = { member: memberOf(res), password, clientAddress: req.ip };
    // A wrong password counts like a failed sign-in, through the same limiter. The deletion itself is outside it.
    await limiter.attempt(req.ip, () => verifyDeletionPassword(deps, request));
    await deleteMemberAccount(deps, request);
    res.status(204).end();
  });

  router.put("/members/me/password", ...requireMember(deps), async (req, res) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      // A new password that breaks the sign-up rules gets the rule; anything else is a bad request.
      throw (
        passwordRuleRefusal(parsed.error, "newPassword") ??
        new AppError(400, "invalid_request", PASSWORD_CHANGE_MESSAGES.invalidRequest)
      );
    }
    const change = {
      member: memberOf(res),
      accessToken: accessTokenOf(res),
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      clientAddress: req.ip,
    };
    // Only a wrong current password counts like a failed sign-in, and through the same limiter, so guessing it
    // here cannot get around the limit on the sign-in screen. Setting the new password is outside it: a session
    // that ended meanwhile (401) is not a guess.
    await limiter.attempt(req.ip, () => verifyCurrentPassword(deps, change));
    await changeMemberPassword(deps, change);
    res.status(204).end();
  });

  return router;
}
