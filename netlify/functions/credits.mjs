import { suno, json, fail, checkPasscode } from "../lib/suno.mjs";

export const config = { path: "/api/credits" };

export default async (req) => {
  const denied = checkPasscode(req);
  if (denied) return denied;
  const result = await suno("/api/v1/generate/credit");
  if (!result.ok) return fail(result.error, result.status);
  return json({ ok: true, credits: result.data });
};
