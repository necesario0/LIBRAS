import type { Router } from "express";
import type { AppDeps } from "../app.ts";
import type { CatalogSearch } from "../catalog/catalog-search.ts";

interface BookFixture {
  title: string;
  authors: string[];
  availableCopies: number;
  onLoanCopies: number;
}

function isBookFixture(value: unknown): value is BookFixture {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.title === "string" &&
    Array.isArray(body.authors) &&
    body.authors.every((author) => typeof author === "string") &&
    Number.isInteger(body.availableCopies) &&
    Number.isInteger(body.onLoanCopies)
  );
}

/**
 * A route that lets an end-to-end test on another process add a Book to the
 * catalog, since the product has no way to do it yet. It exists only on the
 * end-to-end server (`e2e-server.ts`): the real server never imports this module.
 *
 *   POST /e2e/books { title, authors, availableCopies, onLoanCopies } -> 201 { id }
 *   (answers once search can find the Book)
 */
export function catalogFixtureRoutes(router: Router, deps: AppDeps, catalog: CatalogSearch): void {
  router.post("/e2e/books", async (req, res) => {
    if (!isBookFixture(req.body)) {
      res.status(400).json({ error: { code: "invalid_request", message: "Not a Book fixture." } });
      return;
    }
    const { title, authors, availableCopies, onLoanCopies } = req.body;
    const { rows } = await deps.db.query<{ id: string }>("insert into public.books (title, authors) values ($1, $2) returning id", [title, authors]);
    const id = rows[0]?.id;
    const statuses = [...Array<string>(availableCopies).fill("available"), ...Array<string>(onLoanCopies).fill("on_loan")];
    for (const [i, status] of statuses.entries()) {
      await deps.db.query("insert into public.copies (book_id, accession_number, barcode, status) values ($1, $2, $3, $4)", [
        id,
        `E2E-${id}-${i}`,
        `E2E-${id}-${i}`,
        status,
      ]);
    }
    // Search learns of a catalog change a moment later; a test that searches next must not race it.
    await catalog.refresh();
    res.status(201).json({ id });
  });
}
