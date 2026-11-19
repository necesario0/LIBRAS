import express, { Router } from "express";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ANNOUNCEMENT_IMAGE_MAX_BYTES, ANNOUNCEMENT_MESSAGES, CATALOG_SEARCH_MESSAGES, announcementDetailsSchema, catalogSearchQuerySchema } from "@libras/shared";
import type { AnnouncementBooksResponse, AnnouncementResponse, DeskAnnouncementsResponse, ParsedAnnouncementDetails } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import {
  createAnnouncement,
  deleteAnnouncement,
  editAnnouncement,
  endAnnouncement,
  listAnnouncements,
} from "../announcements/index.ts";
import { imageRefusals } from "../announcements/images.ts";
import { identityOf, requireLibrarian } from "../auth/guards.ts";
import type { CatalogSearch } from "../catalog/catalog-search.ts";
import { AppError } from "../errors.ts";

/** How many Books the link picker offers at once. */
const BOOK_CHOICES = 8;

/** Room for the form's other fields and its boundaries beside a 5 MB image. A larger body is refused unread. */
const FORM_MAX_BYTES = ANNOUNCEMENT_IMAGE_MAX_BYTES + 64 * 1024;

const invalid = (message: string = ANNOUNCEMENT_MESSAGES.invalidRequest) => new AppError(400, "invalid_request", message);

/**
 * Reads the desk page's form (multipart/form-data) into memory, at most
 * `FORM_MAX_BYTES`: a larger one is refused as an image over 5 MB, which is
 * the only thing in it that can be large.
 */
const readForm: RequestHandler[] = [
  (req, _res, next) => {
    if (!req.is("multipart/form-data")) throw invalid();
    next();
  },
  express.raw({ type: "multipart/form-data", limit: FORM_MAX_BYTES }),
  (error: unknown, _req: Request, _res: Response, next: NextFunction) => {
    const type = (error as { type?: unknown } | null)?.type;
    next(type === "entity.too.large" ? imageRefusals.tooLarge() : error);
  },
] as RequestHandler[];

interface AnnouncementForm {
  details: ParsedAnnouncementDetails;
  /** The poster file, or undefined when the form has none (an edit that keeps the poster). */
  image: Uint8Array | undefined;
}

/** The form's two fields: `details` (JSON, `announcementDetailsSchema`) and the optional `image` file. */
async function parseForm(req: Request): Promise<AnnouncementForm> {
  if (!Buffer.isBuffer(req.body)) throw invalid();
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(req.body), { headers: { "content-type": req.get("content-type") ?? "" } }).formData();
  } catch {
    throw invalid();
  }
  const rawDetails = form.get("details");
  if (typeof rawDetails !== "string") throw invalid();
  let json: unknown;
  try {
    json = JSON.parse(rawDetails);
  } catch {
    throw invalid();
  }
  const parsed = announcementDetailsSchema.safeParse(json);
  if (!parsed.success) {
    // The first problem, in the words written for it; anything else (a field of the wrong type) gets the general message.
    const message = parsed.error.issues[0]?.message;
    const known = Object.values(ANNOUNCEMENT_MESSAGES) as string[];
    throw invalid(message !== undefined && known.includes(message) ? message : ANNOUNCEMENT_MESSAGES.invalidRequest);
  }
  const file = form.get("image");
  if (file !== null && typeof file === "string") throw invalid();
  const image = file === null || file.size === 0 ? undefined : new Uint8Array(await file.arrayBuffer());
  return { details: parsed.data, image };
}

/**
 * Announcements on the desk page, for Librarians only: list, create (with the
 * poster upload), edit, end the running one now, and delete a scheduled one.
 * Past ones are read-only. Every change is in the audit log with the Librarian.
 */
export function announcementsRouter(deps: AppDeps, catalog: CatalogSearch): Router {
  const router = Router();
  router.use("/desk/announcements", ...requireLibrarian(deps));

  router.get("/desk/announcements", async (_req, res) => {
    const body: DeskAnnouncementsResponse = await listAnnouncements(deps);
    res.json(body);
  });

  router.get("/desk/announcements/books", async (req, res) => {
    const parsed = catalogSearchQuerySchema.safeParse({ q: req.query.q, limit: String(BOOK_CHOICES) });
    if (!parsed.success) throw new AppError(400, "invalid_request", CATALOG_SEARCH_MESSAGES.invalid);
    // A Librarian links one particular Book, so every edition is its own choice.
    const { results } = await catalog.search(parsed.data.q, { ...parsed.data, latestEditionOnly: false });
    const body: AnnouncementBooksResponse = { books: results };
    res.json(body);
  });

  router.post("/desk/announcements", ...readForm, async (req, res) => {
    const { details, image } = await parseForm(req);
    const body: AnnouncementResponse = { announcement: await createAnnouncement(deps, identityOf(res), details, image) };
    res.status(201).json(body);
  });

  router.put("/desk/announcements/:id", ...readForm, async (req, res) => {
    const id = announcementId(req);
    const { details, image } = await parseForm(req);
    const body: AnnouncementResponse = { announcement: await editAnnouncement(deps, identityOf(res), id, details, image) };
    res.json(body);
  });

  router.post("/desk/announcements/:id/end", async (req, res) => {
    const body: AnnouncementResponse = { announcement: await endAnnouncement(deps, identityOf(res), announcementId(req)) };
    res.json(body);
  });

  router.delete("/desk/announcements/:id", async (req, res) => {
    await deleteAnnouncement(deps, identityOf(res), announcementId(req));
    res.status(204).end();
  });

  return router;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The id in the path. One that cannot be an Announcement's is answered like one that no longer exists. */
function announcementId(req: Request): string {
  const id = req.params.id;
  if (typeof id !== "string" || !UUID.test(id)) throw new AppError(404, "announcement_not_found", ANNOUNCEMENT_MESSAGES.notFound);
  return id.toLowerCase();
}
