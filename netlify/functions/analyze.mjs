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

/* The one NVIDIA model this app supports: the vision model free-tier keys
   reliably reach. Everything below is tuned for it. */
export const NVIDIA_MODEL_ID = "meta/llama-3.2-90b-vision-instruct";

/* An eighth the size and a different, far less contended queue. Used for the
   retry after a timeout, and worth promoting to NVIDIA_MODEL outright if the
   90B is not being served — a rougher answer beats none. */
export const NVIDIA_FALLBACK_MODEL_ID = "meta/llama-3.2-11b-vision-instruct";
function fallbackModel() {
  return (process.env.NVIDIA_FALLBACK_MODEL || NVIDIA_FALLBACK_MODEL_ID).trim();
}

/* Netlify stops a synchronous function at 10s. A 90B vision model writing the
   app's full schema often runs past that, and the kill comes back as an HTML
   error the browser can only report as "Analysis failed". So: spend fewer
   output tokens, and abort first ourselves so the failure is a readable JSON
   error instead. Raise NVIDIA_TIMEOUT_MS if your plan allows a longer one. */
export function nvidiaBudgetMs() {
  return Math.max(1000, Number(process.env.NVIDIA_TIMEOUT_MS) || 9300);
}

/* Output tokens are what the budget is spent on, and the app's field names are
   most of the reply. Short keys cut it roughly a quarter; expanded below. */
export const COMPACT_RULES = `

Reply with ONE compact JSON object and nothing else. No markdown, no code fences, no commentary.
Use exactly these keys:
{"ok":true,"nm":"Chicken Caesar Salad","em":"🥗","it":[{"n":"Grilled chicken","q":"120 g","c":198,"p":37,"cb":0,"f":4}],"cal":520,"pr":38,"ca":18,"ft":33,"hs":7,"cf":"high","nt":"Assumed full-fat dressing."}
Rules:
- ok is false only when the photo shows no food or drink; then every number is 0.
- it holds at most 4 items, largest first. Merge everything else into them.
- Every number is a plain integer, grams or kcal. No units, no ranges, no nulls, no maths.
- cal/pr/ca/ft are the totals and must equal the sum of it[].
- hs is 1-10, cf is "low", "medium" or "high", nt is at most 60 characters.`;

/* Half the tokens again: totals plus two items. Used for the automatic retry
   after a timeout, where finishing beats itemising. */
export const BRIEF_RULES = `

Reply with ONE compact JSON object and nothing else. No markdown, no commentary. Be fast and decisive.
{"ok":true,"nm":"Chicken Caesar Salad","em":"🥗","it":[{"n":"Salad with chicken","q":"1 bowl","c":520,"p":38,"cb":18,"f":33}],"cal":520,"pr":38,"ca":18,"ft":33,"hs":7,"cf":"medium","nt":""}
Rules:
- ok is false only when there is no food or drink; then every number is 0.
- it holds at most 2 items. Group the whole meal coarsely; do not itemise.
- Plain integers only, grams or kcal. cal/pr/ca/ft are the totals.
- hs is 1-10, cf is "low", "medium" or "high", nt is "".`;

const NUM = (v) => { const n = typeof v === "number" ? v : parseFloat(v); return Number.isFinite(n) ? n : 0; };

/* Accepts the compact shape, and the long-form one for a model that ignores the
   key instruction, so a verbose reply is still usable rather than an error. */
export function expandAnalysis(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const items = (Array.isArray(o.it) ? o.it : Array.isArray(o.items) ? o.items : []).map((i) => ({
    name: String(i?.n ?? i?.name ?? "Item"),
    quantity: String(i?.q ?? i?.quantity ?? ""),
    calories: NUM(i?.c ?? i?.calories), protein_g: NUM(i?.p ?? i?.protein_g),
    carbs_g: NUM(i?.cb ?? i?.carbs_g), fat_g: NUM(i?.f ?? i?.fat_g),
  }));
  const sum = (k) => items.reduce((t, i) => t + i[k], 0);
  /* A model that itemises well but fumbles the totals is common, so fall back
     to the item sum rather than logging a zero-calorie meal. */
  const total = (short, long, key) => {
    const v = o[short] ?? o[long];
    return v === undefined || v === null || NUM(v) === 0 ? sum(key) : NUM(v);
  };
  const conf = o.cf ?? o.confidence;
  return {
    is_food: o.ok !== undefined ? !!o.ok : !!o.is_food,
    food_name: String(o.nm ?? o.food_name ?? "Unknown food"),
    emoji: String(o.em ?? o.emoji ?? "🍽️"),
    items,
    calories: total("cal", "calories", "calories"),
    protein_g: total("pr", "protein_g", "protein_g"),
    carbs_g: total("ca", "carbs_g", "carbs_g"),
    fat_g: total("ft", "fat_g", "fat_g"),
    health_score: NUM(o.hs ?? o.health_score) || 5,
    confidence: ["low", "medium", "high"].includes(conf) ? conf : "medium",
    notes: String(o.nt ?? o.notes ?? ""),
  };
}

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
  /* One model, fixed. NVIDIA_MODEL stays as an escape hatch, but nothing a
     caller sends can change it. */
  const brief = !!payload.brief;
  /* The retry changes model as well as length: if the big one is queueing,
     asking it for less does not help, but a smaller one is a different queue. */
  const model = brief ? fallbackModel() : (process.env.NVIDIA_MODEL || NVIDIA_MODEL_ID).trim();
  const started = Date.now();
  const diag = (extra) => ({ model, ms: Date.now() - started, brief, ...extra });

  const instruction = instructionFor(payload) + (brief ? BRIEF_RULES : COMPACT_RULES);

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
    /* Room for four itemised foods in the compact shape, and low enough that a
       runaway reply fails fast instead of eating the whole budget. The brief
       retry needs far less, which is the point of it. */
    max_tokens: brief ? 260 : 500,
    temperature: 0.2,
    top_p: 0.7,
  };

  const mode = (process.env.NVIDIA_JSON_MODE || "off").trim().toLowerCase();
  if (mode === "json_object") body.response_format = { type: "json_object" };
  else if (mode === "json_schema") {
    body.response_format = { type: "json_schema", json_schema: { name: "meal_analysis", schema: SCHEMA, strict: true } };
  }

  /* Abort before Netlify does: its own timeout returns HTML the browser can
     only render as a generic failure, whereas this returns a reason. */
  const budgetMs = nvidiaBudgetMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  let res;
  try {
    res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") {
      return fail(`The model didn't answer within ${(budgetMs / 1000).toFixed(1)}s, so the request was cut off. Retry, photograph one dish at a time, or run "Diagnose scanning" in Settings to see whether it is the answer length or NVIDIA queueing your requests.`,
        504, diag({ stage: "timeout" }));
    }
    return fail("Couldn't reach NVIDIA.", 502, diag({ stage: "network", detail: String(e?.message || e).slice(0, 200) }));
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const raw = await res.text();
    let apiMsg = "";
    try {
      const j = JSON.parse(raw);
      apiMsg = j?.detail?.message || (typeof j?.detail === "string" ? j.detail : "") || j?.message || j?.error?.message || "";
    } catch { apiMsg = raw.slice(0, 200); }
    apiMsg = String(apiMsg).trim().slice(0, 200);
    const d = diag({ stage: "http", status: res.status, apiMsg });

    if (res.status === 401) return fail("NVIDIA rejected the key. Regenerate it at build.nvidia.com, then update NVIDIA_API_KEY.", 401, d);
    /* 403 here is far more often an exhausted free allowance than a bad key. */
    if (res.status === 402 || res.status === 403) {
      return fail(`NVIDIA refused the request — usually free credits used up, or this key has no access to ${model}.${apiMsg ? " " + apiMsg : ""}`, 402, d);
    }
    if (res.status === 404) return fail(`NVIDIA has no model "${model}" for this key. Open this function with ?models=1 to see what it can reach.`, 404, d);
    if (res.status === 429) return fail("NVIDIA rate limit reached — wait a minute. Free keys allow only a few requests per minute.", 429, d);
    if (res.status === 413 || res.status === 422) return fail("NVIDIA rejected the photo as too large. Retake it — the app will send a smaller copy.", 413, d);
    if (res.status >= 500) return fail("NVIDIA had a server error. Try again in a moment.", 502, d);
    return fail(apiMsg || `NVIDIA returned HTTP ${res.status}.`, 502, d);
  }

  const data = await res.json();
  const choice = data?.choices?.[0];
  const text = choice?.message?.content;
  if (choice?.finish_reason === "length") {
    return fail("The model ran out of room mid-answer. Try a photo with fewer separate foods.", 502, diag({ stage: "length" }));
  }
  const analysis = expandAnalysis(extractJson(text));
  if (!analysis) {
    return fail("The model replied with something that isn't an analysis. Try again.", 502,
      diag({ stage: "unparsable", reply: String(text ?? "").slice(0, 300) }));
  }
  return json({ analysis, provider: "nvidia", model, brief, ms: Date.now() - started });
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

/* Where do the seconds actually go? One request capped at a single output
   token isolates queue + image prefill from the cost of writing the answer.
   If startup alone eats the budget, shortening the reply cannot save it. */
async function diagnose(key, payload) {
  const budgetMs = nvidiaBudgetMs();
  const primary = (process.env.NVIDIA_MODEL || NVIDIA_MODEL_ID).trim();
  const smaller = fallbackModel();

  /* One token means essentially no decoding, so what this measures is the floor:
     queueing, image encoding and prefill. Both models are probed at once, since
     the useful question is not "is it slow" but "is the smaller one faster". */
  const probe = async (model) => {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budgetMs);
    try {
      const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: payload.imageB64
            ? [{ type: "text", text: "Reply with one word: ok" },
               { type: "image_url", image_url: { url: `data:image/jpeg;base64,${payload.imageB64}` } }]
            : "Reply with one word: ok" }],
          max_tokens: 1, temperature: 0,
        }),
        signal: controller.signal,
      });
      const ms = Date.now() - started;
      if (!res.ok) return { model, ok: false, ms, status: res.status, why: `HTTP ${res.status}` };
      await res.text();
      return { model, ok: true, ms };
    } catch (e) {
      return { model, ok: false, ms: Date.now() - started,
        why: e?.name === "AbortError" ? "no response in time" : String(e?.message || e).slice(0, 80) };
    } finally { clearTimeout(timer); }
  };

  const [a, b] = await Promise.all([probe(primary), probe(smaller)]);
  const secs = (r) => (r.ms / 1000).toFixed(1) + "s";
  const budget = (budgetMs / 1000).toFixed(1) + "s";

  let verdict;
  if (!a.ok && !b.ok) {
    verdict = `Neither model answered a one-token request within ${budget} (${primary}: ${a.why}; ${smaller}: ${b.why}). That is your whole NVIDIA key being queued or an outage, not anything about this app. Try again later, or raise NVIDIA_TIMEOUT_MS if your Netlify plan allows a longer function.`;
  } else if (!a.ok && b.ok) {
    verdict = `${primary} did not answer within ${budget}, but ${smaller} replied in ${secs(b)}. Set NVIDIA_MODEL to ${smaller} in Netlify — it is a smaller model on a much less contended queue. Estimates get a little rougher; scans actually finish.`;
  } else if (a.ok && a.ms / budgetMs > 0.5) {
    verdict = `${primary} took ${secs(a)} of the ${budget} budget before writing anything${b.ok ? `, while ${smaller} took ${secs(b)}` : ""}. That leaves very little room for the answer. ${b.ok && b.ms < a.ms ? `Switching NVIDIA_MODEL to ${smaller} would give you the headroom back.` : "Raise NVIDIA_TIMEOUT_MS if your Netlify plan allows."}`;
  } else {
    verdict = `${primary} started in ${secs(a)}, comfortably inside the ${budget} budget${b.ok ? ` (${smaller}: ${secs(b)})` : ""}. Startup is not the problem — the time goes into writing the answer, so fewer foods per photo should be enough.`;
  }
  return json({ ok: a.ok || b.ok, budgetMs, primary: a, fallback: b, verdict });
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
      model: envName === "nvidia" ? (process.env.NVIDIA_MODEL || NVIDIA_MODEL_ID) : null,
      /* Smaller than Anthropic's limit allows: NVIDIA caps inline images, and a
         smaller photo also shortens the call, which is what the budget is for. */
      imageMaxEdge: envName === "nvidia" ? 512 : 1024,
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

  if (payload?.action === "warm") {
    const wKey = clientKey || envKey;
    if (!wKey || (clientKey ? detectProvider(clientKey) : envName) !== "nvidia") return json({ warmed: false });
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 4000);
    try {
      await fetch(`${NVIDIA_BASE}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${wKey}` },
        body: JSON.stringify({ model: (process.env.NVIDIA_MODEL || NVIDIA_MODEL_ID).trim(),
          messages: [{ role: "user", content: "ok" }], max_tokens: 1, temperature: 0 }),
        signal: ac.signal,
      });
      return json({ warmed: true });
    } catch { return json({ warmed: false }); }
    finally { clearTimeout(t); }
  }

  if (payload?.action === "diagnose") {
    const dKey = clientKey || envKey;
    if (!dKey) return fail("No API key to diagnose with.", 503);
    if ((clientKey ? detectProvider(clientKey) : envName) !== "nvidia") {
      return fail("Timing diagnosis only applies to NVIDIA.", 400);
    }
    return diagnose(dKey, payload);
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
