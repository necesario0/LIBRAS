import type { RequestHandler, Response } from "express";
import type { StaffProfile } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { AppError } from "../errors.ts";
import type { Identity } from "./auth-provider.ts";
import { findStaffProfile } from "./staff.ts";

const BEARER = /^Bearer (\S+)$/;

export function notSignedIn(): AppError {
  return new AppError(401, "not_signed_in", "Please sign in to continue.");
}

export function notStaff(): AppError {
  return new AppError(
    403,
    "not_staff",
    "This account cannot be used here. The desk page is for library staff only. Members sign in on the LIBRAS mobile app.",
  );
}

/** The access token from `Authorization: Bearer <token>`, or undefined. */
export function bearerToken(header: string | undefined): string | undefined {
  return header === undefined ? undefined : BEARER.exec(header)?.[1];
}

/**
 * Route middleware: the request must carry a live session. Responds 401
 * `not_signed_in` otherwise. Handlers after it read the person with
 * `identityOf(res)`.
 */
export function requireIdentity({ auth }: AppDeps): RequestHandler {
  return async (req, res, next) => {
    const accessToken = bearerToken(req.get("authorization"));
    const identity = accessToken === undefined ? undefined : await auth.identify(accessToken);
    if (!identity) throw notSignedIn();
    res.locals.identity = identity;
    next();
  };
}

/**
 * Route middleware: the request must come from a signed-in Librarian. Responds
 * 401 `not_signed_in` without a live session and 403 `not_staff` when the
 * person is not staff. Handlers after it read `librarianOf(res)`.
 */
export function requireLibrarian(deps: AppDeps): RequestHandler[] {
  return [
    requireIdentity(deps),
    async (_req, res, next) => {
      const staff = await findStaffProfile(deps.db, identityOf(res));
      if (staff?.role !== "librarian") throw notStaff();
      res.locals.librarian = staff;
      next();
    },
  ];
}

/** The signed-in person. Only valid after `requireIdentity`, `requireLibrarian` or a later guard built on them. */
export function identityOf(res: Response): Identity {
  const identity = res.locals.identity as Identity | undefined;
  if (!identity) throw new Error("identityOf was called on a route that has no sign-in guard");
  return identity;
}

/** The signed-in Librarian. Only valid after `requireLibrarian`. */
export function librarianOf(res: Response): StaffProfile {
  const librarian = res.locals.librarian as StaffProfile | undefined;
  if (!librarian) throw new Error("librarianOf was called on a route that is not guarded by requireLibrarian");
  return librarian;
}
