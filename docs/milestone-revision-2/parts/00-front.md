# PBL Milestone 1: Algorithm Architecture Specification & Software Engineering Proposal

**Revision 2**

Project LIBRAS: Library Borrowing and Records Administration System

Dual-Core Algorithmic Optimization & Decoupled Service-Layer Architecture

Academic Course: Algorithms and Complexity (ALGOCOM) × Software Engineering (SOFTENG)

University of Makati • College of Computer Science (CCIS) • Academic Year 2026–2027

> **[EXECUTIVE ARCHITECTURE SPECIFICATION]** This technical proposal specification establishes the theoretical formulation, asymptotic complexity proofs, decoupled service-layer architecture, empirical algorithm selection, and agile validation plan for Project LIBRAS. It directly satisfies all curriculum benchmarks for PBL Milestone 1 across ALGOCOM and SOFTENG under the supervision of Prof. Nomar Maestro and Prof. Era Marie Gannaban. All algorithmic logic strictly conforms to course constraints against elementary algorithms.

| Metadata Field | Project Team Specification |
| --- | --- |
| **Project Title** | **Project LIBRAS: Library Borrowing and Records Administration System (UMak LLC Main & SOL Library)** |
| **Team Name** | Group 1 (Sinto Syngko - LIBRAS) |
| **Section & Year** | III-BCSAD • Academic Year 2026–2027 |
| **Team Members & Engineering Roles** | Lead Algorithm Architect: Edrian C. Necesario (k12255958)<br>Backend / Systems Engineer: Cobby N. Baldonado (k12256165)<br>Data / QA Engineer: Buzz Aldrizh G. Saavedra (k12257228)<br>Systems Analyst / Technical Lead: Adrianne Quinn Emmanuel C. Rosalan (k12255842)<br>Security & Algorithmic QA Engineer: Mhel Klarenz B. Urdaneta (k12256252) |
| **Repository URL & Target Date** | Repository: https://github.com/necesario0/LIBRAS (prototype benchmark code in `benchmarks/`)<br>Submission Milestone: November 2026 (PBL Milestone 1) |
| **Document Revision** | Revision 2, November 2026. The algorithms were revised after an empirical comparison against alternatives (Section 3.5). |
| **[AI POLICY TRANSPARENCY: YELLOW ZONE CONFORMANCE]** | AI Assistance: We used generative assistance to verify the algebraic summations for the trie branching analysis, validate the OpenAPI 3.1 JSON schema draft specifications, and cross-check the formal IEEE citations. All computational formulations, recurrence invariants, pseudocode logic, and software engineering data contracts have been critically reviewed, validated against operational requirements, and mathematically proven by Group 1.<br>Revision 2: generative assistance (Claude, Anthropic) was also used to write and run the prototype benchmark code, to analyze its results, and to draft the revised sections. Group 1 reviewed the derivations and results and remains responsible for their accuracy. |

## Revision 2 Summary

The first submission specified two algorithms. Revision 2 replaces them with the algorithms that performed best when compared against alternatives on the same data, queries and machine (Section 3.5), and corrects statements in the first submission that the measurements did not support.

| Role | Name in Revision 2 | Name in the first submission |
| --- | --- | --- |
| Catalog search | **Bounded Levenshtein Trie Search** | Bounded Levenshtein Trie Automaton Search |
| Hold dispatch | **Role-Weighted Priority Queue Dispatcher** | Role-Weighted Composite Min-Heap Hold Dispatcher |

| Section | Change |
| --- | --- |
| 1.1, 1.2.2 | Baseline statement corrected; wording aligned with the new dispatcher |
| 2.1 to 2.3 | New strategy schema, proofs of the pruning lemma and queue-order invariant, flat-array trie and indexed priority query pseudocode |
| 3.1 to 3.4 | Corrected worst-case bound (one factor of m was missing), measured average cases, new space figures |
| 3.5 | New: empirical algorithm selection |
| 4.1 | Search and dispatch run as modules in the Node.js API; no separate Python service or Redis; new diagram |
| 5.1, 5.2 | Acceptance criterion and tickets updated for TypeScript and PostgreSQL |
| 6.1 to 6.4 | Statements that no longer hold are replaced; the exact versus approximate discussion is corrected |
| References | Entry [10] corrected; entries [23] to [28] added |
| Appendix A | Summary slides rebuilt with the revised content |
