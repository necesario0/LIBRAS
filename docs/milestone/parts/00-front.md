# PBL Milestone 1: Algorithm Architecture Specification & Software Engineering Proposal

Project LIBRAS: Library Borrowing and Records Administration System

Dual-Core Algorithmic Optimization & Decoupled Service-Layer Architecture

Academic Course: Algorithms and Complexity (ALGOCOM) × Software Engineering (SOFTENG)

University of Makati • College of Computer Science (CCIS) • Academic Year 2026–2027

> **[EXECUTIVE ARCHITECTURE SPECIFICATION]** This technical proposal specification establishes the theoretical formulation, asymptotic complexity proofs, decoupled service-layer architecture, empirical algorithm selection, and agile validation plan for Project LIBRAS. It directly satisfies all curriculum benchmarks for PBL Milestone 1 across ALGOCOM and SOFTENG under the supervision of Prof. Nomar Maestro and Prof. Era Marie Gannaban. All algorithmic logic strictly conforms to course constraints against elementary algorithms.

| Metadata Field | Project Team Specification |
| --- | --- |
| **Project Title** | **Project LIBRAS: Library Borrowing and Records Administration System (UMak LLC Main & SOL Library)** |
| **Team Name** | Group 1 (Synto Singko - LIBRAS) |
| **Section & Year** | III-BCSAD • Academic Year 2026–2027 |
| **Team Members & Engineering Roles** | Lead Algorithm Architect: Edrian C. Necesario (k12255958)<br>Backend / Systems Engineer: Cobby N. Baldonado (k12256165)<br>Data / QA Engineer: Buzz Aldrizh G. Saavedra (k12257228)<br>Systems Analyst / Technical Lead: Adrianne Quinn Emmanuel C. Rosalan (k12255842)<br>Security & Algorithmic QA Engineer: Mhel Klarenz B. Urdaneta (k12256252) |
| **Repository URL & Target Date** | Repository: https://github.com/necesario0/LIBRAS (prototype benchmark code in `benchmarks/`)<br>Latest Benchmarking Analysis (Google Colab notebook, all cells run): https://colab.research.google.com/drive/1965faZS39a0CVVeCuKtmYCTv-lj2WNKI?usp=sharing<br>Submission Milestone: November 2026 (PBL Milestone 1) |
| **[AI POLICY TRANSPARENCY: YELLOW ZONE CONFORMANCE]** | AI Assistance: We used generative assistance to verify the algebraic summations for the trie branching analysis, validate the OpenAPI 3.1 JSON schema draft specifications, and cross-check the formal IEEE citations. All computational formulations, recurrence invariants, pseudocode logic, and software engineering data contracts have been critically reviewed, validated against operational requirements, and mathematically proven by Group 1.<br>Generative assistance (Claude, Anthropic) was also used to write and run the prototype benchmark code, to analyze its results, and to draft parts of the algorithm analysis. Group 1 reviewed the derivations and results and remains responsible for their accuracy. |

## Algorithms at a Glance

Project LIBRAS uses two algorithms, selected by comparing them against alternatives on the same data, queries and machine (Section 3.5).

| Role | Algorithm | Technique |
| --- | --- | --- |
| Catalog search | **Bounded Levenshtein Trie Search** | Dynamic programming over a trie with branch-and-bound pruning, stored as flat arrays |
| Hold dispatch | **Role-Weighted Priority Queue Dispatcher** | Greedy minimum-score selection from an ordered index in PostgreSQL |
