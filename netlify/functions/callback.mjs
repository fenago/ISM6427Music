// SunoAPI requires a callBackUrl. The app polls for results, so this endpoint
// just acknowledges the webhook so SunoAPI doesn't retry.
export const config = { path: "/api/callback" };

export default async () =>
  new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
