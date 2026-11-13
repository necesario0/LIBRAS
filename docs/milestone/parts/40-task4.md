## Task 4: Decoupled Software Architecture & Service-Layer Integration

### 4.1 System Component Architecture & Boundary Isolation

A foundational software engineering principle enforced in PBL Milestone 1 is the strict decoupling of heavy algorithmic processing from database access code and web presentation controllers. Coupling algorithmic computation directly into web controller threads (e.g., executing Levenshtein matrix loops across database rows inside an Express route handler) blocks Node.js event loops, exhausts HTTP connection pools, and risks cascading server timeouts under traffic spikes.

This principle is implemented as module boundaries inside one repository with four packages (the mobile app, the API, the Librarian web pages and a shared TypeScript package), organized in four layers (Figure 4.1):

1. **Presentation Tier:** A React Native (TypeScript, Expo) Android app for Members to search the catalog, open a Book, place and cancel Holds, view their Loans and show their Digital ID, a 1D barcode that changes every 60 seconds (TOTP, RFC 6238). A React (TypeScript, Vite) web desk page for Librarians to confirm a Loan and record a return by scanning, with a phone scanner page that pairs with the desk page. Both clients talk only to the API, never directly to the database.
2. **Hosting & Ingress Layer:** Render hosts the API with HTTPS termination and continuous deployment from GitHub. Every protected route sits behind guard middleware that checks the bearer access token issued by Supabase Auth and loads the Member or Librarian it belongs to. A CORS allowlist of exact origins and rate limiting of failed sign-ins (5 failures per 15 minutes per client address) run as Express middleware.
3. **Core Business & Persistence Tier:** A Node.js, Express and TypeScript API handles business logic and circulation transactions. Supabase provides PostgreSQL 17 and authentication. PostgreSQL stores Members, Books, Copies, Loans, the Loan Policy, the Hold queue and the audit log. The API uses parameterized SQL directly, with no object-relational mapper, and passes the signed-in person's identity to PostgreSQL so that row-level security applies as a second layer behind the API's own checks.
4. **Algorithmic Core Modules:** Two TypeScript modules with narrow interfaces and no dependency on controllers:
   - **Catalog search.** `searchTrie(trie, word, k)` and `buildCatalogIndex(books)` are pure functions in the shared package (`packages/shared/src/search/`), with no database and no server, so they are tested in isolation. In the API, `CatalogSearch.search(query, limit)` holds one immutable index. The index is built from one consistent snapshot of the catalog read from PostgreSQL. A counter in the database moves on every catalog change; when a search sees that it has moved, a new index is built in the background in short steps and swapped in with a single assignment, so searches in flight finish on the old index and no search waits for a rebuild. Building the trie itself took about 235 ms at 50,000 tokens in the benchmark; a full rebuild, including the database read, takes about one second at that scale.
   - **Hold queue.** The module `apps/api/src/holds/` computes the score, places and cancels Holds, and holds the dispatch statement of Algorithm 2. Dispatch is not called by a client: it runs inside the transaction that records a return, and again when a Pickup Window passes.

A typical word search takes under 1 ms in the module at 50,000 tokens, so it can run on the main thread. If profiling shows event-loop delay under load, the module can move to a worker thread without changing its interface. A separate algorithm service (for example Python with FastAPI), a gRPC link, and Redis for locking and queue persistence are unnecessary, because the search index lives in the API process and PostgreSQL row locking provides the mutual exclusion.

![Figure 4.1: System component and decoupled service-layer architecture](assets/architecture.png)

*Figure 4.1: System component and decoupled service-layer architecture.*

### 4.2 Interface Data Contracts (OpenAPI 3.1 & JSON Schemas)

The contracts below are written as JSON Schema (Draft 2020-12), in the form used by an OpenAPI 3.1 description. In the code each contract is defined once, as a TypeScript type and a Zod validation schema in the shared package, which the API checks at runtime and both clients import, so a client and the API cannot disagree about a field. Every request carries `Authorization: Bearer <access token>`. Every failure has the same body, a code for the client and a safe message for the person, and never a stack trace:

```
{ "error": { "code": "invalid_request",
             "message": "Check what you typed and try again." } }
```

**Data Contract 1: Catalog Search (signed-in Members)**

```
GET /catalog/search?q=<query>&limit=<n>

// Query Parameter Schema
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CatalogSearchQuery",
  "type": "object",
  "properties": {
    "q": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100,
      "description": "A title, an author, an ISBN, an accession number
                      or an LC call number. Trimmed before it is checked."
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 50,
      "default": 20
    }
  },
  "required": ["q"]
}
```

```
// Response Schema (200 OK)
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CatalogSearchResponse",
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "The query as the API understood it (trimmed)."
    },
    "total": {
      "type": "integer",
      "description": "How many Books matched, before the limit."
    },
    "results": {
      "type": "array",
      "description": "Best match first. Empty when nothing matched:
                      no match is a normal answer, not an error.",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "format": "uuid" },
          "title": { "type": "string" },
          "authors": { "type": "array", "items": { "type": "string" } },
          "edition": { "type": ["string", "null"] },
          "publicationYear": { "type": ["integer", "null"] },
          "isbn": { "type": ["string", "null"] },
          "lcCallNumber": { "type": ["string", "null"] },
          "availableCopies": { "type": "integer" },
          "totalCopies": { "type": "integer" }
        },
        "required": ["id", "title", "authors",
                     "availableCopies", "totalCopies"]
      }
    }
  },
  "required": ["query", "total", "results"]
}
```

The edit radius is not a request parameter: the API derives it from the length of each query word (Algorithm 1b), so a client cannot ask for a wider and more expensive search. A missing, empty or over-long `q`, or a `limit` outside its range, returns 400 `invalid_request`.

**Data Contract 2: Place a Hold (signed-in Members)**

```
POST /holds
Content-Type: application/json

// Request Body Schema
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PlaceHoldRequest",
  "type": "object",
  "properties": {
    "bookId": { "type": "string", "format": "uuid" }
  },
  "required": ["bookId"],
  "additionalProperties": false
}
```

```
// Response Schema (201 Created)
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PlaceHoldResponse",
  "type": "object",
  "properties": {
    "hold": {
      "type": "object",
      "properties": {
        "id": { "type": "string", "format": "uuid" },
        "bookId": { "type": "string", "format": "uuid" },
        "bookTitle": { "type": "string" },
        "bookAuthors": { "type": "array", "items": { "type": "string" } },
        "status": {
          "type": "string",
          "enum": ["waiting", "ready", "fulfilled", "expired", "cancelled"]
        },
        "placedAt": { "type": "string", "format": "date-time" },
        "pickupEndsAt": {
          "type": ["string", "null"],
          "format": "date-time",
          "description": "End of the Pickup Window. Null while waiting."
        }
      },
      "required": ["id", "bookId", "bookTitle", "status", "placedAt"]
    }
  },
  "required": ["hold"]
}
```

The request names only the Book. The Member comes from the access token, and the arrival time, the weight and the score are set by the API, so a client cannot choose its own priority. Refusals: 403 `cannot_borrow` (Visitor or Alumni), 404 `book_not_found`, 409 `copy_available` (a Copy can be borrowed now) and 409 `hold_exists` (the Member already has an active Hold on the Book). `POST /holds/{id}/cancel` and `GET /members/me/holds` return the same Hold object.

**Data Contract 3: Record a Return, which Dispatches the Next Hold (signed-in Librarians)**

```
POST /desk/returns
Content-Type: application/json

// Request Body Schema
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "RecordReturnRequest",
  "type": "object",
  "properties": {
    "copy": {
      "type": "string",
      "pattern": "^[0-9A-Za-z -]{1,64}$",
      "description": "The Copy's barcode as scanned, or its accession
                      number as typed. Leading zeros are preserved."
    }
  },
  "required": ["copy"],
  "additionalProperties": false
}
```

```
// Response Schema (200 OK)
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "RecordReturnResponse",
  "type": "object",
  "properties": {
    "loan": {
      "type": "object",
      "properties": {
        "id": { "type": "string", "format": "uuid" },
        "bookTitle": { "type": "string" },
        "accessionNumber": { "type": "string" },
        "memberName": { "type": "string" },
        "checkedOutAt": { "type": "string", "format": "date-time" },
        "dueAt": { "type": "string", "format": "date-time" },
        "returnedAt": { "type": "string", "format": "date-time" },
        "late": { "type": "boolean" },
        "heldFor": {
          "type": ["object", "null"],
          "description": "The Member whose Hold was chosen for this Copy.
                          Null when no Hold was waiting.",
          "properties": {
            "memberName": { "type": "string" },
            "pickupEndsAt": { "type": "string", "format": "date-time" }
          },
          "required": ["memberName", "pickupEndsAt"]
        }
      },
      "required": ["id", "bookTitle", "accessionNumber", "memberName",
                   "returnedAt", "late"]
    }
  },
  "required": ["loan"]
}
```

There is no separate dispatch endpoint. Closing the Loan, choosing the next Hold (Algorithm 2), setting the Copy aside and writing the audit log entries are one transaction, so a return can never be recorded without its dispatch or the reverse. `heldFor` tells the Librarian to put the Copy on the hold shelf and not back on the stacks. Refusals: 404 `copy_not_found` and 409 `copy_not_on_loan`.
