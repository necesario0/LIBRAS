import type { ErrorRequestHandler, RequestHandler } from "express";
import type { ApiErrorBody } from "@libras/shared";
import type { Logger } from "./logger.ts";

/**
 * An error whose code and message are written for the client and are safe to
 * return. Anything else that is thrown is treated as an internal error.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

function errorBody(code: string, message: string): ApiErrorBody {
  return { error: { code, message } };
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json(errorBody("not_found", "This address does not exist."));
};

/** Errors raised by the JSON body parser carry a `type` that names what went wrong. */
function bodyParserErrorType(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "type" in error && typeof error.type === "string") {
    return error.type;
  }
  return undefined;
}

/**
 * The last middleware. Turns every error into `{ error: { code, message } }`.
 * Only the message of an AppError reaches the client. Anything else is logged
 * on the server and replaced with a generic message.
 */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof AppError) {
      if (error.status >= 500) logger.error(`${req.method} ${req.path} failed: ${error.code}`, error);
      res.status(error.status).json(errorBody(error.code, error.message));
      return;
    }
    if (bodyParserErrorType(error) === "entity.parse.failed") {
      res.status(400).json(errorBody("invalid_json", "The request body is not valid JSON."));
      return;
    }
    logger.error(`${req.method} ${req.path} failed with an unhandled error`, error);
    res.status(500).json(errorBody("internal_error", "Something went wrong on our side. Please try again."));
  };
}
