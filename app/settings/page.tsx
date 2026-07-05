"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import type { Goals } from "@/lib/types";

const GOAL_FIELDS = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein_g", label: "Protein", unit: "g" },
  { key: "carbs_g", label: "Carbs", unit: "g" },
  { key: "fat_g", label: "Fat", unit: "g" },
] as const;

export default function SettingsPage() {
  const { goals, profile, setGoals, resetProfile, clearAll } = useStore();
  const [draft, setDraft] = useState<Record<keyof Goals, string>>({
    calories: String(goals.calories),
    protein_g: String(goals.protein_g),
    carbs_g: String(goals.carbs_g),
    fat_g: String(goals.fat_g),
  });
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setDraft({
      calories: String(goals.calories),
      protein_g: String(goals.protein_g),
      carbs_g: String(goals.carbs_g),
      fat_g: String(goals.fat_g),
    });
  }, [goals]);

  function save() {
    const next: Goals = {
      calories: Math.max(0, Math.round(Number(draft.calories) || 0)),
      protein_g: Math.max(0, Math.round(Number(draft.protein_g) || 0)),
      carbs_g: Math.max(0, Math.round(Number(draft.carbs_g) || 0)),
      fat_g: Math.max(0, Math.round(Number(draft.fat_g) || 0)),
    };
    setGoals(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-extrabold tracking-tight">Settings</h1>
      </header>

      <section className="card p-5" aria-label="Daily goals">
        <h2 className="text-sm font-bold">Daily goals</h2>
        <div className="mt-4 space-y-3">
          {GOAL_FIELDS.map(({ key, label, unit }) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <label htmlFor={`goal-${key}`} className="text-sm text-ink-2">
                {label}
              </label>
              <div className="relative w-32">
                <input
                  id={`goal-${key}`}
                  type="number"
                  inputMode="numeric"
                  value={draft[key]}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [key]: e.target.value }))
                  }
                  className="w-full rounded-xl border border-black/10 bg-page py-2.5 pl-3 pr-11 text-right text-sm font-semibold outline-none focus:border-black/30"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">
                  {unit}
                </span>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={save}
          className="mt-4 w-full rounded-full bg-ink py-3 text-sm font-semibold text-white"
        >
          {saved ? "Saved ✓" : "Save goals"}
        </button>
      </section>

      {profile && (
        <section className="card p-5" aria-label="Your details">
          <h2 className="text-sm font-bold">Your details</h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label="Sex" value={profile.sex} />
            <Row label="Age" value={`${profile.age}`} />
            <Row label="Height" value={`${profile.heightCm} cm`} />
            <Row label="Weight" value={`${profile.weightKg} kg`} />
            <Row label="Goal" value={profile.goal} />
          </dl>
          <button
            type="button"
            onClick={resetProfile}
            className="hairline mt-4 w-full rounded-full bg-card py-3 text-sm font-semibold"
          >
            Redo onboarding
          </button>
          <p className="mt-2 text-center text-[11px] text-muted">
            Recalculates your goals. Your logged meals are kept.
          </p>
        </section>
      )}

      <section className="card p-5" aria-label="About">
        <h2 className="text-sm font-bold">About</h2>
        <p className="mt-2 text-xs leading-relaxed text-ink-2">
          CalTracker analyzes food photos with Claude&apos;s vision AI to
          estimate calories and macros. Estimates are approximations — not
          medical or dietary advice. Your data stays on this device.
        </p>
      </section>

      <section className="card p-5" aria-label="Danger zone">
        {!confirmClear ? (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="w-full text-sm font-semibold text-danger"
          >
            Delete all data
          </button>
        ) : (
          <div>
            <p className="text-center text-sm font-medium text-ink-2">
              Delete your profile and all logged meals?
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="hairline flex-1 rounded-full bg-card py-3 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  clearAll();
                  setConfirmClear(false);
                }}
                className="flex-1 rounded-full bg-danger py-3 text-sm font-semibold text-white"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-2">{label}</dt>
      <dd className="font-semibold capitalize">{value}</dd>
    </div>
  );
}
