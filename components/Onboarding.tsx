"use client";

import { useMemo, useState } from "react";
import type { Activity, GoalType, Profile, Sex } from "@/lib/types";
import { computeGoals } from "@/lib/goals";
import { useStore } from "@/lib/store";

const ACTIVITIES: { value: Activity; label: string; hint: string }[] = [
  { value: "sedentary", label: "Sedentary", hint: "Little or no exercise" },
  { value: "light", label: "Lightly active", hint: "Exercise 1–3 days/week" },
  { value: "moderate", label: "Moderately active", hint: "Exercise 3–5 days/week" },
  { value: "active", label: "Very active", hint: "Exercise 6–7 days/week" },
  { value: "very_active", label: "Athlete", hint: "Hard training twice a day" },
];

const GOAL_OPTIONS: { value: GoalType; label: string; emoji: string }[] = [
  { value: "lose", label: "Lose weight", emoji: "📉" },
  { value: "maintain", label: "Maintain", emoji: "⚖️" },
  { value: "gain", label: "Gain weight", emoji: "📈" },
];

type Units = "metric" | "imperial";

export default function Onboarding() {
  const { completeOnboarding } = useStore();
  const [step, setStep] = useState(0);

  const [sex, setSex] = useState<Sex>("male");
  const [age, setAge] = useState("25");
  const [units, setUnits] = useState<Units>("metric");
  const [heightCm, setHeightCm] = useState("175");
  const [heightFt, setHeightFt] = useState("5");
  const [heightIn, setHeightIn] = useState("9");
  const [weightKg, setWeightKg] = useState("70");
  const [weightLb, setWeightLb] = useState("155");
  const [activity, setActivity] = useState<Activity>("light");
  const [goal, setGoal] = useState<GoalType>("maintain");

  const profile = useMemo<Profile | null>(() => {
    const ageNum = Number(age);
    const cm =
      units === "metric"
        ? Number(heightCm)
        : Number(heightFt) * 30.48 + Number(heightIn) * 2.54;
    const kg = units === "metric" ? Number(weightKg) : Number(weightLb) * 0.453592;
    if (
      !Number.isFinite(ageNum) || ageNum < 10 || ageNum > 100 ||
      !Number.isFinite(cm) || cm < 90 || cm > 250 ||
      !Number.isFinite(kg) || kg < 25 || kg > 350
    ) {
      return null;
    }
    return {
      sex,
      age: Math.round(ageNum),
      heightCm: Math.round(cm),
      weightKg: Math.round(kg * 10) / 10,
      activity,
      goal,
    };
  }, [sex, age, units, heightCm, heightFt, heightIn, weightKg, weightLb, activity, goal]);

  const goals = profile ? computeGoals(profile) : null;

  const inputClass =
    "w-full rounded-2xl border border-black/10 bg-card p-3.5 text-base font-semibold outline-none focus:border-black/40";

  return (
    <div className="flex min-h-dvh flex-col px-6 pb-8 pt-10">
      {/* Progress dots */}
      <div className="mb-8 flex justify-center gap-1.5" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === step ? "w-6 bg-ink" : "w-1.5 bg-black/15"
            }`}
          />
        ))}
      </div>

      {step === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span className="text-6xl" aria-hidden>
            🍎
          </span>
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight">
            CalTracker
          </h1>
          <p className="mt-3 max-w-xs text-base text-ink-2">
            Calorie tracking made easy. Just snap a photo of your food — AI does
            the rest.
          </p>
        </div>
      )}

      {step === 1 && (
        <div className="flex-1">
          <h2 className="text-2xl font-extrabold tracking-tight">About you</h2>
          <p className="mt-1 text-sm text-ink-2">
            Used to calculate your daily calorie goal.
          </p>

          <div className="mt-6 space-y-5">
            <div>
              <p className="mb-2 text-sm font-semibold">Sex</p>
              <div className="grid grid-cols-2 gap-2">
                {(["male", "female"] as Sex[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSex(s)}
                    className={`rounded-2xl border p-3.5 text-sm font-semibold capitalize ${
                      sex === s
                        ? "border-ink bg-ink text-white"
                        : "border-black/10 bg-card"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="age" className="mb-2 block text-sm font-semibold">
                Age
              </label>
              <input
                id="age"
                type="number"
                inputMode="numeric"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">Height & weight</p>
                <div className="flex rounded-full bg-black/[0.06] p-0.5 text-xs font-semibold">
                  {(["metric", "imperial"] as Units[]).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUnits(u)}
                      className={`rounded-full px-3 py-1 capitalize ${
                        units === u ? "bg-card shadow-sm" : "text-muted"
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              {units === "metric" ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <input
                      aria-label="Height in centimeters"
                      type="number"
                      inputMode="numeric"
                      value={heightCm}
                      onChange={(e) => setHeightCm(e.target.value)}
                      className={inputClass}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted">
                      cm
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      aria-label="Weight in kilograms"
                      type="number"
                      inputMode="decimal"
                      value={weightKg}
                      onChange={(e) => setWeightKg(e.target.value)}
                      className={inputClass}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted">
                      kg
                    </span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <div className="relative">
                    <input
                      aria-label="Height feet"
                      type="number"
                      inputMode="numeric"
                      value={heightFt}
                      onChange={(e) => setHeightFt(e.target.value)}
                      className={inputClass}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">
                      ft
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      aria-label="Height inches"
                      type="number"
                      inputMode="numeric"
                      value={heightIn}
                      onChange={(e) => setHeightIn(e.target.value)}
                      className={inputClass}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">
                      in
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      aria-label="Weight in pounds"
                      type="number"
                      inputMode="decimal"
                      value={weightLb}
                      onChange={(e) => setWeightLb(e.target.value)}
                      className={inputClass}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">
                      lb
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex-1">
          <h2 className="text-2xl font-extrabold tracking-tight">
            How active are you?
          </h2>
          <div className="mt-6 space-y-2">
            {ACTIVITIES.map(({ value, label, hint }) => (
              <button
                key={value}
                type="button"
                onClick={() => setActivity(value)}
                className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left ${
                  activity === value
                    ? "border-ink bg-ink text-white"
                    : "border-black/10 bg-card"
                }`}
              >
                <span>
                  <span className="block text-sm font-bold">{label}</span>
                  <span
                    className={`block text-xs ${
                      activity === value ? "text-white/70" : "text-muted"
                    }`}
                  >
                    {hint}
                  </span>
                </span>
                {activity === value && <span aria-hidden>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex-1">
          <h2 className="text-2xl font-extrabold tracking-tight">
            What&apos;s your goal?
          </h2>
          <div className="mt-6 space-y-2">
            {GOAL_OPTIONS.map(({ value, label, emoji }) => (
              <button
                key={value}
                type="button"
                onClick={() => setGoal(value)}
                className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left text-sm font-bold ${
                  goal === value
                    ? "border-ink bg-ink text-white"
                    : "border-black/10 bg-card"
                }`}
              >
                <span className="text-xl" aria-hidden>
                  {emoji}
                </span>
                {label}
                {goal === value && <span className="ml-auto" aria-hidden>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 4 && goals && (
        <div className="flex-1">
          <h2 className="text-2xl font-extrabold tracking-tight">
            Your daily goals
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            Based on your details. You can adjust these anytime in Settings.
          </p>

          <div className="card mt-6 p-6 text-center">
            <p className="text-5xl font-extrabold tracking-tight">
              {goals.calories.toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-ink-2">calories / day</p>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {(
              [
                ["Protein", goals.protein_g, "#e34948"],
                ["Carbs", goals.carbs_g, "#eda100"],
                ["Fat", goals.fat_g, "#2a78d6"],
              ] as const
            ).map(([label, grams, color]) => (
              <div key={label} className="card p-4 text-center">
                <span
                  className="mx-auto block h-2 w-2 rounded-full"
                  style={{ background: color }}
                  aria-hidden
                />
                <p className="mt-2 text-lg font-bold">{grams}g</p>
                <p className="text-[11px] text-ink-2">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer buttons */}
      {step === 1 && !profile && (
        <p className="mt-4 text-center text-xs font-medium text-danger">
          Please enter a valid age (10–100), height and weight.
        </p>
      )}
      <div className="mt-8 flex gap-2">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="hairline flex-1 rounded-full bg-card py-4 text-sm font-semibold"
          >
            Back
          </button>
        )}
        <button
          type="button"
          disabled={step >= 1 && !profile}
          onClick={() => {
            if (step < 4) {
              setStep(step + 1);
            } else if (profile && goals) {
              completeOnboarding(profile, goals);
            }
          }}
          className="flex-[2] rounded-full bg-ink py-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          {step === 0 ? "Get started" : step === 4 ? "Start tracking" : "Continue"}
        </button>
      </div>
    </div>
  );
}
