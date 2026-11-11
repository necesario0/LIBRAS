# @libras/shared

TypeScript shared by the API, the mobile app and the Librarian pages: API types, validation schemas and (once promoted from `benchmarks/`) the search module.

There is no build step. The package exports its TypeScript source (`src/index.ts`), so:

- relative imports use the `.ts` extension and type imports use `import type`;
- only syntax that can be erased is allowed (no enums, namespaces or parameter properties);
- code here must run in Node, React Native and the browser, so it must not import Node built-ins.

Pure-function tests go in `test/*.test.ts` and use Node's built-in test runner, like `benchmarks/test`. Add a `test` script (`node --test "test/**/*.test.ts"`) with the first test.
