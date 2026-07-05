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

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Server-side key used by `app/api/analyze/route.ts`. Never exposed to the browser. |

## How the AI analysis works

`app/api/analyze/route.ts` sends the (client-side downscaled) photo to the
Claude API as a base64 image block with a nutrition-analyst system prompt.
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
