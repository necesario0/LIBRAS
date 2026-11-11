**LIBRAS REQUIREMENTS ENGINEERING**

*Library Borrowing and Records Administration System*

**USER REQUIREMENT**

**Super Admin**

**Dashboard & Analytics:**

* The Super Admin must be able to view the system dashboard and monitor library statistics.

**Admin Account Management:**

* The Super Admin must be able to view, create, edit, and deactivate user accounts for admins and librarians.  
* The Super Admin must be able to assign specific admin permissions.

**User Management:**

* The Super Admin must be able to view users, verify user accounts, and approve user registrations.  
* The Super Admin must be able to edit user information, suspend user accounts, and manage user classifications.

**Book Management:**

* The Super Admin must be able to view books, add new books, edit book information, and delete or archive books.  
* The Super Admin must be able to manage book categories and book authors.

**Book Inventory & Barcode:**

* The Super Admin must be able to view book inventory, add/edit book copies, and update book availability.  
* The Super Admin must be able to generate and print book barcodes.

**Borrowing Management:**

* The Super Admin must be able to view borrowing transactions, process book borrowing, approve borrowing, edit borrowing records, and cancel borrowing transactions.

**Return Management:**

* The Super Admin must be able to view return transactions, process book returns, check book conditions, and record damaged books.

**Reservation Management:**

* The Super Admin must be able to view, approve, reject, and cancel reservations.  
* The Super Admin must be able to manage waiting lists and pickup deadlines.

**Overdue & Penalty Management:**

* The Super Admin must be able to view overdue books and manage overdue records.  
* The Super Admin must be able to calculate penalties, record penalty payments, and waive penalties.

**Reports & Analytics:**

* The Super Admin must be able to view, generate, and export library reports.  
* The Super Admin must be able to review borrowing statistics, user statistics, and inventory reports.

**Notifications & Announcements:**

* The Super Admin must be able to view and send notifications.  
* The Super Admin must be able to create announcements and manage notification templates.

**System Configuration:**

* The Super Admin must be able to manage borrowing limits, due dates, reservation policies, user privileges, and global system settings.

**Audit Logs & Activity History:**

* The Super Admin must be able to view and export audit logs.  
* The Super Admin must be able to monitor both admin activities and user activities.

**Database Backup & Recovery:**

* The Super Admin must be able to view backup history, create and restore database backups, and manage backup settings.

**Display Configuration:**

* The Super Admin must be able to view and manage display settings, preview display content, and configure mobile app displays.  
* The Super Admin must be able to upload display images, banners, event posters, and promotional announcements.

**Librarians**

* The Librarians are responsible for managing the physical book inventory and daily borrowing operations of the UMak Library Learning Commons.   
* They should be able to sign in to the system, manage their accounts, maintain book records using accession numbers and the existing accession list, process book checkouts and returns, and monitor book availability.   
* They should also be able to view student status, process student library clearance, manage borrower records, filter borrowing transactions by college, user role, or borrowed book, generate reports, and send automated email notifications for overdue books.   
* Their access should include the functions and records necessary to perform authorized library operations.

**2\. Students**

* The students must be able to register for or activate an account following university procedures, sign in to the system, and manage permitted account details.  
* The students must be able to search the physical book catalog and check recorded book availability.  
* The students must be able to view their digital library ID or barcode.  
* The students must be able to monitor their borrowing records, due dates, overdue status, and library eligibility.  
* The students must be able to submit renewal, hold, or reservation requests where permitted by library policies.  
* The students must be able to receive applicable email notifications regarding overdue books.

**3\. Faculty**

* The faculty members must be able to register for or activate an account following university procedures, sign in to the system, and view their account information, assigned college or department, and library eligibility status.  
* The faculty members must be able to search the physical book catalog and check recorded book availability.  
* The faculty members must be able to view their borrowing records and due dates.  
* The faculty members must be able to submit renewal, hold, or reservation requests where permitted by library policies.  
* The faculty members must be able to review their borrowing history.  
* The faculty members must be able to receive applicable email notifications regarding overdue books.

**4\. Non-Teaching Personnel (NTP)**

* The non-teaching personnel must be able to register for or activate an employee account following university procedures, sign in to the system, and manage their permitted account information.  
* The non-teaching personnel must be able to search the physical book catalog and check recorded book availability.  
* The non-teaching personnel must be able to view their active borrowing records and due dates maintained separately from faculty records.  
* The non-teaching personnel must be able to submit renewal, hold, or reservation requests where permitted by library policies.  
* The non-teaching personnel must be able to review their borrowing history.  
* The non-teaching personnel must be able to receive applicable email notifications regarding overdue books.

**5\. Guests / Visiting Researchers**

* The guests and visiting researchers must be able to register for library access by providing contact information, institutional affiliation, and completing required identity verification.  
* The guests and visiting researchers must be able to search the physical book catalog and check recorded book availability before visiting the library.  
* The guests and visiting researchers must be able to request or receive an on-site library reading pass.  
* The guests and visiting researchers must be able to view their registration and access status.  
* The guests and visiting researchers must be able to review their visitor entry history or active reading session status where supported.  
* The guests and visiting researchers must be able to access library facilities and physical books according to library policy without automatic borrowing privileges.

**SYSTEM REQUIREMENT**

**FUNCTIONAL REQUIREMENTS**

| No. | Components | Functional Requirements |
| ----- | :---- | :---- |
| **LIBRARIANS MODULE** |  |  |
| A-01 | Sign In and Manage Librarian Account | The system shall allow authorized librarians to sign in to and sign out of LIBRAS. It shall validate account credentials, display permitted librarian account details, allow permitted account information to be updated, support password changes and forgotten-password recovery, and restrict librarian functions to accounts created or approved by authorized library personnel. |
|  | Signin   | The system allows the librarian to sign in using google account or continue with UMak email. The system allows the librarian to sign by entering the correct email and password.  |
|  | Forgot Password  |  |
| A-02 | View Dashboard and Process Student Clearance | The system shall provide a librarian dashboard displaying student names, student identifiers, library status, clearance status, active loans, overdue books, and outstanding fines. It shall allow librarians to search for students by name or student ID, review relevant borrowing records, record or update student library clearance, and view recent borrowing and return activities. |
| A-03 | Manage Physical Book Inventory and Accession Records | The system shall allow authorized library staff to add and update physical book records and individual physical-copy records. It shall record and search accession numbers, use the existing accession list as a reference when creating or verifying records, and link each relevant copy and circulation record to its inventory record. Available bibliographic fields may include title, author, edition, publisher, ISBN, and LC call number. Available acquisition fields may include date received, source of funds, and cost price. Accession numbers shall be stored in a format that preserves leading zeros. Staff shall be able to update availability and inventory status and record missing, damaged, or misplaced copies. |
| A-04 | Process Book Borrowing, Returns, and Notifications | The system shall allow librarians to record physical-book checkout and return transactions by scanning the patron identification barcode and book barcode where supported. If a barcode cannot be read, the system shall support a manual lookup or manual accession-number entry so the transaction can be completed after the patron and item are verified. Each transaction shall be linked to the correct borrower, physical copy, and accession record and shall record relevant checkout, due-date, and return information. The system shall update the recorded availability after a checkout or return, identify overdue transactions using recorded due dates and return status, send automated email notifications for overdue books to the borrower email address on record, and allow librarians to manage renewal, hold, and reservation requests where library policy permits. |
| A-05 | Organize Borrower Records and Generate Reports | The system shall allow librarians to search and maintain separate record categories for Students, Faculty, Non-Teaching Personnel (NTP), and Guests / Visiting Researchers. It shall support filtering borrower records by user role, filtering student records by college, filtering faculty and NTP records by college where applicable, and filtering borrowing records by borrowed book. Librarians shall also be able to search borrowing records by book title or accession number and generate borrowing and return reports, physical book inventory reports, and student clearance reports from recorded system data. |
| **STUDENTS MODULE** |  |  |
| B-01 | Register, Sign In, and Manage Student Account | The system shall allow students to register for or activate an account according to university procedures and verify the institutional email address where required. Students shall be able to sign in and out, view their account details and library eligibility status, update permitted account information, change their password, and request forgotten-password recovery. The system shall generate and display a digital student library ID or barcode for use in supported library identification and checkout workflows. |
| B-02 | Search Physical Books and Check Availability | The system shall allow students to search the physical-book catalog using available fields such as book title, author, ISBN, accession number, or LC call number. It shall display matching book details and editions and show the latest recorded availability of the relevant physical book or copy. Catalog records shall describe physical books only; the component shall not offer search or management functions for digital books, electronic journals, or other non-book collections. |
| B-03 | Request Borrowing Services and Reservations | The system shall display the borrowing rules and eligibility information applicable to students. It shall allow students to submit renewal requests for eligible loans and hold or reservation requests where library policy permits, then view the status of those requests. Checkout and return transactions shall be recorded through the librarian-supported circulation workflow; this component shall not imply that students can independently complete a desk checkout. The system shall send an overdue email notification when a physical book borrowed by the student becomes overdue, using the email address recorded for the student. |
| B-04 | View Personal Borrowing Records | The system shall allow students to view their currently borrowed physical books, checkout dates, due dates, overdue status, and borrowing and return history. It shall display applicable reservation status, outstanding fines, and library status based on the student’s recorded account and circulation information. |

 

| No. | Components | Functional Requirements |
| ----- | :---- | :---- |
| **FACULTY MODULE** |  |  |
| C-01 | Register, Sign In, and Manage Faculty Account | The system shall allow faculty members to register for or activate an account according to university procedures. Faculty members shall be able to sign in and out, view their account details, recorded college or department, and library eligibility status, update permitted account information, change their password, and request forgotten-password recovery. Access to faculty functions shall depend on the user’s verified role and applicable library permissions. |
| C-02 | Search Physical Books and Check Availability | The system shall allow faculty members to search the physical-book catalog using available fields such as title, author, ISBN, accession number, or LC call number. It shall display matching book details and editions and show the latest recorded availability of physical books and individual copies. |
| C-03 | Request Borrowing Services and Reservations | The system shall display borrowing rules and eligibility information applicable to faculty members. It shall allow faculty members to submit renewal requests for eligible loans and hold or reservation requests where library policy permits, and to view the status of submitted requests. Actual checkout and return transactions shall be recorded through the librarian-supported circulation workflow. The system shall send an overdue email notification when a physical book borrowed by a faculty member becomes overdue, using the email address recorded for the faculty member. |
| C-04 | View Personal Borrowing Records | The system shall allow faculty members to view their currently borrowed physical books, checkout dates, due dates, overdue status, borrowing and return history, and applicable reservation status. It shall display outstanding fines and library status based on the faculty member’s recorded account and circulation information. |
| **NON-TEACHING PERSONNEL (NTP) MODULE** |  |  |
| D-01 | Register, Sign In, and Manage Employee Account | The system shall allow NTP employees to register for or activate an account according to university procedures. Employees shall be able to sign in and out, view their account details, recorded institutional affiliation, and library eligibility status, update permitted account information, change their password, and request forgotten-password recovery. Access shall be based on the employee’s verified role and applicable library permissions. |
| D-02 | Search Physical Books and Check Availability | The system shall allow NTP employees to search the physical-book catalog using available fields such as title, author, ISBN, accession number, or LC call number. It shall display matching book details and editions and show the latest recorded availability of physical books and individual copies. |
| D-03 | Request Borrowing Services and Reservations | The system shall display borrowing rules and eligibility information applicable to NTP employees. It shall allow employees to submit renewal requests for eligible loans and hold or reservation requests where library policy permits, and to view the status of submitted requests. Actual checkout and return transactions shall be recorded through the librarian-supported circulation workflow. The system shall send an overdue email notification when a physical book borrowed by an employee becomes overdue, using the email address recorded for the employee. |
| D-04 | View Personal Borrowing Records | The system shall allow NTP employees to view their currently borrowed physical books, checkout dates, due dates, overdue status, borrowing and return history, and applicable reservation status. It shall display outstanding fines and library status based on the employee’s recorded account and circulation information. |
| **GUESTS / VISITING RESEARCHERS MODULE** |  |  |
| E-01 | Register, Sign In, and Manage Visitor Account | The system shall support registration for guests and visiting researchers, including visitors from other institutions. It shall record the visitor’s name, contact information, and home institution or research affiliation where applicable, and support the identity and registration verification required by the library. Where visitor accounts are provided, visitors shall be able to sign in, view registration or access status, update permitted information, recover a forgotten password, and sign out. Visitor registration shall not automatically grant book-borrowing privileges. |
| E-02 | Search Physical Books and Check Availability | The system shall allow guests and visiting researchers to search the physical-book catalog before visiting the library using available fields such as title, author, ISBN, accession number, or LC call number. It shall display matching book details and the latest recorded availability of physical books and individual copies. The catalog function shall not extend to digital collections or non-book materials. |
| E-03 | Register and Manage On-Site Library Visits | The system shall allow visitors to submit a visit registration request and record required visitor-entry information. It shall support issuing or recording an on-site reading pass according to library procedures, display visitor registration and access status, record visit or reading-session start and end information where supported, and allow authorized staff to review visitor entry history. Visitor access and reading privileges shall follow library policy. |

**NON-FUNCTIONAL REQUIREMENTS**

The following requirements define quality and operating conditions for the functional components. Performance targets retained from the previous requirements draft should be validated against the project team’s testing capacity and the client’s expectations.

| No. | Non-Functional Criteria | Components | Non-Functional Requirements |
| :---- | :---- | :---- | :---- |
| 1 | Security and Role-Based Access | A-01, A-02, A-05, B-01, C-01, D-01, E-01 | The system shall restrict protected functions according to the user’s assigned and verified role. Only authorized library personnel shall be able to modify inventory records, process circulation transactions, access clearance information, and review administrative reports. Users shall not be able to access another patron’s account or borrowing history unless authorized for a library duty. |
| 2 | Privacy and Confidentiality | A-01, A-02, A-05, B-01, C-01, D-01, E-01 | Personal, identification, institutional-affiliation, and borrowing information shall be available only to the account holder and authorized staff who need it for library operations. The system shall display only the account and transaction details required for the user’s role and task. For routine circulation transactions, it shall not require staff to print or retain images of patron ID cards solely to record a transaction unless an approved library procedure requires it. |
| 3 | Data Accuracy | A-02, A-03, A-04, A-05, B-02, B-04, C-02, C-04, D-02, D-04, E-02 | Displayed student status, clearance status, book-copy availability, borrowing status, due dates, overdue status, and report results shall correspond to the latest successfully saved account, inventory, and circulation records. |
| 4 | Data Integrity | A-03, A-04, A-05 | Each completed checkout and return shall be stored as a digital transaction associated with the correct borrower and physical book record. Where an accession number is recorded, the transaction shall remain linked to the corresponding inventory record. A completed transaction shall update the associated circulation status consistently. |
| 5 | Catalog Search Performance | B-02, C-02, D-02, E-02 | As a target carried forward from the existing requirements document, catalog search results should be returned and displayed within 1.0 second under a load of up to 50 concurrent users. This target should be validated during performance testing. |
| 6 | Circulation Transaction Performance | A-04 | As targets carried forward from the existing requirements document, a standard barcode-based checkout should complete in less than 30 seconds and a standard barcode-based return should complete in less than 15 seconds after the required identification and item scans are available. A manual lookup fallback should support transaction completion within 60 seconds under normal test conditions. |
| 7 | Barcode Readability and Error Handling | A-04, B-01 | A displayed digital student ID or barcode shall have sufficient contrast and size for the supported library scanner to read it under normal operating conditions. If a patron or book barcode cannot be read, the system shall provide a clear indication and allow authorized staff to use the defined manual lookup or accession-number fallback. |
| 8 | Overdue Notification Reliability | A-04, B-03, C-03, D-03 | An overdue email notification shall be generated only when the recorded due date has passed and the relevant physical book has not been recorded as returned. Notifications shall use the email address stored in the applicable borrower record. |
| 9 | Usability and Clear Feedback | A-01 to A-05, B-01 to B-04, C-01 to C-04, D-01 to D-04, E-01 to E-03 | The system shall provide clear feedback for successful and unsuccessful actions, including sign-in, account activation, catalog search, barcode scanning, checkout, return, registration, and request submission. Search functions shall distinguish between matching results and no results. Error messages shall guide the user or librarian toward an available correction or approved fallback. |

