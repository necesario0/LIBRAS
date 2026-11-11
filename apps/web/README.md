# @libras/web

The Librarian web pages: the desk page (desktop) now, and the phone scanner page in a later ticket. Vite, React and TypeScript. The pages talk only to the API, through `src/api.ts`, and take shared types from `@libras/shared`.

## Run

```bash
npm run dev            # from the repo root: starts the database and the API
npm run dev -w @libras/web   # the web pages on http://127.0.0.1:5173
npm run seed           # creates the demo Librarian (see below)
```

Vite forwards `/api/*` to the API (`LIBRAS_API_URL`, default `http://127.0.0.1:3000`), so the browser sees one origin.

Demo Librarian after `npm run seed` (local only): `librarian@libras.test` / `librarian-demo-2026`.

## Browser end-to-end test

```bash
npm run db:start
npm run test:e2e       # from the repo root
```

Playwright starts the real API and Vite on ports 3101 and 5174, seeds a Librarian with the seed script's own code, and drives the machine's installed Chrome at a desktop size. It needs Chrome (GitHub's `ubuntu-latest` has it).

## Layout

- `src/styles/tokens.css`: colors, radii, spacing and type sizes from the mobile Figma designs. Use these, never raw values.
- `src/styles/app.css`: shared styles (brand, buttons, fields) and the page styles.
- `src/api.ts`, `src/session.ts`: API calls, the stored session and its renewal.
- `src/pages/`, `src/components/`: pages and shared pieces.
