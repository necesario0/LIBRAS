# 0009: Loan notices are sent on the sweep tick, from a record of what was sent

**Status:** Accepted
**Date:** 2026-11-13

A Member gets a Loan notice the day before a Loan is due, on its first overdue day, and every 7 days after that while the Copy is still out, at most 4 repeats. Every due date is the end of a library day (`loanDueAt`), so notices are a once-a-day matter. The API sends one email per Member per day at 08:00 library time, and that email covers every Loan of theirs that needs a notice that day.

No daily job sends them. A second job runs on the tick that already runs the Pickup Window sweep (ADR 0007): the API's timer while it is awake, and the database schedule that wakes it. On each tick from 08:00 the job looks for Loans that have reached a notice and have no record of that notice. It sends the email through the email sender, and writes the record only after Brevo accepts the email. The record is one row per Loan and notice, unique in the database, and the job locks it so that two ticks cannot both send.

## Why not one scheduled call at 08:00

Render's free plan stops the service when it is idle and takes about a minute to start it. A single call at 08:00 that fails, or arrives while a deploy is running, loses that day's notices and nothing shows it. With the record, the next tick finds the unsent notices and sends them late. This is the rule of ADR 0007 again: no outcome depends on one scheduled call arriving on time.

## Rules that follow

- A failed send writes no record, so the next tick tries again.
- A notice that is out of date is skipped, never sent late. The job drops a due-tomorrow notice once the Loan is overdue or the Copy is returned. It sends a missed repeat once, not once for each week missed.
- A Renewal moves the due date, so the Loan gets a new due-tomorrow notice for the new date.
- If the API stops after Brevo accepts an email and before the record is written, the Member gets that notice twice. We accept a rare duplicate over a notice that never arrives.

## Considered options

- **A separate pg_cron entry at 08:00 that calls a new endpoint.** Rejected for the reason above. It also adds a second schedule to install and check on the hosted project.
- **Send from PostgreSQL with pg_net, with no call to the API.** Rejected: the Brevo key and the email templates would move into the database, and the tests could no longer capture notices through the swappable email sender.
- **One email per Loan.** Rejected: Loans from one desk session share a due date, so a Member would get several near-identical emails at once.
