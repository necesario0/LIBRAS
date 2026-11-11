**PROJECT CHARTER**

| Group Number: 1 | Date: November 10, 2026 | Revision Number: 5 |
| :---- | :---- | :---- |
| **Project Name: LIBRAS (Library Borrowing and Records Administration System)** |  |  |
| Group Members: Baldonado, Cobby N. Necesario, Edrian C. Rosalan, Adrianne Quinn Emmanuel C. Saavedra, Buzz Aldrizh G. Urdaneta, Mhel Klarenz B. |  |  |

   
 

1. **Project Summary and Goals**  
     
   The University of Makati (UMak) Library Learning Commons (LLC), established in 1972 and situated on the 2nd Floor of the Administration Building, serves as a primary academic resource facility supporting the instructional, research, and information needs of the university community. As an essential academic support unit, the facility caters to students, faculty, researchers, employees, alumni, and authorized visitors by providing access to collection resources, reference materials, and circulation services. Daily operations encompass resource cataloging, patron verification, visitor logging, reference assistance, and circulating physical materials across the academic community. 

   Daily circulation and patron monitoring at the Library Learning Commons follow established desk-side procedures defined by the library's Citizen's Charter. In a standard borrowing or returning transaction, a patron approaches the circulation desk for identity verification (10 seconds), manually fills out a paper Resource Material Borrowing Card or Borrower’s Slip (1 minute), waits while staff inspect the physical condition of the material and return their identification (1 minute), and completes a mandatory physical Client Satisfaction Measurement (CSM) survey form (2 minutes), alongside manual logbook entries for visitor tracking. While this documented workflow ensures compliance, executing it entirely through paper-based and manual recording requires a cumulative processing time of 4 minutes and 10 seconds per patron. This reliance on repetitive manual writing creates severe bottlenecks during peak hours, subjecting students and faculty to long queues, increasing administrative fatigue among library staff, and elevating the risk of clerical errors in transaction records. Furthermore, maintaining records across disparate physical cards makes real-time tracking of book availability, overdue items, and visitor statistics difficult, exposing clear operational inefficiencies across the current circulation workflow.

   To resolve these operational challenges, the **Library Borrowing and Records Administration System (LIBRAS)** is proposed as a centralized, web-based and mobile library management and circulation platform designed to modernize the operations of the UMak Library Learning Commons. The primary purpose of LIBRAS is to replace repetitive paper documentation with an automated, synchronized digital environment that directly serves both library patrons and staff. For **students, faculty members, researchers, admins, and visitors**, the platform provides a dedicated mobile interface allowing them to remotely browse the library catalog, monitor personal borrowing history and due dates, and complete digital visitor check-ins without waiting in desk-side lines. For **librarians**, the system streamlines front-desk circulation by integrating barcode-based scanning for instantaneous material checkout and check-in—supported by a manual lookup fallback during hardware or label errors—thereby drastically cutting transaction time and reducing clerical mistakes. Additionally, **library administrators** benefit from a centralized web-based dashboard equipped with real-time inventory management, patron monitoring, and automated reporting tools, ensuring operational efficiency, data integrity, and informed resource management across the institution. 

   The deployment of LIBRAS offers significant institutional and operational value beyond mere digitization. For patrons—including students, faculty, and researchers—the platform minimizes transaction waiting times and provides immediate, self-service access to the catalog and personal borrowing records. For librarians and student assistants, it eliminates repetitive clerical paperwork, improves inventory accuracy, and reduces manual overhead. Ultimately, the system empowers the University of Makati with centralized data analytics on facility utilization and circulation trends, modernizing library governance and improving academic support services.

2. **Project Scope (System Features)**  
   

   The scope of the project includes designing, developing, and testing the project Components. The following components are: 

1. #### **Librarians Module**

   1. **Sign In \-** The system shall allow authorized library personnel to securely sign in to LIBRAS by entering valid login credentials, authenticate user sessions, and securely sign out to protect system access.

   2. **Manage Librarian Account** \- The system shall allow users with accounts created or approved by authorized library personnel to access LIBRAS, sign in and out, view account details, update permitted account information, change passwords, and recover forgotten passwords.

      

   3. **View Dashboard** \- The system shall allow librarians to view an operational dashboard displaying key library metrics, including active loans, overdue books, outstanding fines, an overview of student clearance statuses, and recent borrowing and return activities.

      

   4. **Process Student Clearance \-** The system shall allow librarians to search for students by name or student ID, view student library status and active liabilities (unreturned books and unpaid fines), review relevant borrowing histories, and process or update student library clearance records.

      

   5. **Manage Physical Book Inventory \-** The system shall allow librarians to add new physical book records, input standard bibliographic details (title, author, edition, publisher, ISBN, and LC call number), manage individual physical copies, update book availability and inventory statuses, and record missing, damaged, or misplaced book copies.

      

   6. **Manage Accession Records** \- The system shall allow librarians to record and track accession numbers using the existing accession list as a reference, search book records by accession number, link individual physical copies to their corresponding accession records, and record acquisition details (date received, source of funds, and cost price, where available).

      

   7. **Process Book Checkouts (Borrowing) \-** The system shall allow librarians to record book checkouts by scanning borrower identification and book barcodes where supported, link transactions to the correct physical copy and accession record, and set due dates.

      

   8. **Process Book Returns:** The system shall allow librarians to record returned physical books, verify copy condition, update copy availability in the catalog, and close active loan records.

      

   9. **Send Overdue Notifications** \- The system shall allow the system to monitor book due dates, track overdue transactions, and automatically transmit email notifications to borrowers with overdue books.

      

   10. **Organize Borrower Records** \- The system shall allow librarians to view, search, and manage borrower profiles, categorize users into separate student, faculty, or Non-Teaching Personnel (NTP) groups, and filter borrower records by college or user role.

   11. **Generate Library Reports** \- The system shall allow librarians to compile, filter, and export formal reports, including borrowing records, return records, physical book inventory summaries, accession listings, and student clearance reports.

2. #### **Students Module**

   1. **Register Student Account** \- The system shall allow students to register for or activate a student library account according to university procedures to gain access to LIBRAS.

   2. **Sign In** \- The system shall allow registered students to securely sign in and out of LIBRAS using verified student credentials.

   3. **Manage Student Account** \- The system shall allow students to view their profile details, verify library eligibility status, update permitted personal information, change passwords, and recover forgotten passwords.

   4. **Search Physical Books** \- The system shall allow students to search the online physical book catalog by title, author, ISBN, or LC call number, and view detailed bibliographic information and book editions.

   5. **Check Book Availability** \- The system shall allow students to check the real-time availability status of physical books and inspect the condition and circulation state of individual physical copies.

   6. **Request Book Renewals** \- The system shall allow eligible students to view borrowing rules, submit renewal requests for borrowed books, and track the status of pending renewal requests.

      

   7. **Receive Due Date Notifications** \- The system shall allow students to receive automated email notifications regarding upcoming return deadlines, overdue items, and reservation updates.

      

   8. **View Borrowing Records** \- The system shall allow students to view currently borrowed books with corresponding checkout and due dates, monitor overdue books, track active reservations, and review past borrowing history.

      

   9. **Track Outstanding Fines** \- The system shall allow students to view applicable overdue fines, assess pending financial obligations, and check their current library clearance standing.

      

3. #### **Faculty Module** 

   1. **Register Faculty Account** \- The system shall allow faculty members to register for or activate a faculty library account according to university procedures to gain access to LIBRAS.

   2. **Sign In** \- The system shall allow registered faculty members to securely sign in and out of LIBRAS using verified institutional credentials.

   3. **Manage Faculty Account** \- The system shall allow faculty members to view their profile details, assigned college, department, and library eligibility status, update permitted personal information, change passwords, and recover forgotten passwords.

   4. **Search Physical Books** \- The system shall allow faculty members to search the online physical book catalog by title, author, ISBN, or LC call number, and view detailed bibliographic information and book editions.

   5. **Check Book Availability** \- The system shall allow faculty members to check the real-time availability status of physical books and inspect the condition and circulation state of individual physical copies.

   6. **Request Book Renewals** \- The system shall allow eligible faculty members to review faculty borrowing policies, submit renewal requests for borrowed books, and track the status of pending renewal requests.

   7. **Receive Due Date Notifications** \- The system shall allow faculty members to receive automated email notifications regarding upcoming return deadlines, overdue notices, and reservation readiness updates.

   8. **View Borrowing Records** \- The system shall allow faculty members to view currently borrowed books with checkout and due dates, monitor overdue books, track active reservations, and review past borrowing history.

   9. **Track Outstanding Fines** \- The system shall allow faculty members to view applicable overdue fines, assess pending obligations, and check their current library standing.

      

4. #### **Non-Teaching Personnel (NTP) Module** 

   1. **Register Employee Account** \- The system shall allow Non-Teaching Personnel (NTP) to register for or activate an employee library account according to university procedures to gain access to LIBRAS.

   2. **Sign In** \- The system shall allow registered NTP employees to securely sign in and out of LIBRAS using verified institutional credentials.

   3. **Manage Employee Account** \- The system shall allow NTP employees to view their profile details, recorded institutional affiliation, and library eligibility status, update permitted personal information, change passwords, and recover forgotten passwords.

   4. **Search Physical Books** \- The system shall allow NTP employees to search the online physical book catalog by title, author, ISBN, or LC call number, and view detailed bibliographic information and book editions.

   5. **Check Book Availability** \- The system shall allow NTP employees to check the real-time availability status of physical books and inspect the condition and circulation state of individual physical copies.

   6. **Request Book Renewals** \- The system shall allow eligible NTP employees to review employee borrowing policies, submit renewal requests for borrowed books, and track the status of pending renewal requests.

   7. **Receive Due Date Notifications** \- The system shall allow NTP employees to receive automated email notifications regarding upcoming return deadlines, overdue notices, and reservation readiness updates.

   8. **View Borrowing Records** \- The system shall allow NTP employees to view currently borrowed books with checkout and due dates, monitor overdue books, track active reservations, and review past borrowing history.

   9. **Track Outstanding Fines** \- The system shall allow NTP employees to view applicable overdue fines, assess pending obligations, and check their current library standing.

      

5. #### **Guests / Visiting Researchers Module**

   1. **Register Visitor Account** \- The system shall allow guests or visiting researchers to submit an account registration request by providing their full name, contact information, home institution, and research affiliation, and complete required identity verification procedures.

   2. **Sign In** \- The system shall allow activated guest or visiting researcher accounts to securely sign in to and out of LIBRAS.

   3. **Manage Visitor Account** \- The system shall allow guests or visiting researchers to view their profile and registration approval status, update permitted contact details, and recover forgotten passwords.

   4. **Search Physical Books** \- The system shall allow guests or visiting researchers to search the online physical book catalog prior to visiting by title, author, ISBN, or LC call number, and view detailed bibliographic information and book editions.

   5. **Check Book Availability** \- The system shall allow guests or visiting researchers to verify the real-time availability status of physical books to confirm on-site reading feasibility.

   6. **Request On-Site Visits** \- The system shall allow guests or visiting researchers to submit on-site library visit applications, request or receive temporary reading passes, and check visit approval statuses.

   7. **Manage On-Site Reading Sessions** \- The system shall allow guests or visiting researchers to view authorized library reading privileges, monitor active reading session statuses, review past visit history, and check out of active reading sessions where supported.

6. #### **Super Admin Module**

   1. **Provide Access Levels** \- The system shall provide two access levels: Super Admin, with full access to all modules and functions, and Admin, with access only to the modules and functions authorized by the Super Admin.

   2. **Display Module Permissions** \- The system shall allow the Super Admin to view the available system modules and their corresponding permissions (view, add, edit, delete, manage, and download), with checkboxes to enable or disable each permission.

   3. **Assign Admin Permissions** \- The system shall allow the Super Admin to assign different permissions for each system module and function to individual Admin accounts.

   4. **Apply Permissions** \- The system shall apply the assigned permissions to an Admin account after saving.

   5. **Modify Permissions** \- The system shall allow the Super Admin to modify previously assigned permissions of an Admin account.

   6. **Restrict Unauthorized Access** \- The system shall restrict Admin access to modules and functions that have not been authorized, while the Super Admin retains full access.

   7. **View Admin Accounts** \- The system shall allow the Super Admin to view the list of Admin accounts with full name, email address, username, account status, and assigned role.

   8. **Create Admin Account** \- The system shall allow the Super Admin to create Admin accounts, preventing duplicate usernames and email addresses, and display a notification once the account is created.

   9. **Edit Admin Account** \- The system shall allow the Super Admin to edit existing Admin account information and display a notification once the account is updated.

   10. **Search Admin Accounts** \- The system shall allow the Super Admin to search Admin accounts by name, email, or username.

   11. **Filter Admin Accounts** \- The system shall allow the Super Admin to filter Admin accounts by account status.

   12. **Activate Admin Account** \- The system shall allow the Super Admin to activate Admin accounts and display a notification once the account is activated.

   13. **Deactivate Admin Account** \- The system shall allow the Super Admin to deactivate Admin accounts, prevent deactivated accounts from accessing LIBRAS, and display a notification once the account is deactivated.

   14. **View System Overview** \- The system shall allow the Super Admin to view the totals of registered users, Admin accounts, registered books, borrowed books, returned books, and overdue books.

   15. **Record Activities** \- The system shall automatically record important user and Admin activities with the user name, activity performed, module accessed, date and time, and action status.

   16. **View Administrative Activities** \- The system shall allow the Super Admin to view account creation, account update, permission change, and account deactivation activities.

   17. **Search Activity Records** \- The system shall allow the Super Admin to search activity records of Admin accounts and other authorized users.

   18. **Filter Activity Records** \- The system shall allow the Super Admin to filter activity records by user role, activity type, module, and date range.

   19. **View Activity Details** \- The system shall allow the Super Admin to view the details of selected activity records.

   20. **Protect Audit Records** \- The system shall prevent unauthorized users from modifying or deleting audit trail records and shall retain them for accountability and future reference.

   21. **Download Activity Reports** \- The system shall allow the Super Admin to download activity reports in PDF and Excel formats.

   #### 

   

   **Tools to be Used**

1. **Documentation and Project Management:**   
   1. **GitHub:** Used for source code version control, branch management, pull request reviews, issue tracking, and team collaboration.  
   2. **Google Workspace (Docs, Sheets, Drive):** Used for drafting project requirements, maintaining meeting logs, tracking task deadlines, and collaborative documentation drafting.  
2. **Design Tools:**   
   1. **Figma:** Used for creating UI wireframes, design system sticker sheets, responsive layouts, and interactive high-fidelity prototypes for both web and mobile interfaces.  
3. **Development Tools and Environments:**   
   1. **Visual Studio Code:** Serves as the primary IDE for writing, debugging, and maintaining frontend, backend, and mobile codebases.  
   2. **Android Studio & Android SDK**: Provides the Gradle build engine, Android SDK platform tools (adb), and Android Virtual Devices (AVDs) for compiling and emulating the mobile application.  
   3. **Postman**: Used for inspecting REST API endpoints, validating request/response JSON payloads, and simulating backend authentication workflows.  
4. **Technology Stack (Frameworks, Languages, and Infrastructure):**  
   1. **Mobile Frontend (React Native, TypeScript)**: Powers the cross-platform borrower app for students, faculty, and NTP to search the catalog, reserve books, and view loan records.  
   2. **Web Frontend (React.js, TypeScript)**: Powers the librarian administrative portal for inventory cataloging, dashboard metrics, clearance processing, and report generation.  
   3. **Backend API (Node.js, Express.js, TypeScript)**: Handles application business logic, processes circulation transactions, and serves RESTful API endpoints between the frontends and database.  
   4. **Database (PostgreSQL)**: Serves as the primary relational database to store accession records, book catalog metadata, borrower accounts, borrowing histories, and fine logs.  
   5. **Cloud Hosting & Deployment (Render)**: Cloud platform used to deploy and host the 24/7 Node.js/Express REST API and the React.js Librarian Web Portal with automated GitHub continuous deployment (CI/CD) and SSL encryption.   
5. **Testing and Security Tools:**   
   1. **Jest & React Native Testing Library:** Used for automated unit testing and component UI interaction testing across both web and mobile frontends. 

   2. **Test Execution Logs (Google Sheets / GitHub Issues)**: Used for documenting manual test cases, edge-case evaluations, and UI usability bug reports across both platforms. 

   3. **Semgrep:** Used for Static Application Security Testing (SAST) to scan backend source code for security vulnerabilities and code flaws before merging. 

   4. **Gitleaks:** Configured as a Git pre-commit scanner to detect and prevent accidental commits of secrets, passwords, or API keys into the repository. 

   5. **OWASP ZAP:** Used for Dynamic Application Security Testing (DAST) to audit live REST API endpoints for vulnerabilities prior to deployment. 

6. **Hardware Tools:**

   1. **USB / Wireless Barcode Scanner Gun**: Used by librarians at physical checkout desks to scan physical patron ID cards and book accession barcodes.

   2. **Physical Android Test Devices**: Used to validate real-world mobile app performance, touchscreen responsiveness, and camera-based barcode scanning on physical hardware. 

3. **Project Milestones**  
   Significant project milestones, deliverables, and exact target dates are structured around the SoftEng1 and HCI 2026 academic calendar. 

| Milestone 1 – Requirement Analysis |  |  |
| :---- | :---- | :---- |
| **Number** | **Deliverables** | **Target Date** |
| 1 | System Request | 8/28/2026 |
| 2 | User Requirement | 8/28/2026 |
| 3 | System Requirement | 8/28/2026 |
| 4 | User Story | 8/28/2026 |

 

| Milestone 2 \- System Design |  |  |
| :---- | :---- | :---- |
| **Number** | **Deliverables** | **Target Date** |
| 1 | Figma Design: Branding & Sticker Sheet | 09/12/2026 |
| 2 | Figma Design: Low-Fidelity Wireframes | 09/12/2026 |
| 3 | Diagrams: Data Flow Diagrams Level 0 & Level 1 | 09/18/2026 |
| 4 | Diagrams: Entity-Relationship Diagram  | 09/18/2026 |
| 5 | Diagrams: Software Architecture Model & Use Case Narratives  | 09/25/2026 |
| 6 | Figma: High-Fidelity Interactive Prototype (Web & Mobile)  | 09/25/2026 |

| Milestone 3 \- Development |  |  |  |
| :---- | :---- | :---- | :---- |
| **Number** | **Scope Module** | **Deliverables** | **Target Date** |
| **0** | **Foundation**  | Backend API Setup, PostgreSQL Schema Migration, Supabase Auth Integration  | 11/01/2026  |
| 1 | **Students Module**  | Register Student Account Sign In Manage Student Account  | 11/03/2026  |
| 2 |  | Search Physical Books Check Book Availability Request Book Renewals Reserve Books  | 11/05/2026  |
| 3 |  | View Borrowing Records Track Outstanding Fines Receive Due Date Notifications  | 11/07/2026  |
| 4 | **Faculty Module**  | Register Faculty Account Sign In Manage Faculty Account Search Physical Books & Check Book Availability Request Book Renewals & Reserve Books (Faculty Policies) View Borrowing Records & Track Outstanding Fines  | 11/09/2026  |
| 5 | **Non-Teaching Personnel (NTP) Module**  | Register Employee Account Sign In Manage Employee Account Search Physical Books & Check Book Availability Request Book Renewals & Reserve Books (NTP Policies) View Borrowing Records & Track Outstanding Fines  | 11/11/2026  |
| 6 | **Guests / Visiting Researchers Module**  | Register Visitor Account Sign In Manage Visitor Account Search Physical Books & Check Book Availability Request On-Site Visits Manage On-Site Reading Sessions  | 11/13/2026  |
| 7 | **Librarians Module**  | Sign In Manage Librarian Account View Dashboard Process Student Clearance  | 11/15/2026  |
| 8 |  | Manage Physical Book Inventory Manage Accession Records Process Book Borrowing (Barcode Scanner Gun Integration) Process Book Returns  | 11/17/2026  |
| 9 |  | Manage Book Reservations Send Overdue Notifications (Automated Batch Emailer) Organize Borrower Records Generate Library Reports (Exportable Summaries)  | 11/19/2026  |
| 10 | **Super Admin Module**  | Provide Access Levels Display Module Permissions Assign Admin Permissions Apply Permissions Modify Permissions Restrict Unauthorized Access View Admin Accounts Create Admin Account Edit Admin Account Search Admin Accounts Filter Admin Accounts Activate Admin Account Deactivate Admin Account View System Overview Record Activities View Administrative Activities Search Activity Records Filter Activity Records View Activity Details Protect Audit Records Download Activity Reports  | 11/20/2026  |
| 11 | **System Integration & QA**  | Cross-Module End-to-End API Integration, Security Scans (Semgrep SAST, Gitleaks, OWASP ZAP DAST)  | 11/21/2026  |
| 12 | **UAT & Build Freeze**  | User Acceptance Testing, Bug Fixes, and Production Release Build Freeze  | 11/22/2026  |
| 13 | **Demonstration Readiness**  | Presentation Slides, Live Demo Scripting, and Defense Dry Run Rehearsal  | 11/23/2026  |
| 14 | **Final Milestone**  | **Final System Presentation & Capstone Demonstration**  | **11/24/2026**  |

| Milestone 4 \- Testing and Quality Assurance |  |  |
| :---- | :---- | :---- |
| **Number** | **Deliverables** | **Target Date** |
| 1 | **Automated Unit & Component Testing:** Execute Jest and React Native Testing Library test suites across React.js web components, mobile screens, and Express.js API route controllers  | 11/18/2026  |
| 2 | **Static & Dynamic Security Audits:** Conduct backend code vulnerability scanning using Semgrep (SAST), pre-commit secret detection with Gitleaks, and live API penetration testing using OWASP ZAP (DAST)  | 10/24/2026 |
| 3 | **System Integration & End-to-End Testing:** Validate end-to-end transaction integrity, role permissions, and data synchronization between Supabase (PostgreSQL & Auth), Express REST API, and both client frontends  | 10/30/2026 |
| 4 | **Usability & User Acceptance Testing (UAT):** Conduct structured UAT sessions covering librarian desk workflows and borrower mobile user journeys; record test execution logs, defect tickets, and edge-case evaluations  | 11/22/2026  |
| 5 | **Final QA Audit & Release Sign-Off:** Verify resolution of high- and medium-severity bug tickets and produce the final QA verification sign-off report prior to presentation  | 11/23/2026  |

 

| Milestone 5 \- Deployment and Final Submission |  |  |
| :---- | :---- | :---- |
| **Number** | **Deliverables** | **Target Date** |
| 1 | **Database Cloud Deployment:** Provision and migrate production PostgreSQL database schema, configure Supabase Auth, and seed initial library catalog records on chosen cloud host (Supabase)  | 11/22/2026  |
| 2 | **Web Portal & Backend Cloud Deployment:** Deploy production Node.js/Express REST API and React.js Librarian Web Portal to chosen cloud hosting platform (Render) with active SSL encryption and environment variable configuration  | 11/23/2026  |
| 3 | **Mobile Production Staging & Distribution:** Generate compiled production Android APK package and distribute to target mobile hardware for live demonstration  | 11/23/2026  |
| 4 | **Semester 1 Final Presentation & Submission:** Live capstone system presentation, defense demonstration on deployed cloud hosts, and final submission of mobile and web deliverables  | 11/24/2026  |
| 5 | **Post-Presentation Documentation & Grade Encoding:** Submission of final Project Charter archive, complete system documentation, source code repository link, and semester grade encoding  | 11/24/2026  |

4. **Project Organizational Structure**

Identify the key stakeholders and team members by function, name, and role.  
 

| Number | Name | Role | Responsibilities | Contact Details |
| ----- | :---- | :---- | :---- | :---- |
| 1 | Rosalan, Adrianne Quinn Emmanuel | Project Leader / Researcher | Coordinates the project, requirements, schedule, documentation, and team assignments. | [arosalan.k12255842@umak.edu.ph](mailto:arosalan.k12255842@umak.edu.ph)  |
| 2 | Baldonado, Cobby | UI/UX Designer / Tester | Designs user flows and interfaces for librarian, student, and walk-in/guest processes. | [cbaldonado.k12256165@umak.edu.ph](mailto:cbaldonado.k12256165@umak.edu.ph)  |
| 3 | Necesario, Edrian | Lead Programmer/ Database Developer | Works on system logic, database structure, and data management. | [enecesario.k12255958@umak.edu.ph](mailto:enecesario.k12255958@umak.edu.ph)  |
| 4 | Saavedra, Buzz Aldrizh  | Programmer / Designer | Implements the user-facing interfaces and system components. | [bsaavedra.k12257228@umak.edu.ph](mailto:bsaavedra.k12257228@umak.edu.ph)  |
| 5 | Urdaneta, Mhel Klarenz | Researcher / Tester | Prepares test cases, performs functional and usability testing, and supports documentation. | [murdaneta.k12256252@umak.edu.ph](mailto:murdaneta.k12256252@umak.edu.ph)  |
| 6 | Prof. Era Marie Gannaban | SoftEng1 Adviser | Provides technical advice on project goals, milestones, development processes, technology selection, and quality assurance. | [eramarie.gannaban@umak.edu.ph](mailto:eramarie.gannaban@umak.edu.ph)  |
| 7 | Prof. Era Marie Gannaban | HCI Adviser | Provides guidance on usability, user needs, personas, user flows, and user engagement. | [eramarie.gannaban@umak.edu.ph](mailto:eramarie.gannaban@umak.edu.ph)  |
| 8 | Melmar G. Fresnido  | OIC-Director (University Library LLC)  | Main client/sponsor; defines operational requirements, provides access to library facilities, and approves system delivery. | [melmar.fresnido@umak.edu.ph](mailto:melmar.fresnido@umak.edu.ph)  |
| 10 | Sarilla, Racquel T. | Reference & User Services Librarian | Oversees circulation counters and transaction desks, defining operational needs for physical checkout. | [racquel.sarilla@umak.edu.ph](mailto:racquel.sarilla@umak.edu.ph) |
| 11 | KYLE D. MEDINA | Electronic & Multimedia Librarian | Manages digital collections and multimedia services, defining system requirements for automated email notifications, catalog access, and filtered analytics.  |  [kyle.medina@umak.edu.ph](mailto:kyle.medina@umak.edu.ph) |
| 12 | ANANIAS A. DE VILLA JR. III | Resource Description & Metadata Librarian | Oversees technical cataloging and database records, defining operational needs for master accession lists, barcode generation, and inventory metadata management.  | [ananias.devilla@umak.edu.ph](mailto:ananias.devilla@umak.edu.ph) |

5. **Project Authorization**  
   

| No.  | Approved by:  | Role  | Signature | Date  |
| :---- | :---- | :---- | :---- | :---- |
| 1 | Melmar G. Fresnido | OIC-Director, LLC |   |  |
| 2 | Sarilla, Racquel T. | Reference & User Services Librarian |  |  |

    

 

