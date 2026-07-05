import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { FoodAnalysis } from "@/lib/types";

export const maxDuration = 120;

const MODEL = "claude-opus-4-8";

const SUPPORTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
type MediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

interface AnalyzeRequest {
  /** Base64 image data (no data: prefix) */
  image?: { data: string; media_type: MediaType };
  /** Text-only mode: describe the meal instead of a photo */
  description?: string;
  /** "Fix Results": user's correction to a previous analysis */
  correction?: string;
  /** The previous analysis being corrected */
  previous?: FoodAnalysis;
}

const HEALTH_SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_food",
    "food_name",
    "emoji",
    "items",
    "calories",
    "protein_g",
    "carbs_g",
    "fat_g",
    "health_score",
    "confidence",
    "notes",
  ],
  properties: {
    is_food: {
      type: "boolean",
      description: "false if the image contains no food or drink",
    },
    food_name: {
      type: "string",
      description: "Short display name for the meal, e.g. 'Chicken Caesar Salad'",
    },
    emoji: {
      type: "string",
      description: "Single emoji that best represents the meal",
    },
    items: {
      type: "array",
      description: "Each distinct food item visible, with estimated portion",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "quantity", "calories", "protein_g", "carbs_g", "fat_g"],
        properties: {
          name: { type: "string" },
          quantity: {
            type: "string",
            description: "Human-readable portion, e.g. '1 cup', '150 g', '2 slices'",
          },
          calories: { type: "number" },
          protein_g: { type: "number" },
          carbs_g: { type: "number" },
          fat_g: { type: "number" },
        },
      },
    },
    calories: { type: "number", description: "Total kcal for the whole meal" },
    protein_g: { type: "number", description: "Total protein in grams" },
    carbs_g: { type: "number", description: "Total carbohydrates in grams" },
    fat_g: { type: "number", description: "Total fat in grams" },
    health_score: {
      type: "integer",
      enum: HEALTH_SCORES,
      description: "1 (very unhealthy) to 10 (very healthy)",
    },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    notes: {
      type: "string",
      description:
        "One short sentence about the estimate (assumptions, hidden ingredients, etc.)",
    },
  },
} as const;

const SYSTEM_PROMPT = `You are the nutrition analysis engine of a photo calorie-tracking app.
Given a photo (and/or description) of food, identify the meal and estimate its
nutrition as accurately as possible.

Guidelines:
- Estimate portion sizes from visual cues (plate size, utensils, packaging).
- Account for likely cooking oils, dressings, and sauces even when not obvious.
- Break the meal into its distinct components in "items"; totals must equal the
  sum of the items (rounding aside).
- Use realistic, USDA-style nutrition values. When unsure, give your best
  single estimate and lower the confidence rather than refusing.
- health_score: 10 = whole, nutrient-dense food; 1 = heavily processed,
  high sugar/fat with little nutritional value.
- If the image contains no food or drink at all, set is_food to false, use
  zeros for nutrition, and explain briefly in notes.`;

function clamp(n: unknown, min: number, max: number): number {
  const x = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.min(max, Math.max(min, Math.round(x * 10) / 10));
}

function sanitize(raw: FoodAnalysis): FoodAnalysis {
  const items = (Array.isArray(raw.items) ? raw.items : []).map((it) => ({
    name: String(it.name ?? "Item"),
    quantity: String(it.quantity ?? ""),
    calories: clamp(it.calories, 0, 10000),
    protein_g: clamp(it.protein_g, 0, 1000),
    carbs_g: clamp(it.carbs_g, 0, 1000),
    fat_g: clamp(it.fat_g, 0, 1000),
  }));
  return {
    is_food: Boolean(raw.is_food),
    food_name: String(raw.food_name ?? "Unknown food").slice(0, 80),
    emoji: String(raw.emoji ?? "🍽️").slice(0, 8),
    items,
    calories: clamp(raw.calories, 0, 20000),
    protein_g: clamp(raw.protein_g, 0, 2000),
    carbs_g: clamp(raw.carbs_g, 0, 2000),
    fat_g: clamp(raw.fat_g, 0, 2000),
    health_score: HEALTH_SCORES.includes(raw.health_score)
      ? raw.health_score
      : 5,
    confidence: ["low", "medium", "high"].includes(raw.confidence)
      ? raw.confidence
      : "medium",
    notes: String(raw.notes ?? "").slice(0, 400),
  };
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return NextResponse.json(
      { error: "Server is not configured: set ANTHROPIC_API_KEY." },
      { status: 500 },
    );
  }

  let body: AnalyzeRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { image, description, correction, previous } = body;

  if (!image && !description?.trim()) {
    return NextResponse.json(
      { error: "Provide an image or a description." },
      { status: 400 },
    );
  }
  if (image) {
    if (!SUPPORTED_MEDIA_TYPES.includes(image.media_type)) {
      return NextResponse.json(
        { error: `Unsupported image type: ${image.media_type}` },
        { status: 400 },
      );
    }
    // ~7.5 MB of base64 ≈ 5.6 MB image — well within API limits, guards abuse.
    if (typeof image.data !== "string" || image.data.length > 7_500_000) {
      return NextResponse.json(
        { error: "Image too large. Please retake or pick a smaller photo." },
        { status: 400 },
      );
    }
  }

  const content: Anthropic.ContentBlockParam[] = [];
  if (image) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: image.media_type,
        data: image.data,
      },
    });
  }

  let instruction: string;
  if (correction?.trim() && previous) {
    instruction = `Here is your previous analysis of this meal:
${JSON.stringify(previous)}

The user says the analysis needs fixing: "${correction.trim().slice(0, 500)}"

Re-analyze the meal applying the user's correction. Keep everything that was
right; only change what the correction implies.`;
  } else if (description?.trim() && !image) {
    instruction = `Analyze this meal from the user's description (no photo):
"${description.trim().slice(0, 1000)}"`;
  } else {
    instruction = "Analyze the food in this photo.";
    if (description?.trim()) {
      instruction += ` The user added: "${description.trim().slice(0, 500)}"`;
    }
  }
  content.push({ type: "text", text: instruction });

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      output_config: {
        format: {
          type: "json_schema",
          schema: ANALYSIS_SCHEMA,
        },
      },
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "The analysis was declined. Try a different photo." },
        { status: 422 },
      );
    }
    if (response.stop_reason === "max_tokens") {
      return NextResponse.json(
        { error: "Analysis ran too long. Please try again." },
        { status: 502 },
      );
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "No analysis returned. Please try again." },
        { status: 502 },
      );
    }

    const analysis = sanitize(JSON.parse(textBlock.text) as FoodAnalysis);
    return NextResponse.json({ analysis });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: "Invalid ANTHROPIC_API_KEY on the server." },
        { status: 500 },
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "Rate limited. Please wait a moment and try again." },
        { status: 429 },
      );
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return NextResponse.json(
        { error: "Could not reach the analysis service. Check your connection." },
        { status: 502 },
      );
    }
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: "Analysis service error. Please try again." },
        { status: 502 },
      );
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Received a malformed analysis. Please try again." },
        { status: 502 },
      );
    }
    throw error;
  }
}
