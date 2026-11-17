import { SIGN_UP_MESSAGES } from "@libras/shared";
import type { z } from "zod";
import { AppError } from "./errors.ts";

/**
 * Checks a request body against a shared schema. Responds 400
 * `invalid_request` with `message` when it does not fit. The caller writes the
 * message because only the route knows what the person should do next.
 */
export function parseBody<Schema extends z.ZodType>(schema: Schema, body: unknown, message: string): z.infer<Schema> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError(400, "invalid_request", message);
  return parsed.data;
}

const PASSWORD_RULE_MESSAGES: ReadonlySet<string> = new Set([SIGN_UP_MESSAGES.passwordTooShort, SIGN_UP_MESSAGES.passwordTooLong]);

/**
 * The refusal for a new password that breaks the sign-up rules: 400
 * `invalid_password` carrying the rule's own message, so the person is told what
 * to fix. Undefined when the field passed or failed some other way: the caller
 * then answers with its own `invalid_request`. Used wherever a request sets a
 * password after sign-up (Forgot password, Change password).
 */
export function passwordRuleRefusal(error: z.ZodError, field: string): AppError | undefined {
  const message = error.issues.find((issue) => issue.path[0] === field)?.message;
  return message !== undefined && PASSWORD_RULE_MESSAGES.has(message) ? new AppError(400, "invalid_password", message) : undefined;
}
