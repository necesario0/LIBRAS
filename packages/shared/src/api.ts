/**
 * The body of every error response from the API. `code` is stable and meant
 * for programs; `message` is safe to show to a Member or Librarian.
 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

/** The body of `GET /health` when the API and its database are up. */
export interface HealthResponse {
  status: "ok";
  database: "ok";
  /** The API's current time, ISO 8601. */
  time: string;
}
