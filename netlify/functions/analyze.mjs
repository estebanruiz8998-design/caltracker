/**
 * Meal-analysis proxy.
 *
 * The browser never sees an API key: it POSTs the meal here and this function
 * calls the AI provider with a key held in a Netlify environment variable.
 *
 * Environment variables
 *   NVIDIA_API_KEY     nvapi-...  → provider defaults to "nvidia"
 *   ANTHROPIC_API_KEY  sk-ant-... → provider defaults to "anthropic"
 *   AI_PROVIDER        force "nvidia" | "anthropic" when both keys are present
 *   NVIDIA_MODEL       vision model id (default below); GET ?models=1 lists valid ids
 *   NVIDIA_JSON_MODE   "off" (default) | "json_object" | "json_schema"
 *
 * NVIDIA's OpenAI-compatible API has no guaranteed structured-output support —
 * it varies per model — so JSON is requested in the prompt and parsed
 * defensively. Turn NVIDIA_JSON_MODE on only if your model advertises it.
 */

export const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_NVIDIA_MODEL = "meta/llama-3.2-90b-vision-instruct";
export const ANTHROPIC_MODELS = ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-4-8"];

/* Model ids that look image-capable, used to shortlist NVIDIA_MODEL candidates. */
export const LOOKS_VISUAL = /(^|[-\/])(vl|vlm|vision|multimodal)([-\/]|$)|llama-4|gemma-3|maverick|scout|phi-3\.5-vision|mistral-medium/i;

/* Keys identify their own provider, so a pasted key routes itself. */
export function detectProvider(key) {
  if (/^nvapi-/i.test(key || "")) return "nvidia";
  if (/^sk-ant-/i.test(key || "")) return "anthropic";
  return null;
}

/* Requests larger than this are rejected before they reach the provider, so a
   stray caller can't run up the bill on a function that has no auth of its own. */
const MAX_BODY_BYTES = 6 * 1024 * 1024;

export const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["is_food","food_name","emoji","items","calories","protein_g","carbs_g","fat_g","health_score","confidence","notes"],
  properties: {
    is_food: { type: "boolean", description: "false if the image contains no food or drink" },
    food_name: { type: "string", description: "Short display name for the meal" },
    emoji: { type: "string", description: "Single emoji representing the meal" },
    items: { type: "array", description: "Each distinct food item with estimated portion",
      items: { type: "object", additionalProperties: false,
        required: ["name","quantity","calories","protein_g","carbs_g","fat_g"],
        properties: { name:{type:"string"}, quantity:{type:"string"},
          calories:{type:"number"}, protein_g:{type:"number"}, carbs_g:{type:"number"}, fat_g:{type:"number"} } } },
    calories: { type: "number" }, protein_g: { type: "number" },
    carbs_g: { type: "number" }, fat_g: { type: "number" },
    health_score: { type: "integer", enum: [1,2,3,4,5,6,7,8,9,10] },
    confidence: { type: "string", enum: ["low","medium","high"] },
    notes: { type: "string", description: "One short sentence about assumptions" },
  },
};

export const SYSTEM_PROMPT = `You are the nutrition analysis engine of a photo calorie-tracking app.
Given a photo (and/or description) of food, identify the meal and estimate its nutrition accurately.
- Estimate portions from visual cues (plate size, utensils, packaging).
- Account for likely cooking oils, dressings and sauces even when not obvious.
- Break the meal into distinct components in "items"; totals must equal the item sum.
- Use realistic USDA-style values. When unsure, give your best single estimate and lower confidence.
- health_score: 10 = whole nutrient-dense food; 1 = heavily processed with little nutritional value.
- If the image contains no food or drink, set is_food=false with zeros and explain in notes.`;

/* Claude is held to the schema by output_config; NVIDIA models are not, so they
   get the schema in the prompt instead. */
export const JSON_RULES = `\n\nRespond with a single JSON object and nothing else — no prose, no markdown fences.
It must match this JSON Schema exactly:
${JSON.stringify(SCHEMA)}`;

function serverProvider() {
  const forced = (process.env.AI_PROVIDER || "").trim().toLowerCase();
  if (forced === "nvidia" || forced === "anthropic") return forced;
  if (process.env.NVIDIA_API_KEY) return "nvidia";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "none";
}

function apiKeyFor(name) {
  return (name === "nvidia" ? process.env.NVIDIA_API_KEY : process.env.ANTHROPIC_API_KEY) || "";
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function fail(message, status = 502, detail) {
  return json(detail ? { error: message, detail } : { error: message }, status);
}

/* Builds the instruction shared by both providers. */
function instructionFor({ imageB64, description, correction, previous }) {
  if (correction && previous) {
    const original = !imageB64 && description
      ? `The meal was originally described as: "${String(description).slice(0, 1000)}"\n\n` : "";
    return `${original}Here is your previous analysis of this meal:\n${JSON.stringify(previous)}\n\n`
      + `The user says the analysis needs fixing: "${String(correction).slice(0, 500)}"\n\n`
      + `Re-analyze applying the correction. Keep what was right; only change what the correction implies.`;
  }
  if (description && !imageB64) {
    return `Analyze this meal from the user's description (no photo):\n"${String(description).slice(0, 1000)}"`;
  }
  return "Analyze the food in this photo.";
}

/* NVIDIA models return JSON wrapped in prose or fences often enough that a
   plain JSON.parse of the whole reply is not safe. Pull out the first balanced
   object instead, tracking string state so braces inside values don't count. */
export function extractJson(text) {
  const trimmed = String(text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(trimmed); } catch { /* fall through to a scan */ }

  const start = trimmed.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { if (inString) escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try { return JSON.parse(trimmed.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

async function callNvidia(key, payload) {
  /* Only a caller spending their own key may choose the model. On the server's
     key the server decides, so a caller can't aim it at a pricier model. */
  const requested = typeof payload.model === "string" && /^[\w.\-]+\/[\w.\-]+$/.test(payload.model.trim())
    ? payload.model.trim() : "";
  const model = payload.usingClientKey
    ? (requested || process.env.NVIDIA_MODEL || DEFAULT_NVIDIA_MODEL)
    : (process.env.NVIDIA_MODEL || DEFAULT_NVIDIA_MODEL);
  const instruction = instructionFor(payload) + JSON_RULES;

  /* Text-only requests use a plain string so models without vision still work. */
  const content = payload.imageB64
    ? [
        { type: "text", text: instruction },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${payload.imageB64}` } },
      ]
    : instruction;

  const body = {
    model,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content }],
    max_tokens: 2048,
    temperature: 0.2,
    top_p: 0.7,
  };

  const mode = (process.env.NVIDIA_JSON_MODE || "off").trim().toLowerCase();
  if (mode === "json_object") body.response_format = { type: "json_object" };
  else if (mode === "json_schema") {
    body.response_format = { type: "json_schema", json_schema: { name: "meal_analysis", schema: SCHEMA, strict: true } };
  }

  const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const raw = await res.text();
    if (res.status === 401 || res.status === 403) return fail("Invalid NVIDIA API key — check NVIDIA_API_KEY in Netlify.", 401);
    if (res.status === 404) {
      return fail(`NVIDIA has no model "${model}". Open this function with ?models=1 to list the ids your key can use, then set NVIDIA_MODEL.`, 404);
    }
    if (res.status === 429) return fail("Rate limited by NVIDIA — wait a moment and try again.", 429);
    if (res.status === 413) return fail("Photo too large for this NVIDIA model. Lower imageMaxEdge and retry.", 413);
    return fail("NVIDIA request failed.", 502, raw.slice(0, 400));
  }

  const data = await res.json();
  const choice = data?.choices?.[0];
  if (choice?.finish_reason === "length") return fail("Analysis ran too long. Please try again.", 502);

  const parsed = extractJson(choice?.message?.content);
  if (!parsed) {
    return fail(
      `${model} did not return usable JSON. Try a different NVIDIA_MODEL, or set NVIDIA_JSON_MODE=json_object if this model supports it.`,
      502,
      String(choice?.message?.content ?? "").slice(0, 400),
    );
  }
  return json({ analysis: parsed, provider: "nvidia", model });
}

async function callAnthropic(key, payload) {
  const requested = String(payload.model || "");
  const model = ANTHROPIC_MODELS.includes(requested) ? requested : ANTHROPIC_MODELS[0];
  const content = [];
  if (payload.imageB64) {
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: payload.imageB64 } });
  }
  content.push({ type: "text", text: instructionFor(payload) });

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 16000,
      // adaptive thinking is a 4.6+/5-family parameter; Haiku 4.5 rejects it
      ...(model === "claude-haiku-4-5" ? {} : { thinking: { type: "adaptive" } }),
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    let apiMsg = "";
    try { apiMsg = JSON.parse(raw)?.error?.message || ""; } catch { /* not JSON */ }
    if (res.status === 401) return fail("Invalid Anthropic API key — check ANTHROPIC_API_KEY in Netlify.", 401);
    if (res.status === 429) return fail("Rate limited — wait a moment and try again.", 429);
    if (/credit balance/i.test(apiMsg)) return fail("Your Anthropic account is out of credits.", 402);
    return fail(apiMsg ? apiMsg.slice(0, 200) : "Analysis failed. Please try again.", 502);
  }

  const data = await res.json();
  if (data.stop_reason === "refusal") return fail("The analysis was declined. Try a different photo.", 502);
  if (data.stop_reason === "max_tokens") return fail("Analysis ran too long. Please try again.", 502);
  const text = (data.content || []).find((b) => b.type === "text");
  const parsed = text ? extractJson(text.text) : null;
  if (!parsed) return fail("No analysis returned. Please try again.", 502);
  return json({ analysis: parsed, provider: "anthropic", model });
}

/* Checks a key against its provider and reports the models it can reach.
   This is what the app's "Test key" button calls. */
async function verifyKey(key) {
  const name = detectProvider(key);
  if (!name) {
    return fail('Unrecognized key format. NVIDIA keys start with "nvapi-", Anthropic keys with "sk-ant-".', 400);
  }
  if (name === "nvidia") {
    const res = await fetch(`${NVIDIA_BASE}/models`, { headers: { authorization: `Bearer ${key}` } });
    if (res.status === 401 || res.status === 403) return fail("NVIDIA rejected this key. Regenerate it at build.nvidia.com.", 401);
    if (!res.ok) return fail(`NVIDIA returned HTTP ${res.status}.`, 502);
    const ids = ((await res.json())?.data || []).map((m) => m.id).filter(Boolean);
    const vision = ids.filter((id) => LOOKS_VISUAL.test(id)).sort();
    return json({ ok: true, provider: "nvidia", total: ids.length,
      models: vision.length ? vision : ids.sort().slice(0, 40), visionOnly: vision.length > 0 });
  }
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
  });
  if (res.status === 401) return fail("Anthropic rejected this key. Check it at platform.claude.com.", 401);
  if (!res.ok) return fail(`Anthropic returned HTTP ${res.status}.`, 502);
  const ids = ((await res.json())?.data || []).map((m) => m.id).filter(Boolean);
  return json({ ok: true, provider: "anthropic", total: ids.length,
    models: ANTHROPIC_MODELS.filter((m) => ids.includes(m)), visionOnly: true });
}

/* GET ?models=1 — lists the model ids this NVIDIA key can reach, so a wrong
   NVIDIA_MODEL is diagnosable from the browser instead of by guesswork. */
async function listNvidiaModels(key) {
  const res = await fetch(`${NVIDIA_BASE}/models`, { headers: { authorization: `Bearer ${key}` } });
  if (!res.ok) {
    const raw = await res.text();
    return fail(res.status === 401 ? "Invalid NVIDIA API key." : "Could not list NVIDIA models.", res.status, raw.slice(0, 300));
  }
  const data = await res.json();
  const ids = (data?.data || []).map((m) => m.id).filter(Boolean).sort();
  return json({ count: ids.length, models: ids });
}

export default async function handler(req) {
  const envName = serverProvider();
  const envKey = apiKeyFor(envName);
  const hasServerKey = envName !== "none";

  if (req.method === "GET") {
    if (new URL(req.url).searchParams.get("models") && envName === "nvidia") {
      return listNvidiaModels(envKey);
    }
    return json({
      ok: true,
      /* The function is reachable either way; serverKey says whether the
         caller still needs to supply a key of their own. */
      serverKey: hasServerKey,
      provider: hasServerKey ? envName : null,
      model: envName === "nvidia" ? (process.env.NVIDIA_MODEL || DEFAULT_NVIDIA_MODEL) : null,
      /* NVIDIA caps inline image payloads well below Anthropic's limit. */
      imageMaxEdge: envName === "nvidia" ? 768 : 1024,
      modelPicker: envName !== "nvidia",
      hint: hasServerKey ? undefined
        : "No key on the server. Paste one in Settings, or set NVIDIA_API_KEY in Netlify → Site configuration → Environment variables.",
    });
  }

  if (req.method !== "POST") return fail("Method not allowed.", 405);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return fail("Request too large.", 413);

  let payload;
  try { payload = JSON.parse(raw); } catch { return fail("Malformed request body.", 400); }

  const clientKey = typeof payload?.apiKey === "string" ? payload.apiKey.trim() : "";

  if (payload?.action === "verify") {
    if (!clientKey) return fail("No key to verify.", 400);
    try { return await verifyKey(clientKey); }
    catch (e) { return fail("Could not reach the provider to check the key.", 502, String(e?.message || e).slice(0, 200)); }
  }

  if (!payload?.imageB64 && !payload?.description) return fail("Nothing to analyze.", 400);

  /* A caller who supplies their own key spends their own quota, so let it win
     over the server's — that is the escape hatch when the site is configured
     for one provider and you want the other. Falls back to the server key. */
  let name = envName, key = envKey;
  if (clientKey) {
    const detected = detectProvider(clientKey);
    if (!detected) return fail('Unrecognized key format. NVIDIA keys start with "nvapi-", Anthropic keys with "sk-ant-".', 400);
    name = detected;
    key = clientKey;
  } else if (!hasServerKey) {
    return fail("No API key yet — add one in Settings.", 503);
  }
  /* Only a caller spending their own key may choose the model. */
  payload.usingClientKey = !!clientKey;

  try {
    return name === "nvidia" ? await callNvidia(key, payload) : await callAnthropic(key, payload);
  } catch (e) {
    return fail("Could not reach the AI provider.", 502, String(e?.message || e).slice(0, 200));
  }
}
