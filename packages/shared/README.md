# @libras/shared

TypeScript shared by the API, the mobile app and the Librarian pages: API types, validation schemas and (once promoted from `benchmarks/`) the search module.

There is no build step. The package exports its TypeScript source (`src/index.ts`), so:

- relative imports use the `.ts` extension and type imports use `import type`;
- only syntax that can be erased is allowed (no enums, namespaces or parameter properties);
- code here must run in Node, React Native and the browser, so it must not import Node built-ins.

Pure-function tests go in `test/*.test.ts` and use Node's built-in test runner, like `benchmarks/test` (`npm test -w @libras/shared`).

- `barcode/code128.ts`: `encodeCode128C(digits)`, the bar and space widths of a Code 128 subset C barcode (the app draws them). Tested against bwip-js output.
- `digital-id.ts`: Digital ID constants, types and wording, `formatDigitalId`, `msUntilRefresh`.
- `scan.ts`: `readScan(raw)`, the whitelist and classification every desk scan goes through: a Digital ID (12 digits), or a Copy (its barcode or accession number).
- `loans.ts`: Loan types and wording, `loanDueAt` (the end of the library day, UTC+8), `isLoanOverdue`, `formatLibraryDate`, `formatLibraryDay`, `libraryDaysBetween`.
