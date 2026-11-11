import { Router } from "express";
import type { HealthResponse } from "@libras/shared";
import type { AppDeps } from "../app.ts";

export function healthRouter({ db, clock }: AppDeps): Router {
  const router = Router();

  router.get("/health", async (_req, res) => {
    await db.query("select 1");
    const body: HealthResponse = { status: "ok", database: "ok", time: clock.now().toISOString() };
    res.json(body);
  });

  return router;
}
