import { randomUUID } from "node:crypto";
import type { Database } from "../src/db.ts";
import type { Logger } from "../src/logger.ts";

/**
 * Makes the database refuse audit entries of one event type, as a broken audit
 * write would: every time, or only the first time (a sequence counts the tries,
 * and a sequence is not rolled back with the refused insert). Returns the undo.
 */
export async function failAuditWrites(db: Database, eventType: string, times: "always" | "once"): Promise<() => Promise<void>> {
  const name = `libras_test_fail_audit_${randomUUID().replaceAll("-", "")}`;
  await db.query(`create sequence public.${name}`);
  await db.query(
    `create function public.${name}() returns trigger language plpgsql as $$
       begin
         if ${times === "always" ? "true" : `nextval('public.${name}') = 1`} then
           raise exception 'audit write refused for the test';
         end if;
         return new;
       end $$`,
  );
  await db.query(
    `create trigger a_${name} before insert on public.audit_log for each row
       when (new.event_type = '${eventType}') execute function public.${name}()`,
  );
  return async () => {
    await db.query(`drop trigger if exists a_${name} on public.audit_log`);
    await db.query(`drop function if exists public.${name}()`);
    await db.query(`drop sequence if exists public.${name}`);
  };
}

/** A logger that keeps what the API logs at error level, for a test to read. */
export function capturingLogger(): Logger & { errors: string[] } {
  const errors: string[] = [];
  return {
    errors,
    info: () => {},
    error: (message, error) => {
      errors.push(error instanceof Error ? `${message} ${error.message}` : message);
    },
  };
}
