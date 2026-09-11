# LIBRAS — Data Dictionary

**System Name:** Library Borrowing and Records Administration System (LIBRAS)
**Target Institution:** University of Makati Library Learning Commons (UMak LLC)
**Target Database Engine:** PostgreSQL 15+
**Document Version:** 1.0 — September 11, 2026
**Prepared by:** LIBRAS Development Team, BS Computer Science — University of Makati

---

## 1. Document Purpose

This Data Dictionary provides the authoritative, column-level specification for every table in the LIBRAS PostgreSQL database schema. Each entry documents the column name, PostgreSQL data type, constraints (nullability, keys, defaults, and domain checks), and a business-context description. This document is designed for use alongside the LIBRAS ERD Specification and serves as the canonical reference for the development, testing, and maintenance teams.

> [!IMPORTANT]
> All `TIMESTAMPTZ` columns store timestamps **with time zone** in UTC. Application layers (Flutter, React) are responsible for converting to Philippine Standard Time (PST / UTC+8) for display. All `VARCHAR` length limits represent maximum character counts, not byte counts.

---

## 2. Notation Legend

| Symbol | Meaning |
|---|---|
| **PK** | Primary Key |
| **FK** | Foreign Key |
| **UK** | Unique Key (alternate key / candidate key) |
| **NN** | NOT NULL — column must contain a value |
| **AI** | Auto-Increment (PostgreSQL `SERIAL` / `GENERATED ALWAYS AS IDENTITY`) |
| **D=** | Default value |
| **CK** | CHECK constraint — enforced domain validation |

---

## 3. Table Definitions

---

### 3.1 Table: `patron`

**Description:** Stores identity and academic profile data for all internal library users — Students, Faculty, and Non-Teaching Personnel (NTP) — who hold active University of Makati credentials. Each patron record generates a unique scannable digital barcode for circulation desk transactions.

**Business Owner:** Circulation Module — User Identity & Authentication
**Record Volume Estimate:** ~15,000–20,000 active patrons per academic year

| # | Column Name | Data Type | Length / Precision | Constraints | Default | Description |
|---|---|---|---|---|---|---|
| 1 | `patron_id` | `SERIAL` | 4 bytes | PK, AI, NN | Auto | Auto-generated surrogate primary key uniquely identifying each patron record. |
| 2 | `id_number` | `VARCHAR` | 20 | UK, NN | — | Official UMak Student ID or Employee ID number (e.g., `K12255842`). Must be unique across all patrons. Used for manual lookup fallback when barcode scanning is unavailable. |
| 3 | `umak_email` | `VARCHAR` | 100 | UK, NN, CK | — | Institutional email address. **CHECK:** Must match pattern `%@umak.edu.ph`. Serves as the primary authentication credential and email notification target. |
| 4 | `first_name` | `VARCHAR` | 80 | NN | — | Patron's given or first name as registered in university records. |
| 5 | `middle_name` | `VARCHAR` | 80 | Nullable | `NULL` | Patron's middle name. Optional; set to `NULL` if not applicable. |
| 6 | `last_name` | `VARCHAR` | 80 | NN | — | Patron's surname or family name as registered in university records. |
| 7 | `college_department` | `VARCHAR` | 100 | NN | — | The college or administrative department the patron belongs to (e.g., `College of Computing and Information Sciences`, `Human Resources`). |
| 8 | `academic_program` | `VARCHAR` | 100 | Nullable | `NULL` | The academic degree program or course (e.g., `BS Computer Science`). Nullable for NTP who are not enrolled in any program. |
| 9 | `contact_phone` | `VARCHAR` | 15 | NN | — | Primary mobile phone number in national or international format (e.g., `09171234567` or `+639171234567`). |
| 10 | `patron_type` | `VARCHAR` | 10 | NN, CK | — | Patron classification. **CHECK:** `IN ('STUDENT', 'FACULTY', 'NTP')`. Determines borrowing privilege rules and clearance workflows. |
| 11 | `academic_status` | `VARCHAR` | 10 | NN, CK | D= `'ACTIVE'` | Current academic enrollment or employment status. **CHECK:** `IN ('ACTIVE', 'FLAGGED')`. `FLAGGED` indicates irregular status requiring administrative review before borrowing is permitted. |
| 12 | `clearance_status` | `VARCHAR` | 10 | NN, CK | D= `'CLEAR'` | Graduation clearance standing. **CHECK:** `IN ('CLEAR', 'ON_HOLD')`. Automatically set to `ON_HOLD` by the penalty engine when overdue or unreturned items exist; manually or automatically restored to `CLEAR` upon full resolution. |
| 13 | `barcode` | `VARCHAR` | 50 | UK, NN | — | System-generated, unique high-contrast digital barcode string displayed on the patron's mobile device. Scanned at the circulation desk via barcode scanner gun to initiate checkout/return transactions. |
| 14 | `created_at` | `TIMESTAMPTZ` | — | NN | D= `NOW()` | Timestamp of initial patron record creation in UTC. |
| 15 | `updated_at` | `TIMESTAMPTZ` | — | NN | D= `NOW()` | Timestamp of the most recent modification to this patron record. Updated via trigger or application logic on every `UPDATE`. |

> [!NOTE]
> **Unique Indexes:** `id_number`, `umak_email`, and `barcode` each carry unique constraints to prevent duplicate patron registrations and ensure barcode scan accuracy.

---

### 3.2 Table: `guest`

**Description:** Stores registration and identification data for external visitors, researchers, alumni, and non-UMak personnel who access the Library Learning Commons through the self-service guest portal. Each guest record generates a temporary digital visitor pass with a scannable barcode.

**Business Owner:** Walk-In & Guest Portal Module
**Record Volume Estimate:** ~500–2,000 guest registrations per semester

| # | Column Name | Data Type | Length / Precision | Constraints | Default | Description |
|---|---|---|---|---|---|---|
| 1 | `guest_id` | `SERIAL` | 4 bytes | PK, AI, NN | Auto | Auto-generated surrogate primary key uniquely identifying each guest record. |
| 2 | `first_name` | `VARCHAR` | 80 | NN | — | Guest's given or first name as self-reported during registration. |
| 3 | `middle_name` | `VARCHAR` | 80 | Nullable | `NULL` | Guest's middle name. Optional. |
| 4 | `last_name` | `VARCHAR` | 80 | NN | — | Guest's surname or family name. |
| 5 | `home_institution` | `VARCHAR` | 150 | NN | — | The guest's home university, organization, or employer (e.g., `Polytechnic University of the Philippines`, `Department of Education`). |
| 6 | `contact_number` | `VARCHAR` | 15 | NN | — | Primary contact phone number for the guest. |
| 7 | `email` | `VARCHAR` | 100 | NN | — | Valid personal or institutional email address for correspondence and pass delivery. No domain restriction enforced (unlike patron accounts). |
| 8 | `visit_purpose` | `TEXT` | Unlimited | NN | — | Detailed free-text description of the guest's specific purpose of visit (e.g., `Thesis research on urban planning policy archives`, `Archival access for historical manuscript review`). |
| 9 | `visitor_pass_barcode` | `VARCHAR` | 50 | UK, NN | — | System-generated temporary digital barcode displayed on the guest's mobile screen. Scanned by library staff at the entrance desk to log entry. |
| 10 | `pass_valid_from` | `TIMESTAMPTZ` | — | NN | — | Timestamp marking the start of the visitor pass validity window. |
| 11 | `pass_valid_until` | `TIMESTAMPTZ` | — | NN, CK | — | Timestamp marking the end of the visitor pass validity window. **CHECK:** `pass_valid_until > pass_valid_from`. |
| 12 | `created_at` | `TIMESTAMPTZ` | — | NN | D= `NOW()` | Timestamp of initial guest record creation. |

---

### 3.3 Table: `staff`

**Description:** Stores identity and role assignment data for all library system personnel — OIC-Director, Reference & User Services Librarian, Metadata/Cataloging Librarian, and Student Assistants. Role values drive the Role-Based Access Control (RBAC) matrix governing dashboard permissions.

**Business Owner:** System Administration — Role-Based Authentication
**Record Volume Estimate:** ~10–30 active staff records

| # | Column Name | Data Type | Length / Precision | Constraints | Default | Description |
|---|---|---|---|---|---|---|
| 1 | `staff_id` | `SERIAL` | 4 bytes | PK, AI, NN | Auto | Auto-generated surrogate primary key uniquely identifying each staff record. |
| 2 | `employee_id` | `VARCHAR` | 20 | UK, NN | — | Official UMak Employee ID number. Unique across all staff records. |
| 3 | `first_name` | `VARCHAR` | 80 | NN | — | Staff member's given or first name. |
| 4 | `middle_name` | `VARCHAR` | 80 | Nullable | `NULL` | Staff member's middle name. Optional. |
| 5 | `last_name` | `VARCHAR` | 80 | NN | — | Staff member's surname or family name. |
| 6 | `umak_email` | `VARCHAR` | 100 | UK, NN | — | Official institutional email address (`@umak.edu.ph`). Used for system login and administrative notifications. |
| 7 | `role` | `VARCHAR` | 25 | NN, CK | — | Assigned RBAC role determining system permissions. **CHECK:** `IN ('OIC_DIRECTOR', 'REFERENCE_LIBRARIAN', 'CATALOGING_LIBRARIAN', 'STUDENT_ASSISTANT')`. |
| 8 | `is_active` | `BOOLEAN` | 1 byte | NN | D= `TRUE` | Employment activity flag. `FALSE` indicates a deactivated staff account (e.g., end of contract, resigned) whose credentials can no longer authenticate. |
| 9 | `created_at` | `TIMESTAMPTZ` | — | NN | D= `NOW()` | Timestamp of initial staff record creation. |
| 10 | `updated_at` | `TIMESTAMPTZ` | — | NN | D= `NOW()` | Timestamp of the most recent modification to this staff record. |

---

### 3.4 Table: `book`

**Description:** Stores catalog and physical inventory data for each individual book copy in the UMak Library Learning Commons collection. Books are tracked at the **accession copy level** — each physical copy has a unique accession number that doubles as its barcode identifier, regardless of whether multiple copies of the same title exist.

**Business Owner:** Inventory & Catalog Management Module
**Record Volume Estimate:** ~10,000–50,000 accession records

| # | Column Name | Data Type | Length / Precision | Constraints | Default | Description |
|---|---|---|---|---|---|---|
| 1 | `accession_number` | `VARCHAR` | 30 | PK, NN | — | **Natural primary key.** The globally unique accession number assigned to this physical book copy upon acquisition. Also serves as the barcode value printed on the physical label and scanned during circulation. Format determined by UMak LLC accession policy. |
| 2 | `title` | `VARCHAR` | 300 | NN | — | Full title of the book, including subtitle if applicable. |
| 3 | `isbn` | `VARCHAR` | 17 | Nullable | `NULL` | International Standard Book Number in ISBN-10 (10 chars) or ISBN-13 (13 chars, with hyphens up to 17 chars) format. Nullable for older or locally published materials lacking an ISBN. |
| 4 | `lc_call_number` | `VARCHAR` | 50 | Nullable | `NULL` | Library of Congress Classification call number (e.g., `QA76.73.P98`). Used for physical shelf location and catalog organization. Nullable for uncatalogued items. |
| 5 | `collection_category` | `VARCHAR` | 50 | NN | — | Classification of the collection section the book belongs to (e.g., `General Circulation`, `Filipiniana`, `Reserve`, `Reference`, `Periodicals`, `Thesis/Dissertation`). |
| 6 | `college_reference` | `VARCHAR` | 100 | Nullable | `NULL` | The college or academic unit associated with this book's subject matter (e.g., `College of Business Administration`). Nullable for general-interest titles. |
| 7 | `publication_year` | `SMALLINT` | 2 bytes | Nullable, CK | `NULL` | Year of publication. **CHECK:** `publication_year >= 1000 AND publication_year <= EXTRACT(YEAR FROM CURRENT_DATE) + 1`. Nullable for undated materials. |
| 8 | `physical_condition` | `VARCHAR` | 10 | NN, CK | D= `'GOOD'` | Current physical state of the book copy. **CHECK:** `IN ('GOOD', 'FAIR', 'POOR', 'DAMAGED')`. Updated by staff during returns and periodic inventory audits. |
| 9 | `availability_status` | `VARCHAR` | 15 | NN, CK | D= `'AVAILABLE'` | Current circulation availability state. **CHECK:** `IN ('AVAILABLE', 'BORROWED', 'RETURNED', 'OVERDUE', 'LOST', 'DAMAGED')`. Automatically updated by transaction triggers during checkout, return, and overdue detection workflows. |
| 10 | `created_at` | `TIMESTAMPTZ` | — | NN | D= `NOW()` | Timestamp of initial book record creation (cataloging date). |
| 11 | `updated_at` | `TIMESTAMPTZ` | — | NN | D= `NOW()` | Timestamp of the most recent modification to this book record. |

> [!TIP]
> The `accession_number` serves as both the primary key and the physical barcode value. This design eliminates a separate surrogate key and ensures that every barcode scan maps directly to a single database record with zero ambiguity — a critical requirement for the 30-second checkout target.

---

### 3.5 Table: `book_author`

**Description:** Associative entity decomposing the multi-valued author attribute from the `book` table into atomic rows, achieving **First Normal Form (1NF)** compliance. Supports multi-author works by assigning an explicit display order to each author entry per accession copy.

**Business Owner:** Catalog Management — Metadata/Cataloging Librarian
**Record Volume Estimate:** ~1.2–2.5× the `book` table row count (average 1.5 authors per title)

| # | Column Name | Data Type | Length / Precision | Constraints | Default | Description |
|---|---|---|---|---|---|---|
| 1 | `book_author_id` | `SERIAL` | 4 bytes | PK, AI, NN | Auto | Auto-generated surrogate primary key. |
| 2 | `accession_number` | `VARCHAR` | 30 | FK → `book.accession_number`, NN | — | Foreign key referencing the parent `book` record. **ON DELETE CASCADE** — removing a book automatically removes its author entries. |
| 3 | `author_name` | `VARCHAR` | 150 | NN | — | Full name of the author in "Last Name, First Name Middle Initial" format (e.g., `Pressman, Roger S.`). |
| 4 | `author_order` | `SMALLINT` | 2 bytes | NN | D= `1` | Ordinal position of this author relative to others for the same book (1 = primary author, 2 = second author, etc.). Used for display ordering in the catalog UI. |

**Composite Unique Constraint:** `UNIQUE (accession_number, author_order)` — prevents duplicate author ordering for the same book copy.

---

### 3.6 Table: `borrowing_transaction`

**Description:** The central circulation ledger recording every book checkout, return, and status transition. Each row captures the full transaction lifecycle from the initial scan-triggered checkout through final return or loss/damage resolution. This table drives the overdue detection engine, penalty generation, and graduation clearance hold automation.

**Business Owner:** Library Circulation & Transaction Desk Module
**Record Volume Estimate:** ~5,000–15,000 transactions per semester

| # | Column Name | Data Type | Length / Precision | Constraints | Default | Description |
|---|---|---|---|---|---|---|
| 1 | `transaction_id` | `SERIAL` | 4 bytes | PK, AI, NN | Auto | Auto-generated surrogate primary key uniquely identifying each circulation transaction. |
| 2 | `patron_id` | `INTEGER` | 4 bytes | FK → `patron.patron_id`, NN | — | Foreign key referencing the borrowing patron. **ON DELETE RESTRICT** — patrons with transaction history cannot be deleted. |
| 3 | `accession_number` | `VARCHAR` | 30 | FK → `book.accession_number`, NN | — | Foreign key referencing the borrowed book copy's accession number. **ON DELETE RESTRICT** — books with transaction history cannot be deleted. |
| 4 | `staff_id` | `INTEGER` | 4 bytes | FK → `staff.staff_id`, NN | — | Foreign key referencing the librarian or student assistant who processed this transaction at the circulation desk. **ON DELETE RESTRICT**. |
| 5 | `borrow_date` | `DATE` | 4 bytes | NN | D= `CURRENT_DATE` | Calendar date on which the book was checked out to the patron. |
| 6 | `due_date` | `DATE` | 4 bytes | NN, CK | — | Calculated return deadline. **CHECK:** `due_date > borrow_date`. Determined by library lending policy rules (e.g., 3 days for students, 7 days for faculty). |
| 7 | `actual_return_date` | `DATE` | 4 bytes | Nullable, CK | `NULL` | Calendar date on which the book was physically returned. `NULL` while the transaction status is `ACTIVE` or `OVERDUE`. **CHECK:** `actual_return_date >= borrow_date` (when not `NULL`). |
| 8 | `transaction_status` | `VARCHAR` | 15 | NN, CK | D= `'ACTIVE'` | Current lifecycle state of the transaction. **CHECK:** `IN ('ACTIVE', 'RETURNED', 'OVERDUE', 'LOST_DAMAGED')`. Transitions are managed by the circulation engine and overdue batch processor. |
| 9 | `created_at` | `TIMESTAMPTZ` | — | NN | D= `NOW()` | Timestamp of transaction record creation (checkout moment). |
| 10 | `updated_at` | `TIMESTAMPTZ` | — | NN | D= `NOW()` | Timestamp of the most recent status change or data update. |

> [!WARNING]
> **Referential Integrity Policy:** All three foreign keys use `ON DELETE RESTRICT` to prevent orphaned transaction records. Patron, book, and staff records referenced by any transaction cannot be deleted — they must be soft-deleted (flagged) instead.

---

### 3.7 Table: `penalty`

**Description:** Tracks all monetary fines and disciplinary penalties assessed against patrons as a result of overdue returns, lost items, damaged items, or manual disciplinary actions. This table feeds the automated graduation clearance hold engine — any `UNPAID` penalty triggers a clearance status change to `ON_HOLD` on the associated patron's record.

**Business Owner:** Overdue Flagging & Clearance Hold Engine
**Record Volume Estimate:** ~500–3,000 penalty records per semester

| # | Column Name | Data Type | Length / Precision | Constraints | Default | Description |
|---|---|---|---|---|---|---|
| 1 | `penalty_id` | `SERIAL` | 4 bytes | PK, AI, NN | Auto | Auto-generated surrogate primary key uniquely identifying each penalty record. |
| 2 | `patron_id` | `INTEGER` | 4 bytes | FK → `patron.patron_id`, NN | — | Foreign key referencing the patron who incurred this penalty. **ON DELETE RESTRICT**. |
| 3 | `transaction_id` | `INTEGER` | 4 bytes | FK → `borrowing_transaction.transaction_id`, NN | — | Foreign key referencing the originating borrowing transaction that caused this penalty. **ON DELETE RESTRICT**. |
| 4 | `penalty_type` | `VARCHAR` | 15 | NN, CK | — | Classification of the penalty. **CHECK:** `IN ('OVERDUE_FINE', 'LOST_ITEM', 'DAMAGED_ITEM', 'DISCIPLINARY')`. Determines the calculation formula applied. |
| 5 | `amount` | `NUMERIC` | (10, 2) | NN, CK | — | Monetary fine amount in Philippine Pesos (₱). **CHECK:** `amount >= 0`. A value of `0.00` is valid for non-monetary disciplinary penalties. |
| 6 | `settlement_status` | `VARCHAR` | 10 | NN, CK | D= `'UNPAID'` | Current payment/resolution status. **CHECK:** `IN ('UNPAID', 'PAID', 'WAIVED')`. `WAIVED` is reserved for penalties forgiven by authorized staff (OIC-Director or Reference Librarian). |
| 7 | `date_issued` | `DATE` | 4 bytes | NN | D= `CURRENT_DATE` | Calendar date on which the penalty was formally assessed and recorded. |
| 8 | `date_resolved` | `DATE` | 4 bytes | Nullable, CK | `NULL` | Calendar date on which the penalty was settled (paid or waived). `NULL` while settlement_status = `UNPAID`. **CHECK:** `date_resolved >= date_issued` (when not `NULL`). |
| 9 | `created_at` | `TIMESTAMPTZ` | — | NN | D= `NOW()` | Timestamp of penalty record creation. |
| 10 | `updated_at` | `TIMESTAMPTZ` | — | NN | D= `NOW()` | Timestamp of the most recent modification. |

---

### 3.8 Table: `visit_log`

**Description:** Records every physical library visit (foot traffic) for both enrolled UMak patrons and external guests. This table supports attendance analytics, host-unit-level traffic reporting, and institutional audit requirements. The polymorphic visitor reference is resolved through dual nullable foreign keys with an exclusive-arc constraint.

**Business Owner:** Visit Log & Attendance Module
**Record Volume Estimate:** ~10,000–30,000 visit entries per semester

| # | Column Name | Data Type | Length / Precision | Constraints | Default | Description |
|---|---|---|---|---|---|---|
| 1 | `visit_id` | `SERIAL` | 4 bytes | PK, AI, NN | Auto | Auto-generated surrogate primary key uniquely identifying each visit entry. |
| 2 | `patron_id` | `INTEGER` | 4 bytes | FK → `patron.patron_id`, Nullable | `NULL` | Foreign key referencing the enrolled patron (if the visitor is a Student, Faculty, or NTP). **Mutually exclusive with `guest_id`** — exactly one must be non-NULL. |
| 3 | `guest_id` | `INTEGER` | 4 bytes | FK → `guest.guest_id`, Nullable | `NULL` | Foreign key referencing the external guest (if the visitor is a Guest). **Mutually exclusive with `patron_id`** — exactly one must be non-NULL. |
| 4 | `visitor_type` | `VARCHAR` | 10 | NN, CK | — | Denormalized classification of the visitor. **CHECK:** `IN ('STUDENT', 'FACULTY', 'NTP', 'GUEST')`. Enables direct reporting filters without requiring JOINs to the patron/guest tables. |
| 5 | `host_unit_college` | `VARCHAR` | 100 | Nullable | `NULL` | The library section, satellite library, or college unit the visitor accessed (e.g., `Main Library`, `School of Law Library`, `CCIS Reading Room`). |
| 6 | `visit_purpose` | `VARCHAR` | 200 | Nullable | `NULL` | Brief description of the visit purpose (e.g., `Study`, `Research`, `Book Return`, `Thesis Consultation`). |
| 7 | `check_in_timestamp` | `TIMESTAMPTZ` | — | NN | D= `NOW()` | Exact timestamp of the visitor's check-in, recorded when the barcode is scanned at the entrance. |
| 8 | `checked_in_by_staff_id` | `INTEGER` | 4 bytes | FK → `staff.staff_id`, NN | — | Foreign key referencing the staff member who scanned and logged this visitor's entry. |

**Table-Level Constraint:**
```sql
CONSTRAINT chk_visitor_exclusivity CHECK (
    (patron_id IS NOT NULL AND guest_id IS NULL) OR
    (patron_id IS NULL AND guest_id IS NOT NULL)
)
```

---

### 3.9 Table: `reference_inquiry`

**Description:** Logs scholarly reference requests, research consultation tickets, and "Ask-a-Librarian" service submissions received via email, chat, Facebook, or the LLC Service Form. This table provides an auditable record of all virtual inquiries for service quality tracking and librarian workload distribution.

**Business Owner:** Virtual Inquiry / Ask-a-Librarian Module
**Record Volume Estimate:** ~200–800 inquiries per semester

| # | Column Name | Data Type | Length / Precision | Constraints | Default | Description |
|---|---|---|---|---|---|---|
| 1 | `inquiry_id` | `SERIAL` | 4 bytes | PK, AI, NN | Auto | Auto-generated surrogate primary key uniquely identifying each reference inquiry. |
| 2 | `inquirer_name` | `VARCHAR` | 150 | NN | — | Full name of the person submitting the inquiry. Stored as free text (not a FK) because inquirers may be anonymous visitors, external researchers, or unregistered guests. |
| 3 | `inquirer_email` | `VARCHAR` | 100 | NN | — | Contact email address for follow-up correspondence on the inquiry. |
| 4 | `subject_topic` | `VARCHAR` | 300 | NN | — | The research subject, reference topic, or description of the scholarly question (e.g., `Philippine labor law case studies post-2020`, `Available theses on machine learning in agriculture`). |
| 5 | `date_submitted` | `TIMESTAMPTZ` | — | NN | D= `NOW()` | Timestamp of when the inquiry was received/submitted. |
| 6 | `assigned_librarian_id` | `INTEGER` | 4 bytes | FK → `staff.staff_id`, Nullable | `NULL` | Foreign key referencing the librarian assigned to handle this inquiry. `NULL` indicates the inquiry has not yet been assigned (still in queue). |
| 7 | `inquiry_status` | `VARCHAR` | 15 | NN, CK | D= `'OPEN'` | Current resolution status of the inquiry. **CHECK:** `IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')`. |
| 8 | `created_at` | `TIMESTAMPTZ` | — | NN | D= `NOW()` | Timestamp of inquiry record creation. |
| 9 | `updated_at` | `TIMESTAMPTZ` | — | NN | D= `NOW()` | Timestamp of the most recent modification. |

---

## 4. Foreign Key Reference Summary

This cross-reference table consolidates all foreign key relationships in the schema for quick navigation.

| # | Child Table | FK Column | References (Parent Table.Column) | On Delete | On Update | Nullable |
|---|---|---|---|---|---|---|
| FK-01 | `book_author` | `accession_number` | `book.accession_number` | CASCADE | CASCADE | No |
| FK-02 | `borrowing_transaction` | `patron_id` | `patron.patron_id` | RESTRICT | CASCADE | No |
| FK-03 | `borrowing_transaction` | `accession_number` | `book.accession_number` | RESTRICT | CASCADE | No |
| FK-04 | `borrowing_transaction` | `staff_id` | `staff.staff_id` | RESTRICT | CASCADE | No |
| FK-05 | `penalty` | `patron_id` | `patron.patron_id` | RESTRICT | CASCADE | No |
| FK-06 | `penalty` | `transaction_id` | `borrowing_transaction.transaction_id` | RESTRICT | CASCADE | No |
| FK-07 | `visit_log` | `patron_id` | `patron.patron_id` | SET NULL | CASCADE | Yes |
| FK-08 | `visit_log` | `guest_id` | `guest.guest_id` | SET NULL | CASCADE | Yes |
| FK-09 | `visit_log` | `checked_in_by_staff_id` | `staff.staff_id` | RESTRICT | CASCADE | No |
| FK-10 | `reference_inquiry` | `assigned_librarian_id` | `staff.staff_id` | SET NULL | CASCADE | Yes |

---

## 5. Enumerated Domain Values Reference

This section consolidates all `CHECK`-constrained domain values used across the schema for quick cross-table reference.

### 5.1 Patron Domains

| Column | Valid Values | Description |
|---|---|---|
| `patron.patron_type` | `STUDENT`, `FACULTY`, `NTP` | Internal patron classification |
| `patron.academic_status` | `ACTIVE`, `FLAGGED` | Enrollment/employment standing |
| `patron.clearance_status` | `CLEAR`, `ON_HOLD` | Graduation clearance flag |

### 5.2 Staff Domains

| Column | Valid Values | Description |
|---|---|---|
| `staff.role` | `OIC_DIRECTOR`, `REFERENCE_LIBRARIAN`, `CATALOGING_LIBRARIAN`, `STUDENT_ASSISTANT` | RBAC role assignment |

### 5.3 Book Domains

| Column | Valid Values | Description |
|---|---|---|
| `book.physical_condition` | `GOOD`, `FAIR`, `POOR`, `DAMAGED` | Physical state assessment |
| `book.availability_status` | `AVAILABLE`, `BORROWED`, `RETURNED`, `OVERDUE`, `LOST`, `DAMAGED` | Circulation availability state |

### 5.4 Transaction & Penalty Domains

| Column | Valid Values | Description |
|---|---|---|
| `borrowing_transaction.transaction_status` | `ACTIVE`, `RETURNED`, `OVERDUE`, `LOST_DAMAGED` | Transaction lifecycle state |
| `penalty.penalty_type` | `OVERDUE_FINE`, `LOST_ITEM`, `DAMAGED_ITEM`, `DISCIPLINARY` | Penalty classification |
| `penalty.settlement_status` | `UNPAID`, `PAID`, `WAIVED` | Payment resolution state |

### 5.5 Visit & Inquiry Domains

| Column | Valid Values | Description |
|---|---|---|
| `visit_log.visitor_type` | `STUDENT`, `FACULTY`, `NTP`, `GUEST` | Visitor classification |
| `reference_inquiry.inquiry_status` | `OPEN`, `IN_PROGRESS`, `RESOLVED` | Inquiry resolution state |

---

## 6. Schema Statistics Summary

| Metric | Count |
|---|---|
| Total Tables | 9 |
| Total Columns | 91 |
| Primary Keys | 9 |
| Foreign Keys | 10 |
| Unique Constraints | 7 |
| CHECK Constraints | 17 |
| NOT NULL Columns | 74 |
| Nullable Columns | 17 |
| Auto-Increment Columns | 8 |

---

## 7. Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | September 11, 2026 | LIBRAS Development Team | Initial data dictionary — 9 tables, 91 columns, full constraint documentation |

---

*End of Data Dictionary Document*
