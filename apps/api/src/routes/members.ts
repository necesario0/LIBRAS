import { Router } from "express";
import {
  ACCOUNT_TYPE_LABELS,
  SIGN_UP_MESSAGES,
  accountTypeSchema,
  hasSignUpForm,
  resendSignUpCodeRequestSchema,
  signUpRequestSchema,
  verifySignUpRequestSchema,
} from "@libras/shared";
import type { MemberMeResponse, VerifySignUpResponse } from "@libras/shared";
import type { z } from "zod";
import type { AppDeps } from "../app.ts";
import { memberOf, requireMember } from "../auth/guards.ts";
import { AppError } from "../errors.ts";
import { resendSignUpCode, startSignUp, verifySignUp } from "../members/sign-up.ts";
import { parseBody } from "../validation.ts";

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

/** Sign-up and the Member's own profile. Sign-in for Members is added by the ticket that builds it. */
export function membersRouter(deps: AppDeps): Router {
  const router = Router();

  router.post("/members/sign-up", async (req, res) => {
    // An Account Type whose form is not built yet is refused by name, not as a malformed request.
    const accountType = accountTypeSchema.safeParse((req.body as { accountType?: unknown } | undefined)?.accountType);
    if (accountType.success && !hasSignUpForm(accountType.data)) {
      throw new AppError(
        400,
        "account_type_unavailable",
        `Sign-up for ${ACCOUNT_TYPE_LABELS[accountType.data]} is not available yet.`,
      );
    }
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

  return router;
}
