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
