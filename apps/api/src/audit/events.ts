import { z } from "zod";

/**
 * The whitelist of audit events: every type the log accepts, with the exact
 * shape of its subject and data. Objects are strict, so a field that is not
 * listed here (a password, a token, a verification code) cannot be recorded by
 * accident. The database has its own list of types (`public.audit_event_types`).
 *
 * To add an event type (Loans, returns, Hold dispatches):
 * 1. add an entry here,
 * 2. add a migration with `insert into public.audit_event_types (event_type) values ('<type>');`
 * Data values must be strings, booleans, null, safe integers, or arrays and
 * objects of those, with ASCII identifier keys (see `canonical.ts`). Store a
 * time as an ISO string.
 */
export const AUDIT_EVENTS = {
  /** Someone tried to sign in and was refused (Member app or Librarian desk page). */
  sign_in_failed: {
    /** The email that was entered, lowercased; null when what was entered is not an email. */
    subject: z.email().max(320).nullable(),
    data: z.strictObject({
      portal: z.enum(["member", "staff"]),
      reason: z.enum(["invalid_credentials", "email_not_verified", "not_member", "not_staff", "refused"]),
      /** The client address the sign-in limiter counts, when known. */
      clientAddress: z.string().max(64).nullable(),
    }),
  },
} as const;

export type AuditEventType = keyof typeof AUDIT_EVENTS;

/** One event to record. `actorId` is the signed-in person who caused it, when there is one. */
export type AuditEvent = {
  [T in AuditEventType]: {
    type: T;
    actorId?: string | null;
    subject?: z.input<(typeof AUDIT_EVENTS)[T]["subject"]>;
    data: z.input<(typeof AUDIT_EVENTS)[T]["data"]>;
  };
}[AuditEventType];

export const AUDIT_EVENT_TYPES = Object.keys(AUDIT_EVENTS) as AuditEventType[];

const actorIdSchema = z.uuid().nullable();

/** Checks an event against the whitelist. Throws on anything not listed: that is a bug in the caller. */
export function parseAuditEvent(event: AuditEvent): {
  type: AuditEventType;
  actorId: string | null;
  subject: string | null;
  data: Record<string, unknown>;
} {
  const spec = (AUDIT_EVENTS as Record<string, (typeof AUDIT_EVENTS)[AuditEventType] | undefined>)[event.type];
  if (spec === undefined) throw new Error(`Unknown audit event type: ${String(event.type)}`);
  const subject = spec.subject.safeParse(event.subject ?? null);
  const data = spec.data.safeParse(event.data);
  const actorId = actorIdSchema.safeParse(event.actorId ?? null);
  if (!subject.success || !data.success || !actorId.success) {
    // Name the fields only: the values might be exactly what must never be logged.
    const fields = [
      ...(subject.success ? [] : ["subject"]),
      ...(actorId.success ? [] : ["actorId"]),
      ...(data.success ? [] : data.error.issues.map((issue) => `data.${issue.path.join(".") || "(root)"}`)),
    ];
    throw new Error(`Audit event ${event.type} does not match its whitelisted shape: ${fields.join(", ")}`);
  }
  return { type: event.type, actorId: actorId.data, subject: subject.data, data: data.data };
}
