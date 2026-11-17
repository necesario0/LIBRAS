import { Router } from "express";
import { FINE_MESSAGES, settleFineRequestSchema } from "@libras/shared";
import type { SettleFineResponse } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { identityOf, requireLibrarian } from "../auth/guards.ts";
import { settleFine } from "../fines/settle.ts";
import { parseBody } from "../validation.ts";

/** Fines: a Librarian settles one as paid or waived, on a return or in a Member's desk session (ADR 0010). */
export function finesRouter(deps: AppDeps): Router {
  const router = Router();

  router.post("/desk/fines/settle", ...requireLibrarian(deps), async (req, res) => {
    const request = parseBody(settleFineRequestSchema, req.body, FINE_MESSAGES.invalidRequest);
    const body: SettleFineResponse = await settleFine(deps, identityOf(res), request);
    res.json(body);
  });

  return router;
}
