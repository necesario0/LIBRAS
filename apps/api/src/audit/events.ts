import { z } from "zod";
import { accountTypeSchema } from "@libras/shared";

/** What the audit log keeps of an Announcement as it was saved: what every Member sees and where its link sends them. */
const announcementData = z.strictObject({
  title: z.string().max(120),
  firstDay: z.iso.date(),
  lastDay: z.iso.date(),
  link: z.enum(["none", "book", "web"]),
  /** The linked Book's id or the web address; null with no link. */
  linkTarget: z.string().max(500).nullable(),
});

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
  /**
   * A Member set a new password with a code from a Forgot password email. Every
   * session of the account was ended. `actorId` is the Member.
   */
  password_reset: {
    /** The Member's account id. */
    subject: z.uuid(),
    data: z.strictObject({
      /** The client address that completed the reset, when known. */
      clientAddress: z.string().max(64).nullable(),
    }),
  },
  /**
   * A signed-in Member changed their password. Every other session of the
   * account was ended; the one that made the change stays. `actorId` is the Member.
   */
  password_changed: {
    /** The Member's account id. */
    subject: z.uuid(),
    data: z.strictObject({
      /** The client address that made the change, when known. */
      clientAddress: z.string().max(64).nullable(),
    }),
  },
  /**
   * A signed-in Member gave a wrong current password in Change password (the
   * same refusal the sign-in limiter counts). `actorId` is the Member. Whoever
   * holds an unlocked phone is guessing here, so the address is kept.
   */
  password_change_failed: {
    /** The Member's account id. */
    subject: z.uuid(),
    data: z.strictObject({
      /** The client address the sign-in limiter counts, when known. */
      clientAddress: z.string().max(64).nullable(),
    }),
  },
  /**
   * A signed-in Member chose "Sign out of all devices" in Settings. Every
   * session of the account was ended, the one that asked included. `actorId` is the Member.
   */
  signed_out_all_devices: {
    /** The Member's account id. */
    subject: z.uuid(),
    data: z.strictObject({
      /** The client address that asked, when known. */
      clientAddress: z.string().max(64).nullable(),
    }),
  },
  /**
   * A cleared Member deleted their account in Settings (ADR 0011): their sign-in, Saved books and personal
   * data are gone, their Holds cancelled, and their Loans and Fines kept on the Member record with no
   * personal data. `actorId` is the Member. Nothing personal is recorded, only the id.
   */
  account_deleted: {
    /** The Member's id, which their kept Loans and Fines still name. */
    subject: z.uuid(),
    data: z.strictObject({
      accountType: accountTypeSchema,
      /** How many waiting or ready Holds were cancelled. */
      holdsCancelled: z.number().int().nonnegative(),
      /** The client address that asked, when known. */
      clientAddress: z.string().max(64).nullable(),
    }),
  },
  /**
   * A signed-in Member gave a wrong password to delete their account (the same refusal the sign-in limiter
   * counts). `actorId` is the Member.
   */
  account_deletion_failed: {
    /** The Member's account id. */
    subject: z.uuid(),
    data: z.strictObject({
      /** The client address the sign-in limiter counts, when known. */
      clientAddress: z.string().max(64).nullable(),
    }),
  },
  /** A Librarian confirmed a Loan at the desk. `actorId` is the Librarian. */
  loan_confirmed: {
    /** The Loan's id. */
    subject: z.uuid(),
    data: z.strictObject({
      memberId: z.uuid(),
      copyId: z.uuid(),
      bookId: z.uuid(),
      accessionNumber: z.string().max(64),
      /** The end of the day the Copy is due, ISO 8601. */
      dueAt: z.iso.datetime(),
    }),
  },
  /** A Member renewed one of their Loans in the app. `actorId` is the Member. */
  loan_renewed: {
    /** The Loan's id. */
    subject: z.uuid(),
    data: z.strictObject({
      memberId: z.uuid(),
      copyId: z.uuid(),
      bookId: z.uuid(),
      accessionNumber: z.string().max(64),
      /** The due date before the Renewal, ISO 8601. */
      previousDueAt: z.iso.datetime(),
      /** The due date the Renewal gave, ISO 8601. */
      dueAt: z.iso.datetime(),
      /** How many times the Loan has been renewed, this Renewal included. */
      renewalCount: z.number().int().positive(),
    }),
  },
  /**
   * The developer moved a test Member's open Loan back by whole days with
   * `npm run verify:hosted -- backdate`, for the demo on real phones. Only Loans
   * of test Members can be moved. There is no actor: the script connects to the
   * database directly, with no signed-in person.
   */
  loan_backdated: {
    /** The Loan's id. */
    subject: z.uuid(),
    data: z.strictObject({
      memberId: z.uuid(),
      /** The barcode of the Copy on Loan, as typed on the command line. */
      barcode: z.string().max(64),
      /** How many days both the lending time and the due date moved back. */
      days: z.number().int().positive(),
      /** The due date before the move, ISO 8601. */
      previousDueAt: z.iso.datetime(),
      /** The due date after the move, ISO 8601. */
      dueAt: z.iso.datetime(),
    }),
  },
  /** A Librarian recorded the return of a Copy at the desk. `actorId` is the Librarian. */
  copy_returned: {
    /** The id of the Loan that was closed. */
    subject: z.uuid(),
    data: z.strictObject({
      memberId: z.uuid(),
      copyId: z.uuid(),
      bookId: z.uuid(),
      accessionNumber: z.string().max(64),
      /** When the return was recorded, ISO 8601. */
      returnedAt: z.iso.datetime(),
      /** The Copy came back after the end of its due day. */
      late: z.boolean(),
    }),
  },
  /**
   * A Librarian recorded the return of a late Copy and the API fixed its Fine
   * (ADR 0010): the amount never changes after this. `actorId` is the Librarian.
   * It follows the return's `copy_returned` entry.
   */
  fine_fixed: {
    /** The id of the Loan the Fine is on. */
    subject: z.uuid(),
    data: z.strictObject({
      memberId: z.uuid(),
      /** Calendar days after the due date, the day of the return included. */
      daysLate: z.number().int().positive(),
      /** The Loan Policy it was worked out with, in centavos. */
      dailyRateCentavos: z.number().int().positive(),
      capCentavos: z.number().int().nonnegative(),
      /** The Fine, in centavos: the daily rate for every day late, up to the cap. */
      amountCentavos: z.number().int().positive(),
    }),
  },
  /**
   * A Librarian settled a Fine as paid or waived (ADR 0010), at the return of
   * the late Copy or in the Member's desk session. It is recorded once: a
   * settled Fine is never settled again. `actorId` is the Librarian.
   */
  fine_settled: {
    /** The id of the Loan the Fine is on. */
    subject: z.uuid(),
    data: z.strictObject({
      memberId: z.uuid(),
      outcome: z.enum(["paid", "waived"]),
      /** The Fine's amount in centavos: what was paid or forgiven. LIBRAS keeps no other money figure. */
      amountCentavos: z.number().int().positive(),
      /** Where the Librarian settled it. */
      place: z.enum(["return", "desk_session"]),
    }),
  },
  /**
   * A Hold was chosen by the dispatcher: it became ready and a Copy was set aside
   * for its Member. `actorId` is whoever freed the Copy: the Librarian who
   * recorded its return, or the Member who cancelled the ready Hold it was set aside for.
   */
  hold_dispatched: {
    /** The Hold's id. */
    subject: z.uuid(),
    data: z.strictObject({
      /** The Member the Copy is set aside for. */
      memberId: z.uuid(),
      copyId: z.uuid(),
      bookId: z.uuid(),
      accessionNumber: z.string().max(64),
      /** The end of the Pickup Window, ISO 8601. */
      pickupEndsAt: z.iso.datetime(),
      /** Why the Copy was free to be set aside. */
      cause: z.enum(["copy_returned", "hold_cancelled", "pickup_window_expired"]),
    }),
  },
  /**
   * A Hold's Pickup Window passed without the Member borrowing the Copy set aside
   * for it, and the API expired the Hold. There is no actor: the API did it, on
   * its own schedule or when something touched the Hold. When a Hold was waiting,
   * a `hold_dispatched` entry (cause `pickup_window_expired`) follows.
   */
  hold_expired: {
    /** The Hold's id. */
    subject: z.uuid(),
    data: z.strictObject({
      /** The Member who did not borrow the Copy. */
      memberId: z.uuid(),
      copyId: z.uuid(),
      bookId: z.uuid(),
      accessionNumber: z.string().max(64),
      /** The end of the Pickup Window that passed, ISO 8601. */
      pickupEndsAt: z.iso.datetime(),
      /** When the API recorded the expiry, ISO 8601. */
      expiredAt: z.iso.datetime(),
    }),
  },
  /**
   * A Librarian created an Announcement: a poster shown to every Member from
   * its first to its last day. `actorId` is the Librarian.
   */
  announcement_created: {
    /** The Announcement's id. */
    subject: z.uuid(),
    data: announcementData,
  },
  /** A Librarian edited a running or scheduled Announcement. `actorId` is the Librarian. */
  announcement_edited: {
    /** The Announcement's id. */
    subject: z.uuid(),
    data: announcementData.extend({
      /** A new poster image replaced the old one (a new crop alone is not a new image). */
      imageReplaced: z.boolean(),
    }),
  },
  /** A Librarian ended the running Announcement early: it stopped showing at `endsAt`. `actorId` is the Librarian. */
  announcement_ended: {
    /** The Announcement's id. */
    subject: z.uuid(),
    data: z.strictObject({
      title: z.string().max(120),
      /** The moment it was ended, ISO 8601. */
      endsAt: z.iso.datetime(),
      /** The last day it was meant to show until then. */
      plannedLastDay: z.iso.date(),
    }),
  },
  /** A Librarian deleted a scheduled Announcement before it started. `actorId` is the Librarian. */
  announcement_deleted: {
    /** The Announcement's id. */
    subject: z.uuid(),
    data: z.strictObject({
      title: z.string().max(120),
      firstDay: z.iso.date(),
      lastDay: z.iso.date(),
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
