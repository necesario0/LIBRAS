# 0006: Hold dispatch runs inside the transaction that frees the Copy, with one lock order, and cancelling a ready Hold passes its Copy on

**Status:** Accepted
**Date:** 2026-11-13

ADR 0001 chose the Role-Weighted Priority Queue Dispatcher as one PostgreSQL query. This records how it is wired into circulation, because the rules below are what keep "each Hold is dispatched exactly once" true and every later writer (Pickup Window expiry) must keep them.

`dispatchCopy` (`apps/api/src/holds/dispatch.ts`) is the one place a Copy that nobody has any more is placed. It runs the dispatch query (the Book's waiting Hold with the lowest `(score, seq)` becomes `ready`, `for update skip locked`, through the partial index `holds_queue_idx`), then sets the Copy `set_aside`, or `available` when no Hold was waiting, and records the `hold_dispatched` audit entry. It runs inside the transaction that freed the Copy (the return, or the cancel of a ready Hold), so the Copy is never visible as free while a Hold waits for it. Unlike the benchmark's `DELETE ... RETURNING`, the Hold is kept and updated: its states are its history.

**Lock order: the Member's row, then the Copy's row, then a Hold's row.** No writer takes an earlier lock while holding a later one. A return and a Loan lock the Member and the Copy (`for no key update`) and then touch a Hold (dispatch chooses one, a Loan fulfils one). Cancelling a ready Hold starts from the Hold, so it reads the Hold without a lock, locks the Copy, locks the Hold and reads it again; when the Hold changed in between it rolls back and starts over. Placing a Hold reads the Book's Copies `for share` (in id order) before it inserts: without that, a Hold placed while a Copy is being returned could be missed by the return and also see the Copy as still out, and be left waiting beside an available Copy. That shared lock cannot deadlock: shared locks do not block each other, the holders of a Copy's row each lock one Copy only, and placing a Hold takes no lock they wait for.

**Cancelling a ready Hold is allowed, and passes the set-aside Copy on.** The Hold becomes `cancelled`, and in the same transaction the Copy goes to the Book's next waiting Hold with a Pickup Window of its own starting at the cancel, or becomes available when nobody waits. The alternative, refusing the cancel until the Pickup Window ends, would keep a Copy idle on the hold shelf for a Member who has said they do not want it.

**The email is sent after the transaction commits** (`announceDispatch`), and a failure to send is logged, not returned: an email cannot be rolled back, and the return must not fail because the email service is down. The app shows the ready Hold either way.

**The end of the Pickup Window is stored on the Hold** (`pickup_ends_at` = the API clock's time of the dispatch plus `library_settings.pickup_window_hours`), so a later change of the setting does not move a window that is already running. A set-aside Copy is loanable only to the Member of its ready Hold for as long as the Hold is `ready`; ADR 0006 itself did not compare `pickup_ends_at` with the clock; ending the window, and refusing a Loan after it, is Pickup Window expiry (ADR 0007).

## Consequences

- `for update skip locked` (ADR 0001) means a dispatch passes over a Hold that another transaction has locked at that moment. The only such transactions are another dispatch (which takes the Hold) and a cancel (which removes it), so no Hold is skipped and then left waiting, and concurrent returns of several Copies serve the Holds at the head of the queue.
- A Member can have at most one active Hold per Book, so a Member whose Hold is ready and who borrows a different, available Copy of the Book keeps the ready Hold until they borrow the set-aside Copy, cancel, or the Pickup Window passes.
- Tests that prove each rule, and which of them fail when a lock is removed, are in `apps/api/test/hold-dispatch.test.ts` ("Hold dispatch at the same moment").
