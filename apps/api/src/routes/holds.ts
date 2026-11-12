import { Router } from "express";
import { HOLD_MESSAGES, holdIdSchema, placeHoldRequestSchema } from "@libras/shared";
import type { CancelHoldResponse, MyHoldsResponse, PlaceHoldResponse } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { identityOf, memberOf, requireMember } from "../auth/guards.ts";
import { AppError } from "../errors.ts";
import { cancelHold, listHolds, placeHold } from "../holds/index.ts";
import { parseBody } from "../validation.ts";

/** A Member's Holds: place one, list their own, cancel one. */
export function holdsRouter(deps: AppDeps): Router {
  const router = Router();

  router.post("/holds", ...requireMember(deps), async (req, res) => {
    const { bookId } = parseBody(placeHoldRequestSchema, req.body, HOLD_MESSAGES.invalidRequest);
    const body: PlaceHoldResponse = { hold: await placeHold(deps, memberOf(res), bookId) };
    res.status(201).json(body);
  });

  router.get("/members/me/holds", ...requireMember(deps), async (_req, res) => {
    const body: MyHoldsResponse = { holds: await listHolds(deps, identityOf(res)) };
    res.json(body);
  });

  router.post("/holds/:id/cancel", ...requireMember(deps), async (req, res) => {
    const id = holdIdSchema.safeParse(req.params.id);
    if (!id.success) throw new AppError(400, "invalid_request", HOLD_MESSAGES.invalidId);
    const body: CancelHoldResponse = { hold: await cancelHold(deps, memberOf(res), id.data) };
    res.json(body);
  });

  return router;
}
