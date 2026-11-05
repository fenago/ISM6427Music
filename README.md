# SongForge — AI Music Studio (ISM6427Music)

A web app that lets anyone generate full songs with AI, powered by [SunoAPI.org](https://docs.sunoapi.org/).

- **Simple mode** — describe a song in a sentence; lyrics are written automatically.
- **Custom mode** — your own title, lyrics, style, excluded styles, voice, length, style adherence and weirdness.
- **✨ Write lyrics with AI** — generates lyric options from a short idea.
- Choice of Suno models (V6, V6 Mini, V6 Wild, V5.5, V4.5 Plus/All, V4.5).
- Live progress, early streaming playback, cover art, MP3 download, lyrics view, "reuse settings".
- Song history and remaining credits display.

## Tech stack

- Static front end (`public/`) — plain HTML/CSS/JS, no build step.
- Netlify Functions (`netlify/functions/`) proxy SunoAPI so the **API key never reaches the browser**.

| Route | Purpose | SunoAPI endpoint |
|---|---|---|
| `POST /api/generate` | Start a song | `POST /api/v1/generate` |
| `GET /api/status?taskId=` | Poll a song | `GET /api/v1/generate/record-info` |
| `POST /api/lyrics`, `GET /api/lyrics?taskId=` | AI lyrics | `/api/v1/lyrics`, `/api/v1/lyrics/record-info` |
| `GET /api/credits` | Remaining credits | `GET /api/v1/generate/credit` |
| `GET /api/health` | Setup check — is the key set and accepted? | credit check on each host |
| `POST /api/callback` | Required webhook target (acknowledged; app polls) | — |

## Deploy on Netlify

1. In Netlify: **Add new site → Import an existing project → GitHub →** this repo, branch `main`.
   Build settings are read from `netlify.toml` (publish `public`, functions `netlify/functions`; no build command).
2. **Site configuration → Environment variables**, add:
   - `SUNO_API_KEY` — your SunoAPI.org key (**required**)
   - `APP_PASSCODE` — optional; if set, visitors must enter it before generating (protects your credits)
3. Deploy (or **Trigger deploy** after adding variables).

## Local development

```bash
npm i -g netlify-cli
cp .env.example .env   # put your key in .env
netlify dev
```

Notes: generated files are hosted by SunoAPI for a limited time — download the songs you want to keep. History is stored in each visitor's browser.
