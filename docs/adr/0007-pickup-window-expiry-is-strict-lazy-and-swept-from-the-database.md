# 0007: A Pickup Window ends exactly when it says, whatever ran last, and a database schedule makes it run while the API sleeps

**Status:** Accepted
**Date:** 2026-11-13

A Hold is `ready` while a Copy is set aside for its Member, and its Pickup Window ends at `pickup_ends_at` (ADR 0006). When it passes, the Hold becomes `expired` and the Copy goes to the Book's next waiting Hold or is available again. The acceptance criterion is that this happens "without anyone opening the app or the desk page". This records how, and the rules that keep the outcome the same however late the expiry runs.

## The rule: strict at the point of use, lazy where a Member would notice

`expireHold` (`apps/api/src/holds/expiry.ts`) ends one window: the Copy's row, then the Hold's row (the lock order of ADR 0006), the Hold becomes `expired` with `expired_at`, and `dispatchCopy` (which records `hold_expired` and then its own entry, cause before effect) (cause `pickup_window_expired`, no actor) passes the Copy on, with the next Hold's Pickup Window starting at the expiry. The email goes out after the commit. A window has ended at `pickup_ends_at` itself: `pickup_ends_at <= now` is expired.

The sweep (`expireDueHolds`) expires every ready Hold whose window has ended, one transaction each, the oldest first. A failure on one Hold is logged and does not stop the others. Several sweeps at once are safe: `expireHold` looks again under its locks.

Nothing may depend on when the sweep last ran, so the three places that would otherwise see a window as still open expire it first:

- **Borrowing** (`takeCopy`): the Member's Hold is fulfilled only while `pickup_ends_at > now`. When the Copy is set aside for a Hold whose window has ended, the Loan's transaction rolls back, `expireHold` runs, and the confirmation runs again, as if the sweep had run first. So the Member whose window ended is refused with `copy_set_aside` when another Hold now has the Copy, and is lent a Copy that nobody is waiting for like any available Copy (an ordinary Loan: their Hold stays `expired`, it is not `fulfilled`). Refusing them although the Copy sits free at the desk would help nobody. Nothing of the first attempt is kept, not even the use of the Digital ID code.
- **Cancelling** (`cancelHold`): a ready Hold whose window has ended is expired and the cancel is refused with `hold_not_cancellable`, the same as after the sweep.
- **Reading the Member's Holds** (`listHolds`): the Member's own ended windows are expired first, so the app never shows "Ready for pickup" for a Copy that has been passed on.

## The sweep runs on its own, in two layers

The API is a Render web service (ADR 0003, `render.yaml`) on the free plan, which stops a service after 15 minutes without a request and starts it again, in about a minute, on the next one. A timer inside the API therefore cannot be the only answer: while the service sleeps it does not run.

1. **A timer in the API** (`startPickupSweeper`, every 60 seconds, no overlap, a failed sweep is logged and the next runs on time). It keeps windows ending within a minute while the service is awake, and it is all a paid, always-on plan needs.
2. **A schedule in the database** that wakes the service. Supabase's `pg_cron` runs every five minutes a `pg_net` `POST /internal/sweeps/pickup-expiry` with the shared secret as a bearer token (`SWEEP_SECRET`, at least 32 characters; the route does not exist without it). The request starts a sleeping service and the API then runs the same sweep. The API address and the secret are kept in Supabase Vault and read by the job when it runs, so neither is in the job's text. `npm run schedule:hosted` installs it (`apps/api/scripts/pickup-sweep-schedule.ts`), safe to run again; `-- --remove` removes it. The migration does not install it, because the address and the secret belong to the hosted project and a local reset must not fire requests at it. The chain was run end to end on the local Supabase (pg_cron, pg_net, a listener on the machine): the request arrives with the bearer token.

A Pickup Window is therefore noticed at most about five minutes after it ends even while the API sleeps (a minute while it is awake), and the next Member's window starts when the expiry runs, not when the previous one ended. At 24 hours the delay is small against the window. It never lets anyone act on a window that has ended, because the three rules above do not wait for the sweep.

## Considered options

- **Expire in SQL inside pg_cron, with no call to the API.** Rejected: the Hold-ready email for the next Member is sent by the API (Brevo), and the dispatch query, the lock order and the audit entries would exist twice, once in TypeScript and once in a function in the database. Two implementations of the one rule ADR 0006 exists to keep in one place.
- **A scheduler outside the project** (a Render cron job, GitHub Actions on a schedule, an uptime pinger). Rejected: a Render cron job is a paid service, GitHub's schedule is best effort and can be late by many minutes, and a pinger adds a third party and another secret. The database is already there, already hosted next to the data, and a schedule in it is the least to keep running.
- **A paid always-on Render plan, timer only.** The simplest, and the right move if the project gets a budget; it makes the database schedule redundant, not wrong. Not assumed: the project runs on free plans.
- **Lazy expiry only** (no sweep). Rejected: a Copy set aside for a Member who never comes would stay hidden from every other Member, and the next Member would not be emailed, until someone happened to touch that Hold.

## Consequences

- A call every five minutes keeps a free Render service awake all month, which is about 744 of the 750 free instance hours a workspace gets. That is fine for the one service this project runs. If the workspace gets another free service, or sleeping is wanted back, change the schedule (`PICKUP_SWEEP_SCHEDULE`) to hourly: windows are then noticed within the hour, which the lazy rules cover for everything a Member does.
- Enabling the schedule is a human step on the hosted project: `SWEEP_SECRET` on the Render service, then `npm run schedule:hosted` (README, Deployment). Until then only the API's own timer runs, and the API logs a warning at start in production.
- The sweep is not rate limited: its only protection is the secret. A wrong secret answers 401 and does nothing.
- Tests keep to the swappable clock: `api.sweepPickupWindows()` runs the sweep on the test clock, `startTestApi({ sweepIntervalMs })` runs the real timer on it, and the end-to-end server's `POST /e2e/holds/lapse` moves a window back and runs the sweep for the emulator flow. The races (sweep against a Loan, a cancel, a return of another Copy, a second sweep) are in `apps/api/test/pickup-expiry.test.ts`, with the order fixed the way `hold-dispatch.test.ts` does it.
