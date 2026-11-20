# 0012: Announcement Notifications are read from the Announcements, not copied to every Member

**Status:** Accepted
**Date:** 2026-11-20

The notification inbox (ticket #62) has a Notification for four events: a Hold is ready, a Loan is due tomorrow, a Loan is now overdue, and a new Announcement has started. The first three belong to one Member each. An Announcement reaches every Member at once. We had to decide how to store the Announcement ones.

We store a row only for the Member's own events. The table `notifications` gets one row per Member and event, written when the Hold becomes ready or the Loan notice email goes out. Announcement Notifications have no rows of their own. When the API lists a Member's inbox, it reads every Announcement that has started and was still running or yet to come when the Member signed up. A second table, `announcement_reads`, holds one row for each Announcement a Member has read.

## Why

- **No fan-out.** Copying an Announcement to every Member means one insert per Member, every student and employee of the university who signs up, for each Announcement, from a sweep job that has to find who still lacks the row on every tick. Reading the Announcements costs nothing extra and grows with the number of Announcements (a few a month), not with the Member count.
- **Exactly once, by construction.** There is no write to repeat or to race, so a retried or concurrent sweep cannot add a second Announcement Notification, and no write can fail and block anything.
- **Current words.** A Librarian who fixes a typo in a running Announcement's title fixes it in every inbox too.
- **New Members.** Someone who signs up while an Announcement runs finds it in their inbox. Older Announcements do not flood a new inbox.

## Considered options

- **One row per Member per Announcement, written by the sweep.** It gives one table and one simple list query, but it brings the fan-out, the per-tick search for missing rows, stale titles after an edit, and rows that grow with Members times Announcements. Rejected.
- **A read-up-to time per Member instead of `announcement_reads`.** Smaller, but marking one Announcement read would mark every older one too. Rejected: a Member can open one and leave the rest unread.

## Consequences

- The list merges two sources. Each is read newest first with one entry more than a page, then the two are merged in the API. The cursor (time and id) works the same for both.
- Members cannot read `announcements` (no grant), so the API reads them as itself, as Home does. A Member's own rows (`notifications`, `announcement_reads`) are read and marked as the Member, under row-level security.
- Hold and Loan Notifications are written after the email, next to the push, by functions that never throw. Their unique key (Member, kind, event) stops duplicates. A Notification write that fails is logged and not tried again, as with a failed push.
- Deleting an account deletes both kinds of row.
