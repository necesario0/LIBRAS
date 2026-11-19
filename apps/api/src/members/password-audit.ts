import type { AppDeps } from "../app.ts";
import { createAuditLog } from "../audit/index.ts";

type AuditDeps = Pick<AppDeps, "db" | "clock" | "logger">;

/** The security events of a Member's own account: Forgot password, Change password, Sign out of all devices and a wrong password for Delete my account. */
export type PasswordEventType =
  | "password_reset"
  | "password_changed"
  | "password_change_failed"
  | "signed_out_all_devices"
  | "account_deletion_failed";

/** The client address as the audit log keeps it: at most 64 characters, or null when it is not known. */
export function auditClientAddress(clientAddress: string | undefined): string | null {
  return clientAddress?.slice(0, 64) ?? null;
}

/**
 * Writes a security event of a Member's own account to the audit log: the Member is actor and
 * subject, the client address is kept, a password never is.
 *
 * It is called once the thing it records has happened (or been refused), so it
 * never fails the request: a broken audit write must not undo or hide a
 * password change. It is not lost quietly either. A failed write is tried once
 * more, and if that fails too the whole entry is logged at error level, with
 * its time, so it can be added by hand.
 */
export async function recordPasswordEvent(
  deps: AuditDeps,
  event: { type: PasswordEventType; memberId: string; clientAddress: string | undefined },
): Promise<void> {
  const entry = {
    type: event.type,
    actorId: event.memberId,
    subject: event.memberId,
    data: { clientAddress: auditClientAddress(event.clientAddress) },
  };
  const occurredAt = deps.clock.now().toISOString();
  const audit = createAuditLog(deps);
  try {
    await audit.record(entry);
    return;
  } catch {
    // Tried once more below.
  }
  try {
    await audit.record(entry);
  } catch (error) {
    deps.logger.error(
      `Could not record ${event.type} in the audit log, after one retry. The entry to add: ${JSON.stringify({ ...entry, occurredAt })}`,
      error,
    );
  }
}
