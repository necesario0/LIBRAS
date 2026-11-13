## Task 5: Agile Implementation Backlog & Empirical Validation Plan

### 5.1 Agile User Stories

Directly translating the user requirement specifications from our Requirements Engineering (SRS v2) and User Story matrix into formal Agile engineering user stories:

**User Story US-ALGO-01: Bounded Typo-Tolerant OPAC Catalog Discovery**

- **User Story Statement:** 'As a UMAK Student or Faculty Member, I want the OPAC catalog search engine to tolerate typographic spelling errors of up to 2 edits per word within 35 milliseconds, so that I can immediately discover relevant academic textbooks without query failure or empty search screens.'
- **Traceability Link:** Component B-02 (Students Catalog Search) & Component C-02 (Faculty Catalog Search); Story U-001/U-002.
- **Acceptance Criteria:**
  1. Given a misspelled query (e.g., 'Artifitial Inteligence'), when the Member executes a search, then the system returns the Books whose words are within the edit bound of every query word (e.g., 'Artificial Intelligence'), ordered by total edit distance, in < 35 ms.
  2. Given a query that matches a Book exactly, that Book is returned first with distance = 0, in < 5 ms.
  3. Given an ISBN, an accession number or an LC call number, the system returns the exact match and no fuzzy matches.
  4. Given an empty query or one longer than 100 characters, the API returns 400 Bad Request with a safe message; script injection text is treated as plain words and never executed or interpolated into SQL.
  5. Each result shows how many Copies are available now, and an empty result is shown as 'no results', distinct from an error.
  6. Search latency under 50 concurrent simulated users must not exceed 1.0 second (Non-Functional Requirement 5).

**User Story US-ALGO-02: Race-Free Hold Dispatch on Return**

- **User Story Statement:** 'As a Circulation Desk Librarian, I want the system to deterministically resolve the highest-priority waiting Member in under 10 milliseconds upon scanning a returned Copy's barcode, so that high-demand course textbooks are set aside for the rightful Member without manual queue sorting, race conditions, or counter delays.'
- **Traceability Link:** Component A-04 (Librarian Borrowing/Returns) & Component B-03 (Student Borrowing Services and Holds); Story L-001.
- **Acceptance Criteria:**
  1. Given a returned Copy whose Book has K waiting Holds, when the Librarian scans the barcode, the system performs an O(log K) priority lookup, marks the chosen Hold ready, sets the Copy aside and tells the Librarian which Member it is for, in < 10 ms for the dispatch itself.
  2. Given contending Holds from a Faculty Member (arrival t) and a UMAK Student (arrival t - 12 hours), the system chooses the Faculty Member based on the 24-hour virtual priority advance (PriorityScore = t - 86,400,000 < (t - 43,200,000) - 0).
  3. Given 10 concurrent desk return events for Copies of the same Book, zero deadlocks or duplicate allocations occur.
  4. Given a Member whose Hold is ready, the set-aside Copy can be lent only to that Member during the Pickup Window, and the Member is told by email and in the app when the window ends.
  5. Given a Pickup Window that passes unused, the Hold expires and the next waiting Hold is chosen for the same Copy without anyone opening the app or the desk page.
  6. Given a Visitor or Alumni Member, placing a Hold is refused with a clear reason, because these Account Types cannot borrow.
  7. Overall return transaction SLA of < 15 seconds must be preserved (Non-Functional Requirement 6).
