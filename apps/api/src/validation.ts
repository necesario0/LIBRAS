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

/**
 * The refusal for a new password that breaks the sign-up rules
 * (`passwordSchema`: a string of 8 to 72 characters): 400 `invalid_password`
 * carrying the rule's own message, so the person is told what to fix. The rule
 * is told by the zod issue itself (a string too short or too long), not by its
 * words. Undefined when the field passed or failed some other way, such as a
 * missing field or one that is not a string: the caller then answers with its
 * own `invalid_request`. Used wherever a request sets a password after sign-up
 * (Forgot password, Change password).
 */
export function passwordRuleRefusal(error: z.ZodError, field: string): AppError | undefined {
  const issue = error.issues.find((candidate) => candidate.path[0] === field);
  if (issue === undefined) return undefined;
  const lengthRule = (issue.code === "too_small" || issue.code === "too_big") && issue.origin === "string";
  return lengthRule ? new AppError(400, "invalid_password", issue.message) : undefined;
}
