"use client";

import { useState } from "react";
import type { FoodAnalysis } from "@/lib/types";

const MACROS = [
  { key: "protein_g", label: "Protein", color: "#e34948" },
  { key: "carbs_g", label: "Carbs", color: "#eda100" },
  { key: "fat_g", label: "Fat", color: "#2a78d6" },
] as const;

function healthColor(score: number): string {
  if (score >= 7) return "#0ca30c";
  if (score >= 4) return "#fab219";
  return "#d03b3b";
}

export default function ResultCard({
  analysis,
  photo,
  fixing,
  fixError,
  onFix,
  onLog,
  onRetake,
}: {
  analysis: FoodAnalysis;
  photo: string | null;
  fixing: boolean;
  fixError: string;
  onFix: (correction: string) => Promise<boolean>;
  onLog: () => void;
  onRetake: () => void;
}) {
  const [correction, setCorrection] = useState("");
  const [showFix, setShowFix] = useState(false);

  if (!analysis.is_food) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 pt-4 text-center">
        <span className="text-4xl" aria-hidden>
          🤔
        </span>
        <p className="text-base font-bold">That doesn&apos;t look like food</p>
        <p className="max-w-xs text-sm text-ink-2">
          {analysis.notes || "Try a clearer photo of your meal."}
        </p>
        <button
          type="button"
          onClick={onRetake}
          className="rounded-full bg-ink px-8 py-3 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  async function submitFix() {
    const text = correction.trim();
    if (!text || fixing) return;
    // Keep the text if the request fails so the user can retry or edit it.
    if (await onFix(text)) setCorrection("");
  }

  return (
    <div className="pop-enter space-y-4 pt-1">
      {/* Photo + identity */}
      <div className="card overflow-hidden">
        {photo && (
          <img src={photo} alt="Your meal" className="h-44 w-full object-cover" />
        )}
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold leading-tight">
                {analysis.emoji} {analysis.food_name}
              </p>
              <p className="mt-1 text-xs capitalize text-muted">
                {analysis.confidence} confidence
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-extrabold tracking-tight">
                {Math.round(analysis.calories)}
              </p>
              <p className="-mt-0.5 text-xs text-muted">kcal</p>
            </div>
          </div>

          {/* Macros */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            {MACROS.map(({ key, label, color }) => (
              <div key={key} className="rounded-2xl bg-page px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: color }}
                    aria-hidden
                  />
                  <span className="text-[11px] text-ink-2">{label}</span>
                </div>
                <p className="mt-1 text-sm font-bold">
                  {Math.round(analysis[key])}g
                </p>
              </div>
            ))}
          </div>

          {/* Health score meter */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-2">Health score</span>
              <span className="font-bold">{analysis.health_score}/10</span>
            </div>
            <div
              className="mt-1.5 h-2 rounded-full"
              style={{
                background: `color-mix(in srgb, ${healthColor(analysis.health_score)} 15%, white)`,
              }}
              role="meter"
              aria-valuenow={analysis.health_score}
              aria-valuemin={1}
              aria-valuemax={10}
              aria-label="Health score"
            >
              <div
                className="h-2 rounded-full"
                style={{
                  width: `${analysis.health_score * 10}%`,
                  background: healthColor(analysis.health_score),
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Items breakdown */}
      {analysis.items.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-bold">In this meal</h3>
          <ul className="mt-3 space-y-2">
            {analysis.items.map((item, i) => (
              <li key={i} className="flex justify-between gap-2 text-sm">
                <span className="truncate text-ink-2">
                  {item.name}
                  {item.quantity ? (
                    <span className="text-muted"> · {item.quantity}</span>
                  ) : null}
                </span>
                <span className="shrink-0 font-semibold">
                  {Math.round(item.calories)} kcal
                </span>
              </li>
            ))}
          </ul>
          {analysis.notes && (
            <p className="mt-3 border-t border-black/[0.06] pt-3 text-xs text-muted">
              {analysis.notes}
            </p>
          )}
        </div>
      )}

      {/* Fix results */}
      <div className="card p-5">
        {!showFix ? (
          <button
            type="button"
            onClick={() => setShowFix(true)}
            className="flex w-full items-center justify-between text-sm font-semibold"
          >
            <span>✨ Fix results</span>
            <span className="text-muted" aria-hidden>
              ›
            </span>
          </button>
        ) : (
          <div>
            <label htmlFor="fix" className="text-sm font-bold">
              What should change?
            </label>
            <input
              id="fix"
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFix()}
              placeholder="e.g. It was a double portion / no dressing"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-page p-3 text-base outline-none focus:border-black/30"
              disabled={fixing}
            />
            {fixError && (
              <p className="mt-2 text-xs font-medium text-danger">{fixError}</p>
            )}
            <button
              type="button"
              onClick={submitFix}
              disabled={!correction.trim() || fixing}
              className="mt-3 w-full rounded-full bg-ink py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {fixing ? "Updating…" : "Update analysis"}
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pb-2">
        <button
          type="button"
          onClick={onRetake}
          className="hairline flex-1 rounded-full bg-card py-3.5 text-sm font-semibold"
        >
          Retake
        </button>
        <button
          type="button"
          onClick={onLog}
          disabled={fixing}
          className="flex-[2] rounded-full bg-ink py-3.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          Log meal
        </button>
      </div>
    </div>
  );
}
