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
The job that runs Pickup Window expiry for every Hold whose window has passed: a timer in the API while it runs, and a schedule in the database that wakes it while it sleeps.

**Hold dispatch**:
Choosing the next waiting Hold of a Book when one of its Copies is free again, by arrival time minus the weight of the Member's Account Type. The Hold becomes ready and the Copy is set aside for its Member.
_Avoid_: Assignment, allocation, notification (the email is only part of it)

**Loan**:
A record that a Member has a specific book copy out. A Loan exists only once a Librarian confirms it; a Member can never create one alone.
_Avoid_: Borrow (as a noun), checkout, transaction

**Digital ID**:
The code a Member shows on their phone so a Librarian can identify them by scanning it at the desk. It is a 1D barcode, like the ones on the books, and it changes every 60 seconds so a copy of it cannot be reused.
_Avoid_: Barcode, QR, library card

**Desk session**:
The short time after a Librarian scans a Member's Digital ID in which every Copy they scan is lent to that Member. It ends 10 minutes after the last scan, or when the Librarian is done with the Member; then the Digital ID must be scanned again.
_Avoid_: Checkout session, visit (as a technical term)

**Loan Policy**:
The loan limit and loan period that apply to an Account Type. Visitor and Alumni have a limit of zero.
_Avoid_: Borrowing rules, limits

**Reservation**:
Not a concept in LIBRAS. The team decided not to build it.
