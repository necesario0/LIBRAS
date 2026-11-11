import { Router } from "express";
import type { HealthResponse } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { AppError } from "../errors.ts";

export function healthRouter({ db, clock }: AppDeps): Router {
  const router = Router();

  router.get("/health", async (_req, res) => {
    try {
      await db.query("select 1");
    } catch (error) {
      throw new AppError(503, "database_unavailable", "The service is temporarily unavailable. Please try again.", {
        cause: error,
      });
    }
    const body: HealthResponse = { status: "ok", database: "ok", time: clock.now().toISOString() };
    res.json(body);
  });

  return router;
}
