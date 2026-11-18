import { Router } from "express";
import {
  SIGN_UP_MESSAGES,
  checkPasswordResetCodeSchema,
  completePasswordResetSchema,
  requestPasswordResetSchema,
} from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { RequestLimiter } from "../auth/request-limit.ts";
import { AppError } from "../errors.ts";
import {
  DEFAULT_PASSWORD_RESET_LIMIT,
  checkPasswordResetCode,
  completePasswordReset,
  requestPasswordReset,
} from "../members/password-reset.ts";
import type { PasswordResetLimit } from "../members/password-reset.ts";
import { parseBody, passwordRuleRefusal } from "../validation.ts";

/** Forgot password: request a code, check it, then set the new password with it. Members only. */
export function passwordResetRouter(appDeps: AppDeps, limit: PasswordResetLimit = DEFAULT_PASSWORD_RESET_LIMIT): Router {
  const router = Router();
  const deps = { ...appDeps, limit };
  // In memory: it only slows one address flooding many inboxes, and a restart gives that address one fresh start.
  // The limits that protect one email and its account are in the database (`requestPasswordReset`, `matchCode`).
  const perAddress = new RequestLimiter(deps.clock, limit.perClientAddress, "code requests");

  router.post("/members/password-reset", async (req, res) => {
    const { email } = parseBody(requestPasswordResetSchema, req.body, SIGN_UP_MESSAGES.emailInvalid);
    perAddress.admit(req.ip ?? "unknown");
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
