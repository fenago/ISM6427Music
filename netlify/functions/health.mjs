import { diagnose, json } from "../lib/suno.mjs";

// Setup check: open /api/health to see whether the API key is configured and
// accepted. Only the last 4 characters of the key is ever shown.
export const config = { path: "/api/health" };

export default async () => json(await diagnose());
