import { Router } from "express";
import {
  SIGN_UP_MESSAGES,
  changePasswordSchema,
  resendSignUpCodeRequestSchema,
  signInRequestSchema,
  signUpRequestSchema,
  verifySignUpRequestSchema,
} from "@libras/shared";
import type { MemberMeResponse, VerifySignUpResponse } from "@libras/shared";
import type { z } from "zod";
import type { AppDeps } from "../app.ts";
import { createAuditLog, recordingSignInFailures } from "../audit/index.ts";
import { bearerToken, memberOf, requireMember } from "../auth/guards.ts";
import type { AttemptLimiter } from "../auth/attempt-limit.ts";
import { AppError } from "../errors.ts";
import { changeMemberPassword } from "../members/change-password.ts";
import { signInMember } from "../members/sign-in.ts";
import { resendSignUpCode, startSignUp, verifySignUp } from "../members/sign-up.ts";
import { parseBody } from "../validation.ts";

const PASSWORD_MESSAGES: ReadonlySet<string> = new Set([SIGN_UP_MESSAGES.passwordTooShort, SIGN_UP_MESSAGES.passwordTooLong]);
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

/** Sign-up, sign-in and the Member's own profile. */
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

  router.put("/members/me/password", ...requireMember(deps), async (req, res) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      // A new password that breaks the sign-up rules gets the rule; anything else is a bad request.
      const message = parsed.error.issues.find((issue) => issue.path[0] === "newPassword")?.message;
      if (message !== undefined && PASSWORD_MESSAGES.has(message)) throw new AppError(400, "invalid_password", message);
      throw new AppError(400, "invalid_request", "Enter your current password and a new one.");
    }
    const member = memberOf(res);
    const accessToken = bearerToken(req.get("authorization"));
    if (accessToken === undefined) throw new Error("requireMember let a request through without an access token");
    // A wrong current password counts like a failed sign-in: the same limiter, so guessing it here
    // cannot get around the limit on the sign-in screen.
    await limiter.attempt(req.ip, () =>
      changeMemberPassword(deps, {
        accessToken,
        memberId: member.id,
        email: member.email,
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        clientAddress: req.ip,
      }),
    );
    res.status(204).end();
  });

  return router;
}
