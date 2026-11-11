import { API_URL } from "../config";
import { createApiClient } from "./client";

/** The one client the screens share. */
export const api = createApiClient({ baseUrl: API_URL });
