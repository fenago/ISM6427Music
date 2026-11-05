import { suno, json, fail, checkPasscode } from "../lib/suno.mjs";

export const config = { path: "/api/status" };

const FAILED = ["CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR"];

export default async (req) => {
  const denied = checkPasscode(req);
  if (denied) return denied;
  const taskId = new URL(req.url).searchParams.get("taskId");
  if (!taskId || !/^[\w-]{4,128}$/.test(taskId)) return fail("Missing or invalid taskId.");

  const result = await suno("/api/v1/generate/record-info", { query: { taskId } });
  if (!result.ok) return fail(result.error, result.status);

  const d = result.data || {};
  const status = d.status || "PENDING";
  const tracks = (d.response?.sunoData || []).map((t) => ({
    id: t.id,
    title: t.title || "Untitled",
    tags: t.tags || "",
    lyrics: t.prompt || "",
    duration: t.duration || null,
    image: t.image_url || t.source_image_url || "",
    audio: t.audio_url || t.source_audio_url || "",
    stream: t.stream_audio_url || t.source_stream_audio_url || "",
    model: t.model_name || "",
    createdAt: t.createTime || "",
  }));

  return json({
    ok: true,
    taskId,
    status,
    done: status === "SUCCESS",
    failed: FAILED.includes(status),
    error: d.errorMessage || (FAILED.includes(status) ? status.replace(/_/g, " ").toLowerCase() : null),
    tracks,
  });
};
