import { randomUUID } from "node:crypto";
import type { Router } from "express";
import type { AppDeps } from "../app.ts";
import { currentDigitalId } from "../digital-id/index.ts";
import { confirmLoan } from "../loans/index.ts";
import { seedLibrarians } from "../seed/librarians.ts";

const DAY_MS = 24 * 3_600_000;

/** The Librarian who confirms the Loans of the end-to-end tests. */
const FIXTURE_LIBRARIAN = { email: "e2e-loan-desk@libras.test", fullName: "Lita Reyes" };

/**
 * A route that lets an end-to-end test on another process have a Librarian
 * confirm a Loan for a Member, the way the desk page does: it reads the code on
 * the Member's phone and runs the real confirmation with it and a Copy of the
 * Book. `daysAgo` runs the same confirmation with the clock set that many days
 * back, which is how a test gets a Loan that is overdue today. It exists only
 * on the end-to-end server (`e2e-server.ts`): the real server never imports this module.
 *
 *   POST /e2e/loans { email, bookId, daysAgo? } -> 201 { loan }
 */
export function loanFixtureRoutes(router: Router, deps: AppDeps): void {
  let librarian: Promise<string> | undefined;
  const librarianId = (): Promise<string> => {
    librarian ??= (async () => {
      await seedLibrarians(deps.db, [{ ...FIXTURE_LIBRARIAN, password: `e2e-${randomUUID()}` }]);
      const { rows } = await deps.db.query<{ id: string }>("select id from auth.users where lower(email) = lower($1)", [
        FIXTURE_LIBRARIAN.email,
      ]);
      if (!rows[0]) throw new Error("The fixture Librarian was not created");
      return rows[0].id;
    })();
    return librarian;
  };

  router.post("/e2e/loans", async (req, res) => {
    const { email, bookId, daysAgo = 0 } = (req.body ?? {}) as { email?: unknown; bookId?: unknown; daysAgo?: unknown };
    if (typeof email !== "string" || typeof bookId !== "string" || typeof daysAgo !== "number" || !Number.isInteger(daysAgo) || daysAgo < 0) {
      res.status(400).json({ error: { code: "invalid_request", message: "Not a Loan fixture." } });
      return;
    }
    const member = await deps.db.query<{ user_id: string }>(
      `select m.user_id from public.members m join auth.users u on u.id = m.user_id where lower(u.email) = lower($1)`,
      [email],
    );
    const copy = await deps.db.query<{ barcode: string }>(
      "select barcode from public.copies where book_id = $1 and status = 'available' order by accession_number limit 1",
      [bookId],
    );
    const memberId = member.rows[0]?.user_id;
    const barcode = copy.rows[0]?.barcode;
    if (memberId === undefined || barcode === undefined) {
      res.status(404).json({ error: { code: "not_found", message: "No such Member, or the Book has no available Copy." } });
      return;
    }

    const then = { ...deps, clock: { now: () => new Date(deps.clock.now().getTime() - daysAgo * DAY_MS) } };
    const { code } = await currentDigitalId(then, memberId);
    const { loan } = await confirmLoan(then, { userId: await librarianId(), email: FIXTURE_LIBRARIAN.email }, { digitalId: code, copy: barcode });
    res.status(201).json({ loan });
  });
}
