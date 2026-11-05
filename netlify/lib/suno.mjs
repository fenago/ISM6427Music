// Shared helpers for talking to SunoAPI.org from Netlify Functions.
// The API key lives only in the SUNO_API_KEY environment variable on Netlify
// and is never sent to the browser.

// SunoAPI documents two hosts; try the configured/primary one, then the alternate.
const HOSTS = [
  ...(process.env.SUNO_API_BASE ? [process.env.SUNO_API_BASE] : []),
  "https://api.sunoapi.org",
  "https://apibox.erweima.ai",
]
  .map((h) => h.trim().replace(/\/+$/, ""))
  .filter((h, i, a) => h && a.indexOf(h) === i);

// Clean up common copy/paste mistakes in the Netlify env var:
// surrounding quotes, whitespace/newlines, or a pasted "Bearer " prefix.
export function getKey() {
  const cleaned = (process.env.SUNO_API_KEY || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  // If a whole sentence/paragraph was pasted, pull out the 32-char hex key inside it.
  if (/\s/.test(cleaned) || cleaned.length > 64) {
    const match = cleaned.match(/\b[a-f0-9]{32}\b/i);
    if (match) return match[0];
  }
  return cleaned;
}

let workingHost = null; // remembered per warm function instance

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

async function callHost(host, key, path, { method = "GET", body, query } = {}) {
  const url = new URL(host + path);
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
    return { ok: false, status: 502, network: true, error: `Could not reach SunoAPI: ${e.message}` };
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
  return { ok: true, data: payload.data, host };
}

export async function suno(path, opts = {}) {
  const key = getKey();
  if (!key) {
    return { ok: false, status: 500, error: "SUNO_API_KEY is not configured on the server." };
  }
  const order = workingHost ? [workingHost, ...HOSTS.filter((h) => h !== workingHost)] : HOSTS;
  let first;
  for (const host of order) {
    const r = await callHost(host, key, path, opts);
    if (r.ok) {
      workingHost = host;
      return r;
    }
    first ??= r;
    // Only fall through to the next host on auth/network problems; real errors
    // (bad params, no credits) must not be retried, or we could double-generate.
    if (!(r.status === 401 || r.network)) return r;
  }
  if (first.status === 401) {
    first.error =
      "SunoAPI rejected the API key. Check SUNO_API_KEY on Netlify (no quotes or spaces), " +
      "make sure the key is active at sunoapi.org/api-key, then redeploy.";
  }
  return first;
}

// Used by /api/health: which hosts accept the key (read-only credit check).
export async function diagnose() {
  const key = getKey();
  const raw = process.env.SUNO_API_KEY || "";
  const results = [];
  if (key) {
    for (const host of HOSTS) {
      const r = await callHost(host, key, "/api/v1/generate/credit");
      results.push({ host, ok: r.ok, status: r.ok ? 200 : r.status, message: r.ok ? `credits: ${r.data}` : r.error });
    }
  }
  return {
    keyConfigured: Boolean(key),
    keyLength: key.length,
    keyEndsWith: key ? key.slice(-4) : null,
    rawValueNeededCleanup: raw !== key,
    passcodeEnabled: Boolean(process.env.APP_PASSCODE),
    hosts: results,
  };
}
