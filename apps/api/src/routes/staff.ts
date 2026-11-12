import { Router } from "express";
import { signInRequestSchema } from "@libras/shared";
import type { StaffMeResponse, StaffSignInResponse } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { createAuditLog, recordingSignInFailures } from "../audit/index.ts";
import type { SignInLimiter } from "../auth/sign-in-limit.ts";
import { librarianOf, notStaff, requireLibrarian } from "../auth/guards.ts";
import { findStaffProfile } from "../auth/staff.ts";
import { AppError } from "../errors.ts";
import { parseBody } from "../validation.ts";

/** Sign-in for the Librarian pages. A Member never gets a session here. */
export function staffRouter(deps: AppDeps, limiter: SignInLimiter): Router {
  const { auth, db } = deps;
  const router = Router();
  const audit = createAuditLog(deps);

  router.post("/staff/sign-in", async (req, res) => {
    const { email, password } = parseBody(signInRequestSchema, req.body, "Enter your email and password.");
    const attempt = { portal: "staff", email, clientAddress: req.ip } as const;

    const signInStaff = async (): Promise<StaffSignInResponse> => {
      const signedIn = await auth.signInWithPassword(email, password);
      // One message for an unknown email and a wrong password, so the response
      // never says which of the two was wrong. An unverified account has no staff row either.
      if (typeof signedIn !== "object") throw new AppError(401, "invalid_credentials", "The email or password is incorrect.");

      const staff = await findStaffProfile(db, signedIn.identity);
      if (!staff) {
        // A Member has an account too, but not here: end the session just made.
        await auth.signOut(signedIn.session.accessToken);
        throw notStaff();
      }
      return { session: signedIn.session, staff };
    };
    const body = await limiter.attempt(req.ip, () =>
      recordingSignInFailures({ audit, logger: deps.logger }, attempt, signInStaff),
    );
    res.json(body);
  });

  router.get("/staff/me", ...requireLibrarian(deps), (_req, res) => {
    const body: StaffMeResponse = { staff: librarianOf(res) };
    res.json(body);
  });

  return router;
}
