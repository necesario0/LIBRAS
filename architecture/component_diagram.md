# Project LIBRAS: Decoupled System Component Architecture
## Clean Microservice Isolation for Algorithmic & Circulation Processing
**Course:** Algorithms and Complexity (ALGOCOM) × Software Engineering (SOFTENG)  
**Section & Term:** III-BCSAD • Academic Year 2026–2027 • Group 1  
**Target Unit:** University of Makati Library Learning Commons (UMak LLC Main & SOL Library)

---

## 1. Architectural Philosophy & Failure Domain Isolation

In enterprise academic systems, a frequent engineering flaw is coupling heavy computation routines directly to database Object-Relational Mapping (ORM) models and web presentation controllers. In Project LIBRAS:

1. **Event-Loop Non-Blocking Guarantee:** Node.js executes on a single-threaded asynchronous event loop. Executing CPU-intensive string alignment matrices (Levenshtein distance) within Express route handlers blocks the main thread, causing server-wide socket stall. The algorithmic core is strictly isolated into an independent worker service.
2. **Garbage Collection (GC) Isolation:** Database ORMs instantiate heavy Active Record object graphs. Isolating the algorithmic core allows the Bounded Trie and Min-Heap to operate on contiguous, primitive C-level memory structures without triggering high-latency GC pauses.
3. **Database Connection Pool Protection:** Complex queue sorting and fuzzy queries do not hold active SQL connection pool locks, preventing connection exhaustion and HTTP 504 Gateway Timeouts.

---

## 2. Four-Tier Decoupled Architecture Diagram

```mermaid
flowchart TD
    subgraph Presentation_Tier ["1. Client Presentation Tier"]
        FlutterApp["Flutter Mobile App (Android/iOS)\n- OPAC Typo-Tolerant Catalog Search\n- Rolling Digital Barcode ID (TOTP RFC 6238)\n- Active Holds & Reading History"]
        ReactDashboard["React Web Librarian Dashboard\n- High-Speed Accession Barcode Circulation\n- Desk Return Check-in (< 15s SLA)\n- Student Clearance Processing"]
    end

    subgraph Ingress_Tier ["2. API Gateway & Ingress Tier"]
        TraefikGateway["Traefik Reverse Proxy / Gateway\n- TLS 1.3 Termination (RFC 8446)\n- JWT Role-Based Access Control (RBAC)\n- Ingress Rate Limiting (100 req/min/IP)\n- CORS & Header Sanitization"]
    end

    subgraph Orchestration_Tier ["3. Application Orchestration Tier"]
        NodeCore["Node.js / Express Core Service\n- Patron Authentication & Policy Enforcement\n- Loan Due Date Rules & Notification Dispatch\n- Transaction State Machine"]
    end

    subgraph Persistence_Tier ["4. Data Persistence Tier"]
        PostgresDB[("PostgreSQL 16 Master DB\n- Bibliographic Records (books, book_copies)\n- Patron Tiers (Students, Faculty, NTP, Visitors)\n- Circulation Audit Trail")]
        RedisCache[("Redis 7 Cache & Distributed Mutex\n- Session Cache & Active Hold Locks\n- Queue State Persistence Snapshot")]
    end

    subgraph Algorithmic_Tier ["5. Isolated Algorithmic Core Engine"]
        FastAPIWorker["FastAPI Algorithmic Worker (Port 8001)\n- In-Memory Bounded Trie Prefix Automaton\n- Branch-and-Bound Pruning (k_max <= 2)\n- Array-Backed Complete Binary Min-Heap\n- Role-Weighted Priority Dispatcher"]
    end

    %% Network flows
    FlutterApp -->|HTTPS / TLS 1.3| TraefikGateway
    ReactDashboard -->|HTTPS / TLS 1.3| TraefikGateway
    TraefikGateway -->|Internal Bridge| NodeCore

    NodeCore -->|SQL Queries (Port 5432)| PostgresDB
    NodeCore -->|Distributed Mutex / Lock| RedisCache
    NodeCore -->|REST / gRPC (Port 8001)| FastAPIWorker
    FastAPIWorker -.->|Periodic Lexicon Hydration| PostgresDB
```

---

## 3. Communication Protocols & Boundaries

| Communication Boundary | Protocol & Format | Service Level Agreement (SLA) | Failure Mode & Recovery |
| :--- | :--- | :--- | :--- |
| **Client $\rightarrow$ API Gateway** | HTTPS / TLS 1.3 (JSON) | $< 100\text{ ms}$ Network RTT | Network retry with exponential backoff. |
| **Gateway $\rightarrow$ App Service** | HTTP/2 Cleartext (Internal VPC) | $< 10\text{ ms}$ Routing Latency | Circuit breaker halts traffic on worker saturation. |
| **App Service $\rightarrow$ PostgreSQL** | Binary PostgreSQL Wire Protocol | $< 15\text{ ms}$ Transaction Commit | Connection pooling (PgBouncer) with failover replica. |
| **App Service $\rightarrow$ Algo Core** | gRPC / High-Throughput REST | **$< 35\text{ ms}$ (Search); $< 10\text{ ms}$ (Hold)** | In-memory fallback; return cached top-20 popular titles. |

---

## 4. Operational Data Contracts Directory

All interface data contracts are formalized in `architecture/contracts/` according to **JSON Schema Draft 2020-12** and **OpenAPI 3.1.0**:
* [`fuzzy_search_request_schema.json`](contracts/fuzzy_search_request_schema.json): Payload contract for `/api/v1/algorithm/search/fuzzy`.
* [`fuzzy_search_response_schema.json`](contracts/fuzzy_search_response_schema.json): Certificate contract for OPAC search results.
* [`hold_dispatch_request_schema.json`](contracts/hold_dispatch_request_schema.json): Payload contract for `/api/v1/algorithm/holds/dispatch`.
* [`hold_dispatch_response_schema.json`](contracts/hold_dispatch_response_schema.json): Allocation certificate for desk return check-in.
* [`problem_details_error_schema.json`](contracts/problem_details_error_schema.json): Standard RFC 7807 error certificate.
