## Task 4: Decoupled Software Architecture & Service-Layer Integration

### 4.1 System Component Architecture & Boundary Isolation

A foundational software engineering principle enforced in PBL Milestone 1 is the strict decoupling of heavy algorithmic processing from database Object-Relational Mapping (ORM) models and web presentation controllers. Coupling algorithmic computation directly into web controller threads (e.g., executing Levenshtein matrix loops inside an Express route handler) blocks Node.js event loops, exhausts HTTP connection pools, and risks cascading server timeouts under traffic spikes.

This principle is implemented as module boundaries inside the Node.js API, organized in four layers (Figure 4.1):

1. **Presentation Tier:** A React Native (TypeScript) mobile app for students, faculty and non-teaching personnel to search the catalog, reserve books, display dynamic rolling barcode IDs (TOTP RFC 6238) and view loan records, and a React.js (TypeScript) web portal for librarians (inventory cataloging, desk circulation, clearance processing, dashboard metrics and reports).
2. **Hosting & Ingress Layer:** Render hosts the API and the web portal with HTTPS termination and continuous deployment from GitHub. JWT authentication, CORS and rate limiting (100 req/min/IP) run as Express middleware.
3. **Core Business & Persistence Tier:** A Node.js, Express and TypeScript API handles business logic and circulation transactions. PostgreSQL 16 stores catalog metadata, accession records, borrower accounts, loan history, fines and the hold queue.
4. **Algorithmic Core Modules:** Two TypeScript modules with narrow interfaces and no dependency on controllers or the ORM:
   - `SearchEngine.search(query, k)` returns matches from an in-memory flat trie. The trie is built from a snapshot of the lexicon read from PostgreSQL. When the catalog changes, a new trie is built in the background (about 235 ms at 50,000 tokens) and swapped in atomically, so searches in flight finish on the old trie.
   - `HoldQueue.enqueue`, `dispatch` and `cancel` wrap the SQL statements of Algorithm 2 in one repository module.

A typical search takes under 1 ms in the module at 50,000 tokens, so it can run on the main thread. If profiling shows event-loop delay under load, the module can move to a worker thread without changing its interface. A separate algorithm service (for example Python with FastAPI), a gRPC link, and Redis for locking and queue persistence are unnecessary, because the search index lives in the API process and PostgreSQL row locking provides the mutual exclusion.

![Figure 4.1: System component and decoupled service-layer architecture](assets/architecture.png)

*Figure 4.1: System component and decoupled service-layer architecture.*

### 4.2 Interface Data Contracts (OpenAPI 3.1 & JSON Schemas)

Communication across service boundaries adheres to strict schema definitions formatted according to the JSON Schema Draft 2020-12 and OpenAPI 3.1 specifications. All requests and response certificates are strictly typed and validated at runtime.

**Data Contract 1: Fuzzy Catalog Search API Schema**

```
POST /api/v1/algorithm/search/fuzzy
Content-Type: application/json

// Request Payload Schema
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FuzzyCatalogSearchRequest",
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "minLength": 1,
      "maxLength": 64,
      "description": "User search keyword or Dewey/LC call number string."
    },
    "max_edit_distance": {
      "type": "integer",
      "minimum": 0,
      "maximum": 2,
      "default": 2,
      "description": "Bounded Levenshtein radius."
    },
    "target_fields": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": ["title", "author", "call_number", "isbn"]
      },
      "default": ["title", "author"]
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 50,
      "default": 10
    }
  },
  "required": ["query"]
}
```

```
// Response Certificate Schema (200 OK)
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FuzzyCatalogSearchResponseCertificate",
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": ["SUCCESS", "EMPTY_RESULT", "DEGRADED"]
    },
    "query_executed": { "type": "string" },
    "execution_time_ms": {
      "type": "number",
      "description": "Processing latency in milliseconds."
    },
    "nodes_visited_count": { "type": "integer" },
    "total_matches": { "type": "integer" },
    "matches": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "book_id": { "type": "string", "format": "uuid" },
          "matched_token": { "type": "string" },
          "matched_field": { "type": "string" },
          "edit_distance": { "type": "integer" },
          "similarity_score": { "type": "number" },
          "title": { "type": "string" },
          "author": { "type": "string" },
          "call_number": { "type": "string" },
          "available_copies": { "type": "integer" }
        },
        "required": ["book_id", "matched_token", "edit_distance",
                     "similarity_score", "title"]
      }
    }
  },
  "required": ["status", "query_executed", "execution_time_ms", "matches"]
}
```

**Data Contract 2: Circulation Hold Dispatch Resolution Schema**

```
POST /api/v1/algorithm/holds/dispatch
Content-Type: application/json

// Request Payload Schema
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "HoldDispatchResolutionRequest",
  "type": "object",
  "properties": {
    "accession_number": {
      "type": "string",
      "pattern": "^[0-9]{6,10}$",
      "description": "Scanned physical barcode accession number
                      preserving leading zeros."
    },
    "desk_station_id": { "type": "string", "example": "CIRC-MAIN-DESK-01" },
    "librarian_id": { "type": "string", "format": "uuid" },
    "checkin_timestamp": {
      "type": "integer",
      "description": "Epoch ms of desk scanner scan."
    }
  },
  "required": ["accession_number", "desk_station_id",
               "librarian_id", "checkin_timestamp"]
}
```

```
// Response Certificate Schema (200 OK)
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "HoldDispatchAllocationCertificate",
  "type": "object",
  "properties": {
    "certificate_id": { "type": "string", "format": "uuid" },
    "allocation_status": {
      "type": "string",
      "enum": ["ALLOCATED_TO_HOLD", "NO_ACTIVE_HOLDS_AVAILABLE"]
    },
    "accession_number": { "type": "string" },
    "allocated_patron": {
      "type": ["object", "null"],
      "properties": {
        "patron_id": { "type": "string" },
        "full_name": { "type": "string" },
        "role": { "type": "string" },
        "email": { "type": "string", "format": "email" },
        "priority_score": { "type": "integer" },
        "claim_deadline_timestamp": { "type": "integer" }
      },
      "required": ["patron_id", "role", "email", "claim_deadline_timestamp"]
    },
    "queue_remaining_count": { "type": "integer" },
    "resolution_latency_ms": { "type": "number" },
    "cryptographic_verification_token": { "type": "string" }
  },
  "required": ["certificate_id", "allocation_status",
               "accession_number", "resolution_latency_ms"]
}
```
