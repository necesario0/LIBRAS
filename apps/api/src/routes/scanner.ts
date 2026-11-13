import { Router } from "express";
import type { Request, Response } from "express";
import { SCANNER_MESSAGES, pairScannerRequestSchema, readScan, sendScanRequestSchema } from "@libras/shared";
import type { DeskScannerEventName, DeskScannerEvents, PairScannerResponse, ScannerStatusResponse } from "@libras/shared";
import { z } from "zod";
import type { AppDeps } from "../app.ts";
import type { AttemptLimiter } from "../auth/attempt-limit.ts";
import { bearerToken, librarianOf, requireLibrarian } from "../auth/guards.ts";
import { AppError } from "../errors.ts";
import { pairingLost } from "../scanner/hub.ts";
import type { DeskSink, ScannerHub } from "../scanner/hub.ts";
import { parseBody } from "../validation.ts";

const KEEP_ALIVE_MS = 15_000;
const unpairRequestSchema = z.object({ deskId: z.string().min(1).max(64) }).strict();

/** The scanner token from the Authorization header. Missing is the same answer as unknown: the pairing is lost. */
function scannerToken(req: Request): string {
  const token = bearerToken(req.get("authorization"));
  if (token === undefined) throw pairingLost();
  return token;
}

/** Writes server-sent events to a response the desk page keeps open. */
function sinkOf(res: Response): DeskSink {
  return {
    send<Name extends DeskScannerEventName>(name: Name, payload: DeskScannerEvents[Name]) {
      if (!res.writableEnded) res.write(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`);
    },
    close() {
      if (!res.writableEnded) res.end();
    },
  };
}

/**
 * The phone as the scanner. The desk page (a signed-in Librarian) streams its
 * pairing code and the scans of its paired phone; the phone, which is not
 * signed in, pairs with the code and then sends scans with the scanner token it
 * got. That token is accepted by the `/scanner/*` endpoints and nowhere else.
 */
export function scannerRouter(deps: AppDeps, hub: ScannerHub, pairingLimiter: AttemptLimiter): Router {
  const router = Router();

  router.get("/desk/scanner/events", ...requireLibrarian(deps), (req, res) => {
    const resume = typeof req.query.desk === "string" ? req.query.desk.slice(0, 64) : undefined;
    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      // No cache, and no proxy (nginx style or otherwise) may hold the events back.
      "Cache-Control": "no-cache, no-store, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    req.socket.setKeepAlive(true);
    req.socket.setNoDelay(true);

    const sink = sinkOf(res);
    const disconnect = hub.connectDesk(librarianOf(res).id, sink, resume);
    // A comment line every few seconds keeps proxies and the free host from closing an idle stream.
    const keepAlive = setInterval(() => {
      if (!res.writableEnded) res.write(": ping\n\n");
    }, KEEP_ALIVE_MS);
    // The stream does not live for ever: ending it makes the page reconnect with a session that is checked again.
    const lifetime = setTimeout(() => {
      sink.send("end", {});
      sink.close();
    }, hub.streamSeconds * 1000);
    res.on("close", () => {
      clearInterval(keepAlive);
      clearTimeout(lifetime);
      disconnect();
    });
  });

  router.post("/desk/scanner/unpair", ...requireLibrarian(deps), (req, res) => {
    const { deskId } = parseBody(unpairRequestSchema, req.body, "Say which desk page to unpair.");
    hub.unpairDesk(librarianOf(res).id, deskId);
    res.status(204).end();
  });

  router.post("/scanner/pair", async (req, res) => {
    const { code } = parseBody(pairScannerRequestSchema, req.body, SCANNER_MESSAGES.pairingCodeFormat);
    const token = await pairingLimiter.attempt(req.ip, async () => hub.pair(code));
    const body: PairScannerResponse = { token };
    res.set("Cache-Control", "no-store").json(body);
  });

  router.post("/scanner/scans", (req, res) => {
    const token = scannerToken(req);
    const { text } = parseBody(sendScanRequestSchema, req.body, SCANNER_MESSAGES.scanFormat);
    // The same whitelist the desk page applies: nothing else is ever passed on.
    const reading = readScan(text);
    if (reading.kind === "rejected") throw new AppError(400, "scan_rejected", reading.message);
    hub.deliver(token, text.trim());
    res.status(202).json({ accepted: true });
  });

  router.get("/scanner/status", (req, res) => {
    const body: ScannerStatusResponse = hub.status(scannerToken(req));
    res.set("Cache-Control", "no-store").json(body);
  });

  router.delete("/scanner/pairing", (req, res) => {
    hub.leave(scannerToken(req));
    res.status(204).end();
  });

  return router;
}
