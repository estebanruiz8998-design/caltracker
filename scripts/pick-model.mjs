#!/usr/bin/env node
/**
 * Checks an NVIDIA key against the one model this app uses.
 *
 *   NVIDIA_API_KEY=nvapi-... node scripts/pick-model.mjs
 *     → says whether the key works and whether it reaches that model
 *
 *   NVIDIA_API_KEY=nvapi-... node scripts/pick-model.mjs path/to/food-photo.jpg
 *     → also runs a real analysis and reports calories, items and latency
 *
 * Options
 *   --all              also try every other model the key lists
 *   --expect <kcal>    known calorie count, to rank by estimate accuracy
 *   --concurrency <n>  parallel requests (default 3; lower if rate limited)
 *
 * It sends exactly what netlify/functions/analyze.mjs sends in production, so
 * a pass here means the deployed app will work. Latency matters as much as the
 * answer: Netlify stops the function at 10s, so watch the ms column.
 */
import fs from "fs";
import { SCHEMA, SYSTEM_PROMPT, COMPACT_RULES, extractJson, expandAnalysis, NVIDIA_BASE, LOOKS_VISUAL, NVIDIA_MODEL_ID }
  from "../netlify/functions/analyze.mjs";

const KEY = process.env.NVIDIA_API_KEY;
if (!KEY) { console.error("Set NVIDIA_API_KEY first."); process.exit(1); }

const args = process.argv.slice(2);
const VALUED = new Set(["--expect", "--concurrency"]);
const opts = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith("--")) { positional.push(a); continue; }
  opts[a] = VALUED.has(a) ? args[++i] : true;
}
const photoPath = positional[0];
if (photoPath && !fs.existsSync(photoPath)) {
  console.error(`No such file: ${photoPath}`);
  process.exit(1);
}
/* No photo → just answer "does this key work, and what can it reach?" */
const CHECK_ONLY = !photoPath;
const TEST_ALL = !!opts["--all"];
const EXPECT = Number(opts["--expect"]) || null;
const CONCURRENCY = Math.max(1, Number(opts["--concurrency"]) || 3);

const bytes = CHECK_ONLY ? null : fs.readFileSync(photoPath);
const imageB64 = bytes ? bytes.toString("base64") : "";
if (bytes && bytes.length > 600_000) {
  console.warn(`⚠  ${photoPath} is ${(bytes.length / 1024 | 0)} KB. Some NVIDIA models cap inline images near 180 KB — a smaller photo gives a fairer test.\n`);
}

/* The app is locked to one model, so that is what gets checked by default.
   --all still sweeps everything the key can reach, for comparison. */
const PREFERRED = [NVIDIA_MODEL_ID];

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
            { type: "text", text: "Analyze the food in this photo." + COMPACT_RULES },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageB64}` } },
          ] },
        ],
        max_tokens: 700, temperature: 0.2, top_p: 0.7,
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
    const parsed = expandAnalysis(extractJson((await res.json())?.choices?.[0]?.message?.content));
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

let available;
try {
  available = await listModels();
} catch (e) {
  console.error(`\n✗ Key rejected: ${e.message}`);
  console.error("  A 401 means the key is invalid or revoked; regenerate it at build.nvidia.com.");
  process.exit(1);
}
console.log(`\n✓ Key works — NVIDIA accepted it and lists ${available.length} models.`);

const reachesDefault = available.includes(NVIDIA_MODEL_ID);

/* Answer the reachability question before anything can bail out — a key that
   cannot reach the app's model is exactly the case worth explaining. */
if (CHECK_ONLY) {
  console.log(`\n${reachesDefault ? "✓" : "✗"} ${NVIDIA_MODEL_ID} — the model this app uses — is ${reachesDefault ? "reachable with this key" : "NOT in this key's list"}.`);
  if (!reachesDefault) {
    const others = available.filter((m) => LOOKS_VISUAL.test(m)).sort();
    console.log(others.length ? `\nVision models this key does list:\n  ${others.join("\n  ")}` : "\nNo vision models listed either.");
    console.log(`\nSet NVIDIA_MODEL in Netlify to one of those, or use a key that reaches the default.`);
  } else {
    console.log(`\nTo check it actually analyses a meal, rerun with a photo:`);
    console.log(`  node scripts/pick-model.mjs meal.jpg --expect 520`);
  }
  process.exit(0);
}

const candidates = TEST_ALL ? available : available.filter((m) => PREFERRED.includes(m));
if (!candidates.length) {
  console.error(`\n✗ This key does not list ${NVIDIA_MODEL_ID}.`);
  console.error("  Re-run with --all to try everything it does list, and set NVIDIA_MODEL to whatever passes.");
  process.exit(1);
}
candidates.sort((a, b) => {
  const ia = PREFERRED.indexOf(a), ib = PREFERRED.indexOf(b);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
});
console.log(`Testing ${candidates.length} model(s) on ${photoPath}…\n`);

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
