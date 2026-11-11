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
