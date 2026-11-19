import { Router } from "express";
import { BOOK_MESSAGES, bookIdSchema } from "@libras/shared";
import type { MySavedBooksResponse, SaveBookResponse } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { identityOf, requireMember } from "../auth/guards.ts";
import { AppError } from "../errors.ts";
import { listSavedBooks, removeSavedBook, saveBook } from "../saved-books/index.ts";

/** A Member's Saved books: list their own, save a Book, remove one. Saving and removing can be repeated. */
export function savedBooksRouter(deps: AppDeps): Router {
  const router = Router();

  function bookIdOf(param: unknown): string {
    const id = bookIdSchema.safeParse(param);
    if (!id.success) throw new AppError(400, "invalid_request", BOOK_MESSAGES.invalidId);
    return id.data;
  }

  router.get("/members/me/saved-books", ...requireMember(deps), async (_req, res) => {
    const body: MySavedBooksResponse = { savedBooks: await listSavedBooks(deps, identityOf(res)) };
    res.json(body);
  });

  router.put("/members/me/saved-books/:bookId", ...requireMember(deps), async (req, res) => {
    const bookId = bookIdOf(req.params.bookId);
    if (!(await saveBook(deps, identityOf(res), bookId))) throw new AppError(404, "book_not_found", BOOK_MESSAGES.notFound);
    const body: SaveBookResponse = { saved: true };
    res.json(body);
  });

  router.delete("/members/me/saved-books/:bookId", ...requireMember(deps), async (req, res) => {
    await removeSavedBook(deps, identityOf(res), bookIdOf(req.params.bookId));
    const body: SaveBookResponse = { saved: false };
    res.json(body);
  });

  return router;
}
