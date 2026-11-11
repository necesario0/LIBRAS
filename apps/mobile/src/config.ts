/**
 * The API base URL, fixed at build time. `10.0.2.2` is the Android emulator's
 * alias for the host machine, where `npm run dev` serves the API on port 3000.
 * Set `EXPO_PUBLIC_API_URL` for a device or a hosted API.
 */
export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:3000";
