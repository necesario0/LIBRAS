import { Router } from "express";
import { signInRequestSchema } from "@libras/shared";
import type { StaffMeResponse, StaffSignInResponse } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { librarianOf, notStaff, requireLibrarian } from "../auth/guards.ts";
import { findStaffProfile } from "../auth/staff.ts";
import { AppError } from "../errors.ts";
import { parseBody } from "../validation.ts";

/** Sign-in for the Librarian pages. A Member never gets a session here. */
export function staffRouter(deps: AppDeps): Router {
  const { auth, db } = deps;
  const router = Router();

  router.post("/staff/sign-in", async (req, res) => {
    const { email, password } = parseBody(signInRequestSchema, req.body, "Enter your email and password.");

    const signedIn = await auth.signInWithPassword(email, password);
    // One message for an unknown email and a wrong password, so the response
    // never says which of the two was wrong.
    if (!signedIn) throw new AppError(401, "invalid_credentials", "The email or password is incorrect.");

    const staff = await findStaffProfile(db, signedIn.identity);
    if (!staff) {
      // A Member has an account too, but not here: end the session just made.
      await auth.signOut(signedIn.session.accessToken);
      throw notStaff();
    }

    const body: StaffSignInResponse = { session: signedIn.session, staff };
    res.json(body);
  });

  router.get("/staff/me", ...requireLibrarian(deps), (_req, res) => {
    const body: StaffMeResponse = { staff: librarianOf(res) };
    res.json(body);
  });

  return router;
}
