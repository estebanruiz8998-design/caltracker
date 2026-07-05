"use client";

import { useRef, useState } from "react";
import type { FoodAnalysis, FoodLog } from "@/lib/types";
import { resizeImage } from "@/lib/image";
import { useStore } from "@/lib/store";
import { dateKey } from "@/lib/dates";
import ResultCard from "./ResultCard";

type Stage = "input" | "analyzing" | "result" | "error";

async function callAnalyze(payload: {
  image?: { data: string; media_type: "image/jpeg" };
  description?: string;
  correction?: string;
  previous?: FoodAnalysis;
}): Promise<FoodAnalysis> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.error ?? "Analysis failed. Please try again.");
  }
  return json.analysis as FoodAnalysis;
}

export default function ScanSheet({ onClose }: { onClose: () => void }) {
  const { addLog } = useStore();
  const [stage, setStage] = useState<Stage>("input");
  const [error, setError] = useState("");
  const [describeMode, setDescribeMode] = useState(false);
  const [description, setDescription] = useState("");
  const [analysis, setAnalysis] = useState<FoodAnalysis | null>(null);
  const [fixing, setFixing] = useState(false);

  // Image state: full-res base64 for the API, small thumb for storage/preview.
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  async function analyze(payload: Parameters<typeof callAnalyze>[0]) {
    setStage("analyzing");
    setError("");
    try {
      const result = await callAnalyze(payload);
      setAnalysis(result);
      setStage("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStage("error");
    }
  }

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    setStage("analyzing");
    setError("");
    try {
      const [full, small] = await Promise.all([
        resizeImage(file, 1024, 0.82),
        resizeImage(file, 240, 0.7),
      ]);
      setImageBase64(full.base64);
      setThumb(small.dataUrl);
      await analyze({ image: { data: full.base64, media_type: "image/jpeg" } });
    } catch {
      setError("Couldn't read that image. Try a different photo.");
      setStage("error");
    }
  }

  async function handleDescribe() {
    if (!description.trim()) return;
    setImageBase64(null);
    setThumb(null);
    await analyze({ description: description.trim() });
  }

  async function handleFix(correction: string) {
    if (!analysis) return;
    setFixing(true);
    try {
      const result = await callAnalyze({
        ...(imageBase64
          ? { image: { data: imageBase64, media_type: "image/jpeg" as const } }
          : { description: description.trim() || analysis.food_name }),
        correction,
        previous: analysis,
      });
      setAnalysis(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fix failed. Please try again.");
    } finally {
      setFixing(false);
    }
  }

  function handleLog() {
    if (!analysis) return;
    const now = new Date();
    const log: FoodLog = {
      id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      date: dateKey(now),
      loggedAt: now.getTime(),
      name: analysis.food_name,
      emoji: analysis.emoji,
      calories: analysis.calories,
      protein_g: analysis.protein_g,
      carbs_g: analysis.carbs_g,
      fat_g: analysis.fat_g,
      health_score: analysis.health_score,
      items: analysis.items,
      photo: thumb ?? undefined,
    };
    addLog(log);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan food"
      className="fixed inset-0 z-50 mx-auto flex max-w-md flex-col bg-page"
    >
      <div className="sheet-enter flex min-h-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 className="text-lg font-bold">
            {stage === "result" ? "Results" : "Scan food"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-card hairline"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
          {stage === "input" && (
            <div className="flex h-full flex-col justify-center gap-3 pt-4">
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  handleFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  handleFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />

              {!describeMode ? (
                <>
                  <button
                    type="button"
                    onClick={() => cameraRef.current?.click()}
                    className="card flex flex-col items-center gap-3 p-8 transition-transform active:scale-[0.98]"
                  >
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ink text-white">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.2-1.8A1.5 1.5 0 0 1 10.55 3.5h2.9a1.5 1.5 0 0 1 1.25.7L15.9 6h1.6A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        />
                        <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" strokeWidth="1.8" />
                      </svg>
                    </span>
                    <span className="text-base font-bold">Take a photo</span>
                    <span className="-mt-2 text-xs text-muted">
                      Snap your meal and AI does the rest
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => galleryRef.current?.click()}
                    className="card flex items-center justify-center gap-2 p-4 font-semibold transition-transform active:scale-[0.98]"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <rect x="4" y="5" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
                      <circle cx="9" cy="10" r="1.6" fill="currentColor" />
                      <path d="M5 17l4.5-4.5 3 3L16 12l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                    </svg>
                    Choose from gallery
                  </button>

                  <button
                    type="button"
                    onClick={() => setDescribeMode(true)}
                    className="card flex items-center justify-center gap-2 p-4 font-semibold transition-transform active:scale-[0.98]"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M5 6.5h14M5 12h14M5 17.5h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    Describe your food
                  </button>
                </>
              ) : (
                <div className="card p-5">
                  <label htmlFor="describe" className="text-sm font-bold">
                    Describe your meal
                  </label>
                  <textarea
                    id="describe"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Grilled chicken burrito with rice, black beans and guacamole"
                    rows={4}
                    className="mt-3 w-full resize-none rounded-2xl border border-black/10 bg-page p-3 text-sm outline-none focus:border-black/30"
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDescribeMode(false)}
                      className="hairline flex-1 rounded-full py-3 text-sm font-semibold"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleDescribe}
                      disabled={!description.trim()}
                      className="flex-1 rounded-full bg-ink py-3 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      Analyze
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {stage === "analyzing" && (
            <div className="flex h-full flex-col items-center justify-center gap-5 pt-4">
              {thumb ? (
                <div className="relative">
                  <img
                    src={thumb}
                    alt="Your meal"
                    className="h-56 w-56 rounded-3xl object-cover"
                  />
                  <div className="shimmer absolute inset-0 rounded-3xl" />
                </div>
              ) : (
                <div className="shimmer h-56 w-56 rounded-3xl" />
              )}
              <div className="text-center">
                <p className="text-base font-bold">Analyzing your food…</p>
                <p className="mt-1 text-xs text-muted">
                  Estimating calories, protein, carbs and fat
                </p>
              </div>
            </div>
          )}

          {stage === "result" && analysis && (
            <ResultCard
              analysis={analysis}
              photo={thumb}
              fixing={fixing}
              fixError={error}
              onFix={handleFix}
              onLog={handleLog}
              onRetake={() => {
                setAnalysis(null);
                setImageBase64(null);
                setThumb(null);
                setError("");
                setStage("input");
              }}
            />
          )}

          {stage === "error" && (
            <div className="flex h-full flex-col items-center justify-center gap-4 pt-4 text-center">
              <span className="text-4xl" aria-hidden>
                😕
              </span>
              <p className="max-w-xs text-sm font-medium text-ink-2">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setStage("input");
                }}
                className="rounded-full bg-ink px-8 py-3 text-sm font-semibold text-white"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
