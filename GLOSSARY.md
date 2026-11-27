# LIBRAS

The library system for the University of Makati: Members find and borrow physical books, and library staff run circulation.

## Language

### People

**Member**:
A person with an account who uses the library. Every Member has exactly one Account Type.
_Avoid_: Patron, user, borrower, student (when you mean any Member)

**Account Type**:
The kind of Member, one of: UMAK Student, Faculty, NTP / Employee, Visitor, Alumni. It decides what the Member is allowed to do.
_Avoid_: Role (reserved for staff), user type

**Visitor**:
A Member from outside the university who may use the library on site but cannot borrow.
_Avoid_: Guest, visiting researcher

**Alumni**:
A Member who graduated from the university. Has the same privileges as a Visitor (pending team confirmation).

**Deleted Member**:
A Member who deleted their own account once cleared. They can no longer sign in, and nothing about them is kept but their Account Type and their past Loans and Fines, which no longer say who they were.
_Avoid_: Deactivated, archived, former user, anonymous user

**Librarian**:
A staff member who runs circulation. Not a Member.

**Admin**:
A staff member whose permissions are granted by a Super Admin. Not a Member.

**Super Admin**:
The staff member with full control of accounts, permissions and library settings. Not a Member.

### Catalog

**Book**:
A title and edition in the catalog. It is what search finds and what a Hold is placed on.
_Avoid_: Title, item, record

**Copy**:
One physical item of a Book, with its own accession number and barcode. It is what a Loan is for.
_Avoid_: Item, book (when you mean one physical item)

### Circulation

**Hold**:
A Member's place in the queue for a Book that has no available Copy.
_Avoid_: Reservation, request, booking

**Pickup Window**:
The time a Copy stays set aside for the Member whose Hold was chosen. If it passes, the Hold expires and the next Hold is chosen. It ends at its stored end time exactly: from then the Member can no longer borrow the Copy as their Hold, however late the expiry runs.

**Pickup Window expiry**:
Ending a Pickup Window that has passed: the Hold becomes expired and its Copy goes to the Book's next waiting Hold, with a Pickup Window of its own starting at the expiry, or is available again. It runs on its own (the sweep), and also when a Member borrows, cancels or lists Holds, so no outcome depends on when the sweep last ran.
_Avoid_: Timeout, release (the Copy is passed on, not just released)

**Sweep**:
The work that must happen on time whether or not anyone uses LIBRAS. Each run does Pickup Window expiry for every Hold whose window has passed, then sends the Loan notices that are due. A timer in the API runs it while the API is up, and a schedule in the database wakes the API while it sleeps.

**Hold dispatch**:
Choosing the next waiting Hold of a Book when one of its Copies is free again, by arrival time minus the weight of the Member's Account Type. The Hold becomes ready and the Copy is set aside for its Member.
_Avoid_: Assignment, allocation, notification (the email is only part of it)

**Loan**:
A record that a Member has a specific book copy out. A Loan exists only once a Librarian confirms it; a Member can never create one alone.
On the My Books page of the mobile app, Members see their Loans under "Borrow", in words such as "Borrowed now" and "Returned" (owner decision, 2026-11-28). Everywhere else, and in code and the API, it is a Loan.
_Avoid_: Borrow (as a noun), checkout, transaction

**Digital ID**:
The code a Member shows on their phone so a Librarian can identify them by scanning it at the desk. It is a 1D barcode, like the ones on the books, and it changes every 60 seconds so a copy of it cannot be reused.
_Avoid_: Barcode, QR, library card

**Desk session**:
The short time after a Librarian scans a Member's Digital ID in which every Copy they scan is lent to that Member. It ends 10 minutes after the last scan, or when the Librarian is done with the Member; then the Digital ID must be scanned again.
_Avoid_: Checkout session, visit (as a technical term)

**Renewal**:
A Member moving the due date of one of their own Loans later, in the app and without a Librarian. It adds one loan period, counted from the current due date. It is refused once the Loan is overdue, when the Loan has used up its renewal limit, while another Member's Hold is waiting for the Book, or when the Member is not in Good standing.
_Avoid_: Extension, reborrow, reloan

**Loan notice**:
An email that tells a Member about the due dates of their Loans. There are three kinds: due tomorrow, now overdue, and still overdue, which repeats weekly up to four times. The overdue kinds state the Fine so far. A Member gets at most one Loan notice a day, covering all their Loans that need one, and none for a Loan after its Copy is returned.
_Avoid_: Reminder, overdue email (it also covers Loans that are not overdue yet), alert

**Push notification**:
A message on a Member's phone, outside the app, about a Hold that is ready, a Loan due tomorrow, a Loan on its first overdue day, or a new Announcement. Each kind has its own switch in Settings; the first three start on and Announcements off. A tap opens the screen it is about. It never replaces a Loan notice, which is always emailed.
_Avoid_: Alert, reminder, Loan notice (that is the email)

**Notification**:
An entry in a Member's notification inbox in the app, opened from the bell on Home. There is one for each event a Push notification is about: a Hold that is ready, a Loan due tomorrow, a Loan on its first overdue day, or a new Announcement. The inbox holds every kind whatever the push switches say, and needs no push setup on the phone. A Notification is unread until the Member opens it or marks all as read. Opening it leads to the same screen as its Push notification.
_Avoid_: Alert, inbox item, Push notification (that is the message on the phone, outside the app)

**Fine**:
The peso amount a Member owes for one Loan returned late. It grows by the daily rate for every calendar day after the due date, up to the cap, and stops at the return, when the amount is fixed for good. A Fine is unsettled until a Librarian settles it.
_Avoid_: Penalty, fee, charge, overdue fee

**Settle**:
A Librarian closing a Fine at the desk, as either paid or waived. LIBRAS records who settled it and when, not the money.
_Avoid_: Pay (the Member pays, the Librarian settles), clear (see Clearance), collect

**Good standing**:
A Member is in Good standing when they have no overdue Loan and no unsettled Fine. A Member who is not cannot get a new Loan, place a Hold or make a Renewal.
_Avoid_: Blocked, suspended, cleared (see Clearance)

**Clearance**:
A Member is cleared when they have no Loan still out and no unsettled Fine. It is stricter than Good standing: a Member with a Loan that is out and on time is in Good standing but not cleared. LIBRAS works it out from the Member's Loans and Fines; nobody grants it.
_Avoid_: Clearance status as something a staff member sets, good standing

**Loan Policy**:
The loan limit, loan period, renewal limit, daily Fine rate and Fine cap that apply to an Account Type. Visitor and Alumni have a loan limit of zero.
_Avoid_: Borrowing rules, limits

**Reservation**:
Not a concept in LIBRAS. The team decided not to build it.

### Discovery

**Subject**:
The academic field of a Book, read from the class letters of its LC call number. A Book has at most one Subject; one without an LC call number has none.
_Avoid_: Category, genre, department, college (when you mean the field)

**Saved book**:
A Book a Member keeps on their own private list to find again. Saving sets no Copy aside and puts the Member in no queue, so any Account Type may save.
_Avoid_: Bookmark, wishlist, favorite, reservation

**Announcement**:
A notice a Librarian publishes to every Member as a poster image, shown on Home from its start date to its end date. No two Announcements run at the same time.
_Avoid_: News, post, article, broadcast, bulletin, book of the month
