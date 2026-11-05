import { suno, json, fail, checkPasscode, callbackUrl } from "../lib/suno.mjs";

export const config = { path: "/api/generate" };

const MODELS = ["V6", "V6_MINI", "V6_WILD", "V5_5", "V5", "V4_5PLUS", "V4_5ALL", "V4_5"];
const DURATION_MODELS = ["V5_5", "V6", "V6_MINI", "V6_WILD"];

const str = (v) => (typeof v === "string" ? v.trim() : "");
const unit = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? Math.round(n * 100) / 100 : undefined;
};

export default async (req) => {
  if (req.method !== "POST") return fail("Use POST.", 405);
  const denied = checkPasscode(req);
  if (denied) return denied;

  let input;
  try {
    input = await req.json();
  } catch {
    return fail("Request body must be JSON.");
  }

  const model = MODELS.includes(input.model) ? input.model : "V6";
  const customMode = Boolean(input.customMode);
  const instrumental = Boolean(input.instrumental);
  const prompt = str(input.prompt);
  const style = str(input.style);
  const lyrics = instrumental ? "" : str(input.lyrics);

  const body = { customMode, instrumental, model, callBackUrl: callbackUrl(req) };

  if (!customMode) {
    // Simple mode: describe the song, Suno writes lyrics automatically.
    if (!prompt && !style) return fail("Describe the song you want.");
    if (prompt.length > 3000) return fail("Description must be 3000 characters or fewer.");
    if (style.length > 1000) return fail("Style must be 1000 characters or fewer.");
    if (prompt) body.prompt = prompt;
    if (style) body.style = style;
  } else {
    const title = str(input.title);
    const negativeTags = str(input.negativeTags);
    if (!style && !lyrics && !negativeTags) {
      return fail("Custom mode needs at least a style or lyrics.");
    }
    if (!instrumental && !lyrics) return fail("Add lyrics, or switch on Instrumental.");
    if (title.length > 80) return fail("Title must be 80 characters or fewer.");
    if (style.length > 1000) return fail("Style must be 1000 characters or fewer.");
    if (lyrics.length > 5000) return fail("Lyrics must be 5000 characters or fewer.");
    if (negativeTags.length > 1000) return fail("Excluded styles must be 1000 characters or fewer.");

    if (title) body.title = title;
    if (style) body.style = style;
    if (lyrics) body.lyrics = lyrics;
    if (negativeTags) body.negativeTags = negativeTags;
    if (!instrumental && (input.vocalGender === "m" || input.vocalGender === "f")) {
      body.vocalGender = input.vocalGender;
    }
    const sw = unit(input.styleWeight);
    const wc = unit(input.weirdnessConstraint);
    if (sw !== undefined) body.styleWeight = sw;
    if (wc !== undefined) body.weirdnessConstraint = wc;
    if (input.duration && DURATION_MODELS.includes(model)) {
      const d = Math.round(Number(input.duration));
      if (Number.isFinite(d)) body.duration = Math.min(360, Math.max(10, d));
    }
  }

  const result = await suno("/api/v1/generate", { method: "POST", body });
  if (!result.ok) return fail(result.error, result.status);
  return json({ ok: true, taskId: result.data?.taskId });
};
