#!/usr/bin/env node
/**
 * Picks the NVIDIA_MODEL for this project by testing candidates on the real
 * task with your own key, rather than trusting a catalog listing.
 *
 *   NVIDIA_API_KEY=nvapi-... node scripts/pick-model.mjs path/to/food-photo.jpg
 *
 * Options
 *   --all              test every model your key lists, not just likely VLMs
 *   --expect <kcal>    known calorie count, to rank by estimate accuracy too
 *   --concurrency <n>  parallel requests (default 3; lower if rate limited)
 *
 * It sends exactly what netlify/functions/analyze.mjs sends in production, so
 * a model that passes here is a model the app will work with.
 */
import fs from "fs";
import { SCHEMA, SYSTEM_PROMPT, JSON_RULES, extractJson, NVIDIA_BASE } from "../netlify/functions/analyze.mjs";

const KEY = process.env.NVIDIA_API_KEY;
if (!KEY) { console.error("Set NVIDIA_API_KEY first."); process.exit(1); }

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
const photoPath = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1]?.startsWith("--") !== true);
if (!photoPath || !fs.existsSync(photoPath)) {
  console.error("Pass a food photo: node scripts/pick-model.mjs meal.jpg");
  process.exit(1);
}
const TEST_ALL = args.includes("--all");
const EXPECT = Number(flag("--expect", "")) || null;
const CONCURRENCY = Math.max(1, Number(flag("--concurrency", "3")) || 3);

const bytes = fs.readFileSync(photoPath);
const imageB64 = bytes.toString("base64");
if (bytes.length > 600_000) {
  console.warn(`⚠  ${photoPath} is ${(bytes.length / 1024 | 0)} KB. Some NVIDIA models cap inline images near 180 KB — a smaller photo gives a fairer test.\n`);
}

/* Ordered by expected fit for photo calorie estimation: fine-grained visual
   detail for portion sizing, plus tight instruction-following for the schema.
   Ordering only breaks ties — the measured result decides. */
const PREFERRED = [
  "meta/llama-4-maverick-17b-128e-instruct",
  "qwen/qwen2.5-vl-72b-instruct",
  "meta/llama-3.2-90b-vision-instruct",
  "meta/llama-4-scout-17b-16e-instruct",
  "google/gemma-3-27b-it",
  "mistralai/mistral-medium-3-instruct",
  "meta/llama-3.2-11b-vision-instruct",
  "microsoft/phi-3.5-vision-instruct",
];
const LOOKS_VISUAL = /(^|[-\/])(vl|vlm|vision|multimodal)([-\/]|$)|llama-4|gemma-3|maverick|scout|phi-3\.5-vision|mistral-medium/i;

async function listModels() {
  const res = await fetch(`${NVIDIA_BASE}/models`, { headers: { authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`Could not list models (HTTP ${res.status}). ${(await res.text()).slice(0, 200)}`);
  return ((await res.json())?.data || []).map((m) => m.id).filter(Boolean);
}

const REQUIRED = SCHEMA.required;
function grade(obj) {
  const problems = [];
  for (const k of REQUIRED) if (!(k in obj)) problems.push(`missing ${k}`);
  if (typeof obj.calories !== "number") problems.push("calories not a number");
  if (!Array.isArray(obj.items)) problems.push("items not an array");
  else if (obj.items.length === 0) problems.push("no items broken out");
  else {
    const bad = obj.items.find((it) => typeof it?.calories !== "number" || !it?.name);
    if (bad) problems.push("malformed item entry");
  }
  if (typeof obj.calories === "number" && (obj.calories <= 0 || obj.calories > 5000)) problems.push("implausible calories");
  return problems;
}

async function probe(model) {
  const started = Date.now();
  try {
    const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: [
            { type: "text", text: "Analyze the food in this photo." + JSON_RULES },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageB64}` } },
          ] },
        ],
        max_tokens: 2048, temperature: 0.2, top_p: 0.7,
      }),
    });
    const ms = Date.now() - started;
    if (!res.ok) {
      const body = (await res.text()).slice(0, 120).replace(/\s+/g, " ");
      const why = res.status === 404 ? "not available to this key"
        : res.status === 400 ? "rejected the request (likely no image support)"
        : res.status === 429 ? "rate limited — rerun with --concurrency 1"
        : body || `HTTP ${res.status}`;
      return { model, ms, ok: false, why };
    }
    const parsed = extractJson((await res.json())?.choices?.[0]?.message?.content);
    if (!parsed) return { model, ms, ok: false, why: "did not return usable JSON" };
    const problems = grade(parsed);
    return { model, ms, ok: problems.length === 0, why: problems.join(", "), calories: parsed.calories,
      items: Array.isArray(parsed.items) ? parsed.items.length : 0, name: parsed.food_name };
  } catch (e) {
    return { model, ms: Date.now() - started, ok: false, why: String(e.message || e).slice(0, 100) };
  }
}

async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

const available = await listModels();
console.log(`Your key lists ${available.length} models.`);

const candidates = TEST_ALL ? available : available.filter((m) => PREFERRED.includes(m) || LOOKS_VISUAL.test(m));
if (!candidates.length) {
  console.error("\nNo vision-capable models matched. Re-run with --all to test everything your key lists.");
  process.exit(1);
}
candidates.sort((a, b) => {
  const ia = PREFERRED.indexOf(a), ib = PREFERRED.indexOf(b);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
});
console.log(`Testing ${candidates.length} vision candidate(s) on ${photoPath}…\n`);

const results = await pool(candidates, CONCURRENCY, async (m) => {
  const r = await probe(m);
  console.log(`  ${r.ok ? "✓" : "✗"} ${m}  ${r.ok ? `${r.calories} kcal · ${r.items} items · ${r.ms} ms` : r.why}`);
  return r;
});

const winners = results.filter((r) => r.ok).sort((a, b) => {
  if (EXPECT) {
    const d = Math.abs(a.calories - EXPECT) - Math.abs(b.calories - EXPECT);
    if (d) return d;
  }
  if (b.items !== a.items) return b.items - a.items;
  return a.ms - b.ms;
});

console.log("\n" + "─".repeat(72));
if (!winners.length) {
  console.log("No candidate returned a schema-valid analysis.");
  console.log("Try --all, or set NVIDIA_JSON_MODE=json_object if a model supports it.");
  process.exit(1);
}
console.log(`Best fit: ${winners[0].model}`);
console.log(`  "${winners[0].name}" · ${winners[0].calories} kcal · ${winners[0].items} items · ${winners[0].ms} ms`
  + (EXPECT ? ` · ${Math.abs(winners[0].calories - EXPECT)} kcal off ${EXPECT}` : ""));
if (winners.length > 1) console.log(`  Runners-up: ${winners.slice(1, 4).map((w) => w.model).join(", ")}`);
console.log(`\nSet this in Netlify → Site configuration → Environment variables:\n  NVIDIA_MODEL=${winners[0].model}`);
