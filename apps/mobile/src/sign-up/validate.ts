import { SIGN_UP_MESSAGES } from "@libras/shared";

const SHARED_MESSAGES: ReadonlySet<string> = new Set(Object.values(SIGN_UP_MESSAGES));

/** Anything with the shape of a zod schema's `safeParse`. */
interface Checkable {
  safeParse(value: unknown): { success: true } | { success: false; error: { issues: readonly { message: string }[] } };
}

/**
 * Checks one field against a shared schema. Returns the message to show under
 * the field, or undefined when the value is fine. Only wording written in
 * `@libras/shared` is shown; anything else becomes a general line.
 */
export function check(schema: Checkable, value: unknown): string | undefined {
  const result = schema.safeParse(value);
  if (result.success) return undefined;
  const message = result.error.issues[0]?.message;
  return message !== undefined && SHARED_MESSAGES.has(message) ? message : "Check this field and try again.";
}
