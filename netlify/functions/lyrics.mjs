import { suno, json, fail, checkPasscode, callbackUrl } from "../lib/suno.mjs";

export const config = { path: "/api/lyrics" };

// POST { prompt } -> start a lyrics task.  GET ?taskId= -> poll it.
export default async (req) => {
  const denied = checkPasscode(req);
  if (denied) return denied;

  if (req.method === "POST") {
    let input;
    try {
      input = await req.json();
    } catch {
      return fail("Request body must be JSON.");
    }
    const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
    if (!prompt) return fail("Tell me what the lyrics should be about.");
    if (prompt.length > 200) return fail("Lyrics idea must be 200 characters or fewer.");
    const result = await suno("/api/v1/lyrics", {
      method: "POST",
      body: { prompt, callBackUrl: callbackUrl(req) },
    });
    if (!result.ok) return fail(result.error, result.status);
    return json({ ok: true, taskId: result.data?.taskId });
  }

  const taskId = new URL(req.url).searchParams.get("taskId");
  if (!taskId || !/^[\w-]{4,128}$/.test(taskId)) return fail("Missing or invalid taskId.");
  const result = await suno("/api/v1/lyrics/record-info", { query: { taskId } });
  if (!result.ok) return fail(result.error, result.status);
  const d = result.data || {};
  const status = d.status || "PENDING";
  const options = (d.response?.data || [])
    .filter((x) => x.text)
    .map((x) => ({ title: x.title || "", text: x.text }));
  const failed = /FAIL|ERROR/.test(status);
  return json({ ok: true, status, done: status === "SUCCESS", failed, error: d.errorMessage || null, options });
};
