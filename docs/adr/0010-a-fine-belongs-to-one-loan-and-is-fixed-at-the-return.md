# 0010: A Fine belongs to one Loan, is fixed at the return, and LIBRAS records that it was settled, not the money

**Status:** Accepted
**Date:** 2026-11-16

Tier 1 derives overdue from `due_at` and stores nothing. Tier 2 charges for lateness. A Fine is an amount on one Loan. While the Loan is out and overdue, the API computes the amount from the clock: the daily rate of the Member's Loan Policy for every calendar day after the due date, up to the policy's cap. At the return the API writes the final amount to the Loan, and it never changes again. A Librarian settles a Fine on the desk page as paid or waived, and LIBRAS stores who settled it and when, with an audit log entry.

Good standing and Clearance are not stored. The API works them out from the Member's Loans and Fines each time, so they cannot disagree with the records behind them.

## Why the amount is fixed at the return

The rate and the cap are data that the library can change. A Fine computed on every read would change for past Loans when the rate changes, and a Member could see a different amount from the one a Librarian told them at the desk. Storing the amount while the Loan is still out has the opposite problem, because something would have to update it every day.

## Considered options

- **A ledger of charges and payments per Member.** Rejected for now. Lateness is the only kind of charge in scope, since lost and damaged Copies belong to the admin module. A ledger also brings partial payments, balances and receipts, and the library takes cash outside LIBRAS. If other charges arrive, the per-Loan amounts can be copied into a ledger as its first entries.
- **Recording payments with amounts.** Rejected: LIBRAS does not take money, so an amount typed by a Librarian would be a second figure to keep equal to the Fine. Paid or waived says what the library needs to know.
- **Counting only the days the library is open.** Rejected: LIBRAS has no calendar of closed days. A Loan due on a Friday therefore accrues over the weekend.
- **A stored clearance flag that a staff member sets.** Rejected: it could say cleared while a Loan is still out. Signing a clearance form stays with the admin module.

## Consequences

- A Member whose Hold is ready but who has an unsettled Fine is refused the Loan at the desk until a Librarian settles the Fine, which can happen in the same visit.
- The seeded rate of PHP 5 a day and cap of PHP 300 are placeholders, as the loan limit and loan period are. The real UMAK numbers replace them as a data change, per Account Type.
