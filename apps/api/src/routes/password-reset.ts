import { Router } from "express";
import {
  SIGN_UP_MESSAGES,
  checkPasswordResetCodeSchema,
  completePasswordResetSchema,
  requestPasswordResetSchema,
} from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { RequestLimiter } from "../auth/request-limit.ts";
import type { RequestLimitOptions } from "../auth/request-limit.ts";
import { AppError } from "../errors.ts";
import { checkPasswordResetCode, completePasswordReset, requestPasswordReset } from "../members/password-reset.ts";
import { parseBody, passwordRuleRefusal } from "../validation.ts";

export interface PasswordResetLimit {
  /** Code requests from one client address, whatever the email. */
  perClientAddress: RequestLimitOptions;
  /** Code requests for one email, whoever asks. Counted for every email, so it says nothing about who has an account. */
  perEmail: RequestLimitOptions;
}

/**
 * Ten code requests in fifteen minutes from one address, and five an hour for
 * one email: enough for a Member whose emails are slow, too few to flood an inbox.
 */
export const DEFAULT_PASSWORD_RESET_LIMIT: PasswordResetLimit = {
  perClientAddress: { maxRequests: 10, windowMinutes: 15 },
  perEmail: { maxRequests: 5, windowMinutes: 60 },
};

/** Forgot password: request a code, check it, then set the new password with it. Members only. */
export function passwordResetRouter(deps: AppDeps, limit: PasswordResetLimit = DEFAULT_PASSWORD_RESET_LIMIT): Router {
  const router = Router();
  const perAddress = new RequestLimiter(deps.clock, limit.perClientAddress, "code requests");
  const perEmail = new RequestLimiter(deps.clock, limit.perEmail, "code requests for this email");

  router.post("/members/password-reset", async (req, res) => {
    const { email } = parseBody(requestPasswordResetSchema, req.body, SIGN_UP_MESSAGES.emailInvalid);
    perAddress.admit(req.ip ?? "unknown");
    perEmail.admit(email);
    res.json(await requestPasswordReset(deps, email));
  });

  router.post("/members/password-reset/check", async (req, res) => {
    const { email, code } = parseBody(checkPasswordResetCodeSchema, req.body, SIGN_UP_MESSAGES.codeInvalid);
    await checkPasswordResetCode(deps, email, code);
    res.status(204).end();
  });

  router.post("/members/password-reset/complete", async (req, res) => {
    const parsed = completePasswordResetSchema.safeParse(req.body);
    if (!parsed.success) {
      // A new password that breaks the sign-up rules gets the rule; anything else is a bad code.
      throw passwordRuleRefusal(parsed.error, "password") ?? new AppError(400, "invalid_request", SIGN_UP_MESSAGES.codeInvalid);
    }
    await completePasswordReset(deps, { ...parsed.data, clientAddress: req.ip });
    res.status(204).end();
  });

  return router;
}
