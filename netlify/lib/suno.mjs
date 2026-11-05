// Shared helpers for talking to SunoAPI.org from Netlify Functions.
// The API key lives only in the SUNO_API_KEY environment variable on Netlify
// and is never sent to the browser.

const BASE = (process.env.SUNO_API_BASE || "https://api.sunoapi.org").replace(/\/+$/, "");

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function fail(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

// Optional shared passcode: if APP_PASSCODE is set on Netlify, callers must send it
// in the x-app-passcode header. Keeps strangers from spending your credits.
export function checkPasscode(req) {
  const required = process.env.APP_PASSCODE;
  if (!required) return null;
  if (req.headers.get("x-app-passcode") === required) return null;
  return fail("Passcode required or incorrect.", 401);
}

export function callbackUrl(req) {
  const site = process.env.URL || new URL(req.url).origin;
  return `${site.replace(/\/+$/, "")}/api/callback`;
}

const CODE_MESSAGES = {
  400: "Invalid parameters.",
  401: "Unauthorized — check the SUNO_API_KEY on Netlify.",
  404: "Invalid request method or path.",
  405: "Rate limit exceeded. Try again shortly.",
  413: "Prompt or lyrics too long.",
  429: "Insufficient SunoAPI credits.",
  430: "Too many requests. Please slow down.",
  455: "SunoAPI is under maintenance.",
  500: "SunoAPI server error.",
};

export async function suno(path, { method = "GET", body, query } = {}) {
  const key = process.env.SUNO_API_KEY;
  if (!key) {
    return { ok: false, status: 500, error: "SUNO_API_KEY is not configured on the server." };
  }
  const url = new URL(BASE + path);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    return { ok: false, status: 502, error: `Could not reach SunoAPI: ${e.message}` };
  }

  let payload;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, status: 502, error: `SunoAPI returned a non-JSON response (HTTP ${res.status}).` };
  }

  if (payload?.code !== 200) {
    const code = payload?.code ?? res.status;
    return {
      ok: false,
      status: code >= 400 && code < 600 ? code : 502,
      error: payload?.msg || CODE_MESSAGES[code] || `SunoAPI error ${code}`,
    };
  }
  return { ok: true, data: payload.data };
}
