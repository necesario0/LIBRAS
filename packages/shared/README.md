# @libras/shared

TypeScript shared by the API, the mobile app and the Librarian pages: API types, validation schemas and (once promoted from `benchmarks/`) the search module.

There is no build step. The package exports its TypeScript source (`src/index.ts`), so:

- relative imports use the `.ts` extension and type imports use `import type`;
- only syntax that can be erased is allowed (no enums, namespaces or parameter properties);
- code here must run in Node, React Native and the browser, so it must not import Node built-ins.

Pure-function tests go in `test/*.test.ts` and use Node's built-in test runner, like `benchmarks/test` (`npm test -w @libras/shared`).

- `barcode/code128.ts`: `encodeCode128C(digits)`, the bar and space widths of a Code 128 subset C barcode (the app draws them). Tested against bwip-js output.
- `digital-id.ts`: Digital ID constants, types and wording, `formatDigitalId`, `msUntilRefresh`.
- `scanner.ts`: the phone scanner's shared pieces: the pairing code schema, request bodies, the desk stream's event types and `SCANNER_MESSAGES`. `event-stream.ts`: `readEventStream`, a server-sent event reader for a `fetch` body (browsers' `EventSource` cannot send the Authorization header).
- `scan.ts`: `readScan(raw)`, the whitelist and classification every desk scan goes through: a Digital ID (12 digits), or a Copy (its barcode or accession number).
- `loans.ts`: Loan and return types and wording (`LOAN_MESSAGES`, `RETURN_MESSAGES`), the desk session token schema and request bodies (`confirmLoanRequestSchema` `{ deskSession, copy }`, `endDeskSessionRequestSchema`; the `DeskSession` type and `DESK_SESSION_MINUTES` are in `digital-id.ts`, ADR 0008), `loanDueAt` (the end of the library day, UTC+8), `isLoanOverdue`, `formatLibraryDate`, `formatLibraryDay`, `libraryDaysBetween`.
