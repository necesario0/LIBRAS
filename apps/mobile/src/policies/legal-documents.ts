import type { PolicyDocumentKind } from "@libras/shared";

export interface PolicyBullet {
  lead?: string;
  text: string;
  url?: string;
}

export type PolicyBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "bullets"; items: readonly PolicyBullet[] };

export interface PolicySection {
  heading: string;
  blocks: readonly PolicyBlock[];
}

export interface LegalDocument {
  kind: PolicyDocumentKind;
  tabLabel: string;
  title: string;
  organizationLines: readonly string[];
  effectiveDate: string;
  version: string;
  draftNote: string;
  sections: readonly PolicySection[];
}

/**
 * Full text of the University of Makati LIBRAS Terms and Conditions and Data
 * Privacy Policy (`docs/terms and conditions.md` and `docs/data privacy policy.md`).
 * Draft legal copy uses exact statutory and university terms that overlap with
 * `GLOSSARY.md` avoided words; lines holding those terms carry `glossary-ok`.
 */
export const LEGAL_DOCUMENTS: Record<PolicyDocumentKind, LegalDocument> = {
  terms: {
    kind: "terms",
    tabLabel: "Terms & Conditions",
    title: "LIBRAS Terms and Conditions",
    organizationLines: [
      "Library Borrowing and Records Administration System (LIBRAS)",
      "University of Makati Library Learning Commons (LLC)",
    ],
    effectiveDate: "Effective Date: [November, 24 , 2026]",
    version: "Version: Draft 1.0",
    draftNote:
      "Draft note for reviewers: Items in [square brackets] must be confirmed with the UMak Library Learning Commons and the UMak Data Protection Officer before publication. This draft is prepared by Group 1 (SoftEng1 / HCI 2026) and is not legal advice.",
    sections: [
      {
        heading: "Acceptance of Terms",
        blocks: [
          {
            kind: "paragraph",
            text:
              "These Terms and Conditions govern your use of the LIBRAS web portal and mobile application. By registering, activating an account, or using LIBRAS, you agree to these Terms, the LIBRAS Data Privacy Policy, and the policies of the UMak Library Learning Commons, including its Citizen's Charter and borrowing rules. Your electronic acceptance has the same effect as a signed agreement under Republic Act No. 8792 (Electronic Commerce Act of 2000). If you are below 18 years of age, your use of LIBRAS also requires the consent of your parent or guardian. If you do not agree, do not use LIBRAS.", // glossary-ok
          },
        ],
      },
      {
        heading: "Definitions",
        blocks: [
          {
            kind: "paragraph",
            text:
              'In these Terms, "LIBRAS" means the Library Borrowing and Records Administration System, including its web portal, mobile application, servers, and databases. "University," "we," or "us" means the University of Makati, acting through its Library Learning Commons. "User" or "you" means any person who registers for, accesses, or uses LIBRAS in any role.',
          },
        ],
      },
      {
        heading: "Eligibility and User Roles",
        blocks: [
          {
            kind: "bullets",
            items: [
              {
                text:
                  "Students, faculty, and NTP may use LIBRAS after registering or activating an account according to university procedures and while they remain enrolled or employed at UMak.",
              },
              {
                text:
                  "Guests and visiting researchers may use LIBRAS only after their registration is verified and approved. Their privileges are limited to catalog search, visit requests, and on-site reading unless the library grants more.", // glossary-ok
              },
              {
                text:
                  "Librarians and Admins may use only the modules and functions authorized by the Super Admin, and only for official library work.",
              },
            ],
          },
        ],
      },
      {
        heading: "Your Account",
        blocks: [
          {
            kind: "bullets",
            items: [
              { text: "Give accurate and complete information, and keep it up to date." },
              { text: "Keep your password confidential. Do not share your account or let others borrow under your name." },
              {
                text:
                  "All transactions made through your account or with your university ID are presumed to be yours until you report its loss or misuse to the library.",
              },
              { text: "Report lost IDs, suspected unauthorized access, or account problems to the library immediately." },
            ],
          },
        ],
      },
      {
        heading: "Borrowing, Renewals, and Reservations", // glossary-ok
        blocks: [
          {
            kind: "bullets",
            items: [
              {
                text:
                  "Borrowing limits, loan periods, and renewal rules depend on your borrower category and are set by the library [insert or link the LLC borrowing policy].", // glossary-ok
              },
              { text: "A renewal or reservation request submitted in LIBRAS is not final until the library approves it." }, // glossary-ok
              {
                text:
                  "Books must be returned in the same condition as when borrowed. Librarians will record the condition of each returned copy.",
              },
              { text: "Due date reminders are sent as a courtesy. Failure to receive a reminder does not excuse late returns." },
              {
                text:
                  "Availability shown in LIBRAS is updated in real time but may occasionally differ from the shelf. The circulation records kept in LIBRAS are presumed correct and prevail over screenshots, personal notes, or other records, unless proven otherwise.",
              },
            ],
          },
        ],
      },
      {
        heading: "Fines, Lost or Damaged Books, and Clearance",
        blocks: [
          {
            kind: "bullets",
            items: [
              { text: "Overdue books incur fines of [PHP X.00 per day per item], computed by LIBRAS according to library policy." },
              { text: "Lost or damaged books must be replaced or paid for according to library policy [insert replacement rules]." },
              {
                text:
                  "Fines are paid at [the University Cashier / designated office]. LIBRAS shows your fine balance but does not process online payments.",
              },
              {
                text:
                  "Unreturned books and unpaid fines may result in suspension of borrowing privileges and may hold your library clearance until settled.",
              },
              {
                text:
                  "If you believe a fine or record is wrong, you may ask the library to review it within [X days] of the notice. Records not disputed within this period are considered final.",
              },
            ],
          },
        ],
      },
      {
        heading: "Electronic Notices and Records",
        blocks: [
          {
            kind: "bullets",
            items: [
              {
                text:
                  "Notices about due dates, overdue items, fines, reservations, and visits are sent to the email address in your LIBRAS account and are considered received when sent. Keep your email address current and check it regularly.", // glossary-ok
              },
              {
                text:
                  "LIBRAS circulation, fine, clearance, and audit records are electronic documents under Republic Act No. 8792 and may be used as evidence in disciplinary, administrative, or legal proceedings.",
              },
              {
                text:
                  "Your activity in LIBRAS is logged and may be reviewed by authorized personnel to protect the system and the library collection.",
              },
            ],
          },
        ],
      },
      {
        heading: "On-Site Visits and Reading Sessions",
        blocks: [
          {
            kind: "paragraph",
            text:
              "Guests and visiting researchers must have an approved visit and a valid temporary reading pass before entering the library. Materials used on site may not be taken out of the library. Visitors must check out of their reading session and follow library rules and staff instructions while on the premises.", // glossary-ok
          },
        ],
      },
      {
        heading: "Acceptable Use",
        blocks: [
          { kind: "paragraph", text: "When using LIBRAS, you must not:" },
          {
            kind: "bullets",
            items: [
              { text: "Access or try to access accounts, modules, or data you are not authorized to use." },
              { text: "Tamper with circulation, fine, clearance, inventory, or audit records." },
              { text: "Probe, scan, or attack the system, or upload malicious code." },
              { text: "Use automated tools to scrape the catalog or user data." },
              { text: "Provide false identity or registration information, or impersonate another person." },
              { text: "Use another person's personal data obtained through LIBRAS for any purpose other than official library work." },
            ],
          },
          {
            kind: "paragraph",
            text:
              "Violations may lead to suspension or deactivation of your account, disciplinary action under the UMak Student Handbook or employee code of conduct, and liability under Republic Act No. 10175 (Cybercrime Prevention Act of 2012), the Data Privacy Act, and other applicable laws.",
          },
        ],
      },
      {
        heading: "Responsibilities of Librarians and Admins",
        blocks: [
          {
            kind: "paragraph",
            text:
              "Library personnel with access to LIBRAS must process personal data only for authorized library purposes, keep it confidential even after their assignment ends, sign out of shared desk computers after use, and report any suspected data breach to the Data Protection Officer immediately. All administrative actions are recorded in the audit trail.",
          },
        ],
      },
      {
        heading: "License to Use LIBRAS",
        blocks: [
          {
            kind: "paragraph",
            text:
              "Subject to these Terms, the University grants you a limited, personal, non-exclusive, non-transferable, and revocable license to use LIBRAS for library purposes only. This license ends automatically when your account is deactivated or when you breach these Terms.",
          },
        ],
      },
      {
        heading: "Intellectual Property",
        blocks: [
          {
            kind: "paragraph",
            text:
              "The LIBRAS software, design, and content are protected under Republic Act No. 8293 (Intellectual Property Code of the Philippines) and are owned by [the University of Makati and/or the development team, to be confirmed]. Catalog records are provided for library use only. You may not copy, modify, distribute, or reverse engineer LIBRAS except as allowed by law.",
          },
        ],
      },
      {
        heading: "Service Availability",
        blocks: [
          {
            kind: "paragraph",
            text:
              'LIBRAS is provided on an "as is" and "as available" basis. We aim to keep it available, but it may be interrupted for maintenance, updates, hardware or network problems, or events beyond our control. During outages, the library may process transactions manually. The University may change, suspend, or discontinue any feature of LIBRAS. You are responsible for your own device, internet connection, and any mobile data charges.',
          },
        ],
      },
      {
        heading: "Limitation of Liability",
        blocks: [
          {
            kind: "paragraph",
            text:
              "LIBRAS is provided to support library services. To the fullest extent allowed by Philippine law, the University, its officers, library personnel, and the LIBRAS development team are not liable for indirect, incidental, or consequential losses, including missed deadlines, lost academic opportunities, or lost data, arising from service interruptions, delayed or undelivered notifications, errors in displayed information, or your use of or inability to use LIBRAS. Nothing in these Terms limits liability for fraud or bad faith, which cannot be waived under Article 1171 of the Civil Code, or any right you have under the Data Privacy Act that cannot be waived.",
          },
        ],
      },
      {
        heading: "Indemnification",
        blocks: [
          {
            kind: "paragraph",
            text:
              "You agree to indemnify and hold harmless the University, its officers, library personnel, and the LIBRAS development team from claims, losses, damages, and expenses, including reasonable legal fees, arising from your breach of these Terms, your misuse of LIBRAS, or your unauthorized use of another person's personal data. This does not apply to losses caused by the University's own fraud, bad faith, or violation of law.",
          },
        ],
      },
      {
        heading: "Suspension and Termination",
        blocks: [
          {
            kind: "paragraph",
            text:
              "The University may suspend or deactivate an account that violates these Terms or library policy, or when the user is no longer enrolled, employed, or approved as a guest. Suspension may take effect immediately and without prior notice when needed to protect LIBRAS, its data, or the library collection. Obligations for unreturned books and unpaid fines continue after an account is deactivated.", // glossary-ok
          },
        ],
      },
      {
        heading: "Changes to These Terms",
        blocks: [
          {
            kind: "paragraph",
            text:
              "We may update these Terms from time to time. The updated Terms will be posted in LIBRAS with a new effective date. Continued use of LIBRAS after the change means you accept the updated Terms.",
          },
        ],
      },
      {
        heading: "General Provisions",
        blocks: [
          {
            kind: "bullets",
            items: [
              {
                lead: "Precedence:",
                text: "if these Terms conflict with a university-wide policy or regulation of the University of Makati, the university policy prevails.",
              },
              {
                lead: "Severability:",
                text: "if any provision of these Terms is found invalid or unenforceable, the remaining provisions stay in full force.",
              },
              {
                lead: "No waiver:",
                text: "the University's failure or delay in enforcing any provision is not a waiver of its right to enforce it later.",
              },
              {
                lead: "Entire agreement:",
                text: "these Terms, the LIBRAS Data Privacy Policy, and the library's published policies form the entire agreement on your use of LIBRAS.",
              },
              {
                lead: "Feedback:",
                text: "suggestions or feedback you give about LIBRAS may be used by the University to improve the system without obligation to you.",
              },
            ],
          },
        ],
      },
      {
        heading: "Governing Law and Venue",
        blocks: [
          {
            kind: "paragraph",
            text:
              "These Terms are governed by the laws of the Republic of the Philippines. Concerns should first be raised with the Library Learning Commons for amicable settlement. Any case that cannot be settled shall be filed exclusively in the proper courts of [Taguig City / Makati City, to be confirmed].",
          },
        ],
      },
      {
        heading: "Legal References",
        blocks: [
          {
            kind: "paragraph",
            text: "These Terms are based on the following Philippine laws. The summaries do not replace the official text.",
          },
          {
            kind: "bullets",
            items: [
              {
                lead: "Republic Act No. 8792, Electronic Commerce Act of 2000:",
                text: "validity of electronic acceptance and admissibility of electronic records.",
                url: "https://lawphil.net/statutes/repacts/ra2000/ra_8792_2000.html",
              },
              {
                lead: "Republic Act No. 10173, Data Privacy Act of 2012:",
                text: "handling of personal data and rights that cannot be waived.",
                url: "https://lawphil.net/statutes/repacts/ra2012/ra_10173_2012.html",
              },
              {
                lead: "Republic Act No. 10175, Cybercrime Prevention Act of 2012:",
                text: "illegal access, data interference, and system interference.",
                url: "https://lawphil.net/statutes/repacts/ra2012/ra_10175_2012.html",
              },
              {
                lead: "Republic Act No. 8293, Intellectual Property Code of the Philippines:",
                text: "protection of the LIBRAS software and content.",
                url: "https://lawphil.net/statutes/repacts/ra1997/ra_8293_1997.html",
              },
              {
                lead: "Republic Act No. 386, Civil Code of the Philippines:",
                text: "Article 1171 (liability for fraud cannot be waived) and the general rules on obligations and contracts.",
                url: "https://lawphil.net/statutes/repacts/ra1949/ra_386_1949.html",
              },
            ],
          },
        ],
      },
      {
        heading: "Contact Us",
        blocks: [
          {
            kind: "paragraph",
            text:
              "University of Makati Library Learning Commons\n2nd Floor, Administration Building, University of Makati\nEmail: [library email, to be confirmed]\nOffice hours: [to be confirmed]",
          },
        ],
      },
      {
        heading: "Acknowledgment",
        blocks: [
          {
            kind: "paragraph",
            text:
              'By selecting "I Agree" during registration, you confirm that you have read and understood the LIBRAS Data Privacy Policy and these Terms and Conditions, and that you consent to the processing of your personal data as described above.',
          },
        ],
      },
    ],
  },
  privacy: {
    kind: "privacy",
    tabLabel: "Privacy Policy",
    title: "LIBRAS Data Privacy Policy",
    organizationLines: [
      "Library Borrowing and Records Administration System (LIBRAS)",
      "University of Makati Library Learning Commons (LLC)",
    ],
    effectiveDate: "Effective Date: [November, 24 , 2026]",
    version: "Version: Draft 1.0",
    draftNote:
      "Draft note for reviewers: Items in [square brackets] must be confirmed with the UMak Library Learning Commons and the UMak Data Protection Officer before publication. This draft is prepared by Group 1 (SoftEng1 / HCI 2026) and is not legal advice.",
    sections: [
      {
        heading: "Introduction",
        blocks: [
          {
            kind: "paragraph",
            text:
              "The University of Makati (UMak), through its Library Learning Commons (LLC), respects your right to privacy. This Privacy Policy explains how LIBRAS, the web portal and mobile application used for library circulation, catalog access, visitor management, and records administration, collects, uses, stores, shares, and protects your personal data.\nThis Policy is issued in accordance with Republic Act No. 10173, the Data Privacy Act of 2012 (DPA), its Implementing Rules and Regulations (IRR), and the issuances of the National Privacy Commission (NPC). It applies to all users of LIBRAS: students, faculty members, Non-Teaching Personnel (NTP), guests and visiting researchers, librarians, Admins, and the Super Admin.", // glossary-ok
          },
        ],
      },
      {
        heading: "Definitions",
        blocks: [
          { kind: "paragraph", text: "In this Policy, the following terms have these meanings:" },
          {
            kind: "bullets",
            items: [
              {
                lead: "LIBRAS:",
                text: "the Library Borrowing and Records Administration System, including its web portal, mobile application, servers, and databases.",
              },
              {
                lead: "University, we, or us:",
                text: "the University of Makati, acting through its Library Learning Commons.",
              },
              {
                lead: "User or you:",
                text: "any person who registers for, accesses, or uses LIBRAS in any role.",
              },
              {
                lead: "Personal data:",
                text: "personal information and sensitive personal information as defined in Section 3 of the Data Privacy Act.",
              },
              {
                lead: "Processing:",
                text:
                  "any operation performed on personal data, including collection, recording, storage, use, disclosure, and disposal, as defined in Section 3(j) of the Data Privacy Act.",
              },
            ],
          },
        ],
      },
      {
        heading: "Personal Information Controller",
        blocks: [
          {
            kind: "paragraph",
            text:
              "The Personal Information Controller (PIC) for LIBRAS is the University of Makati, J.P. Rizal Extension, West Rembo, Taguig City, acting through the Library Learning Commons, 2nd Floor, Administration Building. The University decides what personal data is collected through LIBRAS and how it is used.",
          },
        ],
      },
      {
        heading: "Personal Data We Collect",
        blocks: [
          { kind: "paragraph", text: "We collect only the data needed to provide library services. Depending on your role, this includes:" },
          {
            kind: "bullets",
            items: [
              {
                text:
                  "Identity and account data: full name, student number or employee ID, institutional email address, username, password (stored only in hashed form), user role, and account status.",
              },
              {
                text:
                  "Academic and employment data: college, department, program or year level, and borrower category (student, faculty, or NTP).", // glossary-ok
              },
              {
                text:
                  "Guest and visiting researcher data: full name, contact number, email address, home institution, research affiliation, purpose of visit, and the identification documents required for identity verification.", // glossary-ok
              },
              {
                text:
                  "Circulation data: books borrowed and returned, checkout and due dates, renewal requests, reservations, condition notes on returned copies, overdue records, fines, payment status, and library clearance status.", // glossary-ok
              },
              {
                text:
                  "Visit data: on-site visit applications, temporary reading passes, reading session check-in and check-out times, and visit history.",
              },
              { text: "Barcode data: the identifier read from your university ID card when it is scanned at the circulation desk." },
              {
                text:
                  "Activity and audit data: the user name, activity performed, module accessed, date and time, and action status of important actions taken in LIBRAS.",
              },
              {
                text:
                  "Technical data: IP address, device type, operating system, app version, session tokens, and error logs, collected to keep the system secure and working.",
              },
            ],
          },
          {
            kind: "paragraph",
            text:
              "LIBRAS does not intentionally collect sensitive personal information as defined in Section 3(l) of the DPA, such as health, religious, or political data. Government-issued ID numbers presented by guests for verification are treated as sensitive personal information and are handled with additional safeguards. Please do not enter sensitive information in free-text fields.", // glossary-ok
          },
        ],
      },
      {
        heading: "How We Collect Personal Data",
        blocks: [
          {
            kind: "bullets",
            items: [
              {
                text:
                  "Directly from you, when you register or activate an account, update your profile, request a renewal or visit, or check in to a reading session.",
              },
              {
                text:
                  "From university records, when your enrollment or employment details are used to verify your eligibility for library privileges.",
              },
              {
                text:
                  "From library staff, when librarians record a checkout, return, fine, clearance, or the condition of a returned copy.",
              },
              { text: "Automatically, through system logs and audit trails generated when you use LIBRAS." },
            ],
          },
        ],
      },
      {
        heading: "Purposes and Lawful Basis of Processing",
        blocks: [
          { kind: "paragraph", text: "We process your personal data for the following purposes:" },
          {
            kind: "bullets",
            items: [
              { text: "To create, verify, and manage your library account and confirm your eligibility for borrowing privileges." },
              { text: "To process checkouts, returns, renewals, and reservations, and to show you real-time book availability." }, // glossary-ok
              { text: "To send email notices about due dates, overdue items, reservation updates, and visit approvals." }, // glossary-ok
              { text: "To compute and track overdue fines and to process student library clearance." },
              { text: "To approve and log guest visits and on-site reading sessions." }, // glossary-ok
              { text: "To protect the library collection, prevent unauthorized access, and keep audit trails for accountability." },
              {
                text:
                  "To generate reports on circulation, inventory, and facility use. Reports used for planning are aggregated or anonymized wherever possible.",
              },
              {
                text:
                  "To comply with university policies, government auditing and records rules, and lawful orders of courts or government agencies.",
              },
            ],
          },
          {
            kind: "paragraph",
            text:
              "Under Sections 12 and 13 of the DPA, we rely on the following lawful bases: the performance of library services you request as a member of the university community; the University's functions as a public educational institution and its legitimate interest in managing library resources; compliance with legal obligations; and, for guests, visiting researchers, and optional features, your consent. Where consent is the basis, you may withdraw it at any time, although this may prevent us from providing the related service.", // glossary-ok
          },
        ],
      },
      {
        heading: "Minors",
        blocks: [
          {
            kind: "paragraph",
            text:
              "Some LIBRAS users, including senior high school students, may be below 18 years of age. Their personal data is processed only for library services connected with their enrollment. Where consent is required for a user who is a minor, the University will obtain it from the parent or legal guardian in accordance with university procedures [confirm with the UMak DPO].",
          },
        ],
      },
      {
        heading: "Sharing and Disclosure",
        blocks: [
          { kind: "paragraph", text: "We do not sell or rent your personal data. We share it only as follows:" },
          {
            kind: "bullets",
            items: [
              {
                text:
                  "Authorized university personnel: librarians, student assistants, and Admins can access only the data needed for their assigned functions, as set by the Super Admin's role permissions.",
              },
              {
                text:
                  "Other university offices: clearance status and unsettled obligations may be shared with the Registrar, your college, or the Human Resource office when required for clearance processing.",
              },
              {
                text:
                  "Service providers (Personal Information Processors): LIBRAS uses Supabase for database and authentication services, Render for application hosting, and Brevo for sending notifications. These providers process data only on the University's instructions and are bound by agreements requiring confidentiality and security, as required by Section 14 of the DPA.",
              },
              {
                text:
                  "Legal requirements and protection of rights: when disclosure is required by law, regulation, subpoena, or a lawful order of a court or government agency, or when necessary to protect the rights, property, or safety of the University, the library collection, or its users, including the recovery of unreturned materials and unpaid obligations.",
              },
            ],
          },
        ],
      },
      {
        heading: "Cross-Border Data Transfer",
        blocks: [
          {
            kind: "paragraph",
            text:
              "Our cloud service providers may store or process data on servers located outside the Philippines (Singapore, for both Supabase and Render). The University remains accountable for your personal data under Section 21 of the DPA and requires these providers to apply security measures comparable to those required under Philippine law.",
          },
        ],
      },
      {
        heading: "Data Retention",
        blocks: [
          { kind: "paragraph", text: "We keep personal data only for as long as needed for the purposes above or as required by law:" },
          {
            kind: "bullets",
            items: [
              {
                text:
                  "Account data is kept while you are an active member of the university community and for [X years] after graduation, separation, or account deactivation.",
              },
              { text: "Circulation, fine, and clearance records are kept for [X years] for audit and clearance purposes." },
              { text: "Guest and visiting researcher records, including verification documents, are kept for [X months] after the last visit." }, // glossary-ok
              { text: "Audit trail records are kept for [X years] and cannot be altered or deleted by ordinary users or Admins." },
            ],
          },
          {
            kind: "paragraph",
            text:
              "Records may be kept beyond these periods while a complaint, investigation, audit, or legal proceeding is pending. After the retention period, data is securely deleted or anonymized, consistent with university records management rules and Republic Act No. 9470 (National Archives of the Philippines Act of 2007).",
          },
        ],
      },
      {
        heading: "Monitoring and Audit Logs",
        blocks: [
          {
            kind: "paragraph",
            text:
              "To protect LIBRAS, its data, and the library collection, the University records and may review activity in the system, including sign-ins, transactions, and administrative actions. By using LIBRAS, you acknowledge this monitoring. Audit logs may be used to investigate incidents, resolve disputes about borrowing records or fines, and support disciplinary or legal proceedings.",
          },
        ],
      },
      {
        heading: "Security Measures",
        blocks: [
          {
            kind: "paragraph",
            text:
              "In line with Section 20 of the DPA and NPC Circular No. 2023-06 on security of personal data, we apply organizational, physical, and technical safeguards, including:",
          },
          {
            kind: "bullets",
            items: [
              { text: "Encrypted connections (HTTPS/SSL) between the apps and the servers." },
              { text: "Hashed passwords and secure session handling through Supabase Authentication." },
              { text: "Role-based access control, so each Admin and librarian sees only the modules the Super Admin has authorized." },
              { text: "Audit trails of important actions that cannot be modified by unauthorized users." },
              {
                text:
                  "Security testing before release, including static code scanning (Semgrep), secret detection (Gitleaks), and dynamic vulnerability testing (OWASP ZAP).",
              },
              { text: "Confidentiality obligations for all personnel with access to personal data." },
            ],
          },
          {
            kind: "paragraph",
            text:
              "No system is completely secure. If a personal data breach occurs, the University will assess it and, when the mandatory notification conditions under NPC Circular No. 16-03 are met, notify the NPC and affected users within seventy-two (72) hours of knowledge of the breach. Not every security incident or system error is a notifiable breach.",
          },
        ],
      },
      {
        heading: "Your Rights as a Data Subject",
        blocks: [
          { kind: "paragraph", text: "Under Sections 16 to 18 of the DPA, you have the right to:" },
          {
            kind: "bullets",
            items: [
              { text: "Be informed that your personal data is being collected and processed, and why." },
              {
                text:
                  "Access your personal data. Much of it, including your profile, borrowing history, and fines, is available in your LIBRAS account.",
              },
              { text: "Object to processing based on consent or legitimate interest." },
              {
                text:
                  "Rectify inaccurate or incomplete data. You can update permitted fields in your profile or ask the library to correct other records.",
              },
              {
                text:
                  "Erasure or blocking of data that is no longer necessary, was unlawfully obtained, or is processed without a lawful basis, subject to retention required by law or for settling outstanding obligations.",
              },
              { text: "Data portability, to obtain a copy of your data in a commonly used electronic format." },
              {
                text:
                  "Damages for harm caused by inaccurate, incomplete, outdated, false, unlawfully obtained, or unauthorized use of your personal data.",
              },
              { text: "File a complaint with the National Privacy Commission (privacy.gov.ph) if you believe your rights have been violated." },
            ],
          },
          {
            kind: "paragraph",
            text:
              "To exercise these rights, send a written request to the Data Protection Officer below. We will verify your identity before acting on a request and will respond within the period set by NPC rules, or within a reasonable time where none is set. These rights are not absolute. We may decline or limit a request that is manifestly unfounded, excessive, or repetitive, that would affect the rights of other people, or that concerns records the University must keep by law or for accountability, such as circulation, fine, clearance, and audit records. Deactivating or deleting an account does not erase records needed to settle unreturned books or unpaid fines. Removed data may remain in secured backups until those backups expire on their regular schedule.",
          },
        ],
      },
      {
        heading: "Mobile App Permissions and Cookies",
        blocks: [
          {
            kind: "paragraph",
            text:
              "The LIBRAS mobile app may ask for camera access to scan barcodes and for notification permissions. You may refuse or withdraw these permissions in your device settings; some features may then be unavailable. The web portal uses only essential cookies or local storage needed to keep you signed in and secure. LIBRAS does not use advertising or third-party tracking cookies.",
          },
        ],
      },
      {
        heading: "Your Responsibilities",
        blocks: [
          { kind: "paragraph", text: "The protection of your personal data also depends on you. When using LIBRAS, you agree to:" },
          {
            kind: "bullets",
            items: [
              {
                text:
                  "Provide accurate and current information. The University is not responsible for notices that fail to reach you, or for errors in your records, caused by incorrect or outdated information you provided.",
              },
              {
                text:
                  "Keep your password and session private, sign out on shared computers, and keep your device secure. The University is not responsible for unauthorized access that results from your own disclosure of credentials or from a compromised personal device.",
              },
              {
                text: "Use other people's personal data that you see in LIBRAS, such as borrower records, only for authorized library work.", // glossary-ok
              },
              { text: "Report a suspected data breach or misuse of your account to the library or the Data Protection Officer without delay." },
            ],
          },
        ],
      },
      {
        heading: "Changes to This Privacy Policy",
        blocks: [
          {
            kind: "paragraph",
            text:
              "We may update this Policy to reflect changes in LIBRAS, university policy, or the law. The updated version will be posted in LIBRAS with a new effective date, and significant changes will be announced through the app or by email. Continued use of LIBRAS after the effective date means you acknowledge the updated Policy. Where the law requires new consent, we will ask for it.",
          },
        ],
      },
      {
        heading: "Legal Bases and References",
        blocks: [
          {
            kind: "paragraph",
            text: "This Policy is based on the following Philippine laws and issuances. The summaries explain how each is applied here and do not replace the official text.",
          },
          {
            kind: "bullets",
            items: [
              {
                lead: "Republic Act No. 10173, Data Privacy Act of 2012:",
                text:
                  "Section 11 (general data privacy principles), Sections 12 and 13 (lawful criteria for processing), Section 14 (personal information processors), Sections 16 to 18 (rights of the data subject), Section 20 (security of personal information), and Section 21 (accountability for transfers).",
                url: "https://lawphil.net/statutes/repacts/ra2012/ra_10173_2012.html",
              },
              {
                lead: "Implementing Rules and Regulations of the Data Privacy Act (2016):",
                text: "detailed rules on consent, data subject rights, and security measures.",
              },
              {
                lead: "NPC Circular No. 16-03, Personal Data Breach Management:",
                text: "breach assessment and the 72-hour notification requirement.",
              },
              {
                lead: "NPC Circular No. 2023-06, Security of Personal Data in the Government and the Private Sector:",
                text: "organizational, physical, and technical safeguards.",
              },
              {
                lead: "Republic Act No. 10175, Cybercrime Prevention Act of 2012:",
                text: "offenses such as illegal access and data interference.",
                url: "https://lawphil.net/statutes/repacts/ra2012/ra_10175_2012.html",
              },
              {
                lead: "Republic Act No. 9470, National Archives of the Philippines Act of 2007:",
                text: "management and disposal of public records.",
                url: "https://lawphil.net/statutes/repacts/ra2007/ra_9470_2007.html",
              },
            ],
          },
        ],
      },
      {
        heading: "Contact the Data Protection Officer",
        blocks: [
          {
            kind: "paragraph",
            text:
              "Data Protection Officer, University of Makati\nEmail: [dpo@umak.edu.ph, to be confirmed]\nAddress: University of Makati, J.P. Rizal Extension, West Rembo, Taguig City\nLibrary concerns: Library Learning Commons, 2nd Floor, Administration Building",
          },
        ],
      },
    ],
  },
};
