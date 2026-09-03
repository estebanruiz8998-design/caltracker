# CalTracker — AI Photo Calorie Scanner

A Cal AI-style calorie tracker: snap a photo of your food and Claude's vision
AI estimates calories, protein, carbs and fat, then logs it against your daily
goals.

## Features

- **📸 AI photo scanning** — take a photo or pick one from your gallery;
  Claude (`claude-opus-4-8`) identifies the meal, breaks it into items, and
  estimates calories + macros with a health score
- **✍️ Describe your food** — no photo? Type what you ate instead
- **✨ Fix Results** — tell the AI what's wrong ("it was a double portion")
  and it re-analyzes
- **🎯 Personal goals** — onboarding computes daily calorie/macro targets
  (Mifflin-St Jeor + activity + goal), editable in Settings
- **🏠 Dashboard** — calories-left ring, protein/carbs/fat rings, day
  switcher, recently-eaten list with photo thumbnails
- **🔥 Streaks & analytics** — weekly calorie chart vs goal, macro averages,
  daily-average stats
- **🔒 Private by default** — logs live in your browser's localStorage; the
  only network call is the image analysis

## Getting started

```bash
npm install
cp .env.example .env.local   # add your Anthropic API key
npm run dev
```

Open http://localhost:3000 — on a phone (or with devtools mobile emulation)
for the intended experience. The camera button uses the native camera on
mobile browsers.

## Environment

| Variable | Used by | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | both | Anthropic key. Server-side only; never exposed to the browser. |
| `NVIDIA_API_KEY` | standalone | NVIDIA key (`nvapi-...`). When set, the function uses NVIDIA instead of Anthropic. |
| `NVIDIA_MODEL` | standalone | Escape hatch only. The app is built around `meta/llama-3.2-90b-vision-instruct`; change this only if your key can't reach it. |
| `NVIDIA_TIMEOUT_MS` | standalone | How long to wait for NVIDIA before giving up (default 8500). Keep it under your Netlify function timeout. |
| `NVIDIA_JSON_MODE` | standalone | `off` (default), `json_object`, or `json_schema`. Only turn on if the model supports it. |
| `AI_PROVIDER` | standalone | Force `nvidia` or `anthropic` when both keys are present. |

## Deploying the standalone app (Netlify)

`standalone/index.html` is a single-file version of the app for static hosting.
It talks to `netlify/functions/analyze.mjs`, which holds the API key — so the
key lives in a Netlify environment variable and **never reaches the browser**.
Baking a key into the HTML would publish it to every visitor.

1. Connect the repo in Netlify. `netlify.toml` already sets `publish` to
   `standalone/` and `functions` to `netlify/functions/`.
2. Add your key under **Site configuration → Environment variables**:
   `NVIDIA_API_KEY` (or `ANTHROPIC_API_KEY`).
3. Deploy. Settings inside the app shows which provider and model the server
   picked up.

Rotating the key later is a one-field edit in Netlify — no code change, no
redeploy of the HTML.

### Two ways to supply the key

| | Where the key lives | Who can use it |
|---|---|---|
| **Environment variable** (recommended) | Netlify, server-side | everyone visiting the site |
| **Settings screen** | that browser's localStorage | just that browser |

The environment variable is the default: once set, the app stops asking for a
key, and Settings names the variable it came from. **Use my own key instead**
reveals the key box and overrides it for that browser, so a site configured for
one provider doesn't trap you there. The model is never a caller's choice — on
NVIDIA it is fixed, and on the server's key the server decides.

Either way the app takes a key in **Settings → API key**. Keys identify their
own provider — `nvapi-…` routes to NVIDIA, `sk-ant-…` to Anthropic — so pasting
one is all the configuration needed. **Test key** checks it against the provider
and reports whether it was accepted.

An NVIDIA key still travels through the function on each scan, because browsers
are blocked from calling NVIDIA directly (no CORS). Without the function
deployed, only Anthropic keys work, and the app says so rather than failing at
scan time.

### The NVIDIA model, and the 10-second wall

The app uses one model, `meta/llama-3.2-90b-vision-instruct`, and the whole
request is shaped around a hard constraint: **Netlify stops a synchronous
function at 10 seconds.** A 90B vision model writing this app's full schema
routinely runs past that, and Netlify's kill arrives as an HTML error page —
which the browser can only report as a bare "Analysis failed".

Three things keep it inside the window:

- **A compact wire format.** The model answers with short keys (`nm`, `it`,
  `cal`) that `expandAnalysis()` maps back to the app's fields. Measured on a
  realistic five-item meal that is 31% fewer output tokens — roughly 8.2s down
  to 5.6s at 25 tok/s — and output tokens are what the time is spent on.
- **A smaller photo.** 640px rather than 1024, which shortens the call and
  stays clear of NVIDIA's inline-image cap.
- **Aborting first.** The function gives up at `NVIDIA_TIMEOUT_MS` (8.5s) so
  the failure comes back as JSON explaining itself, instead of Netlify's HTML.

If scans still time out, the honest fixes are fewer foods per photo, or a
Netlify plan with a longer function timeout (then raise `NVIDIA_TIMEOUT_MS`).

### Checking a key

The default is a guess at what your account can reach. To see the real list,
open your deployed function with `?models=1`:

```
https://<your-site>.netlify.app/.netlify/functions/analyze?models=1
```

If `meta/llama-3.2-90b-vision-instruct` is missing from that list, your key
can't reach it — set `NVIDIA_MODEL` to a vision model that is listed.

Which models a key can reach depends on your tier and credits, not on what the
catalog advertises. To check a key without deploying anything:

```bash
NVIDIA_API_KEY=nvapi-... node scripts/pick-model.mjs
```

It says whether the key works and whether it reaches the app's model, naming
the alternatives if not. Add a photo to run a real analysis through it:

```bash
NVIDIA_API_KEY=nvapi-... node scripts/pick-model.mjs meal.jpg --expect 520
```

That sends exactly what the function sends in production and reports calories,
items and **latency** — watch the ms column, since anything near 10s will be
cut off once deployed. `--all` tries every model the key lists, `--concurrency 1`
if you get rate limited.

NVIDIA's OpenAI-compatible API has no guaranteed structured-output support —
it varies per model — so the function asks for JSON in the prompt and parses
the reply defensively (fenced blocks and surrounding prose are tolerated). If
a model reliably supports strict JSON, set `NVIDIA_JSON_MODE=json_object` for
tighter results. Anthropic doesn't need this: it is held to the schema by
`output_config.format`.

### Without functions

If you deploy `standalone/index.html` on its own (a drag-and-drop of the file),
there is no function to call. The app detects this and falls back to calling
Anthropic directly from the browser with a key you paste into Settings, which
is kept in that browser's localStorage only.

## How the AI analysis works

`app/api/analyze/route.ts` (Next.js) and `netlify/functions/analyze.mjs`
(standalone) both send the client-side downscaled photo to the model with a
nutrition-analyst system prompt. On Anthropic it goes as a base64 image block;
on NVIDIA as an OpenAI-style `image_url` data URL.
The response is constrained with **structured outputs**
(`output_config.format` + JSON schema), so the API always returns valid JSON:

```jsonc
{
  "is_food": true,
  "food_name": "Chicken Caesar Salad",
  "emoji": "🥗",
  "items": [{ "name": "Grilled chicken", "quantity": "120 g", "calories": 198, ... }],
  "calories": 520,
  "protein_g": 38,
  "carbs_g": 18,
  "fat_g": 33,
  "health_score": 7,
  "confidence": "high",
  "notes": "Assumed full-fat Caesar dressing."
}
```

"Fix Results" re-sends the same image plus the previous analysis and the
user's correction.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS v4
- `@anthropic-ai/sdk` — Claude vision + structured outputs
- localStorage persistence (no database, no accounts)

## Disclaimer

Nutrition values are AI estimates and can be off, especially for hidden
ingredients and portion sizes. Not medical or dietary advice.
