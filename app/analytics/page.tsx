"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { dateKey, lastNDays } from "@/lib/dates";
import WeeklyChart from "@/components/WeeklyChart";

const MACROS = [
  { key: "protein_g", label: "Protein", color: "#e34948" },
  { key: "carbs_g", label: "Carbs", color: "#eda100" },
  { key: "fat_g", label: "Fat", color: "#2a78d6" },
] as const;

export default function AnalyticsPage() {
  const { logs, goals, streak } = useStore();

  const week = useMemo(() => {
    const days = lastNDays(7).map(dateKey);
    const daySet = new Set(days);
    const weekLogs = logs.filter((l) => daySet.has(l.date));

    const totalsByDate: Record<string, number> = {};
    for (const l of weekLogs) {
      totalsByDate[l.date] = (totalsByDate[l.date] ?? 0) + l.calories;
    }

    const loggedDays = new Set(weekLogs.map((l) => l.date)).size;
    const sum = (k: "calories" | "protein_g" | "carbs_g" | "fat_g") =>
      weekLogs.reduce((acc, l) => acc + l[k], 0);

    return {
      totalsByDate,
      meals: weekLogs.length,
      loggedDays,
      avgCalories: loggedDays ? Math.round(sum("calories") / loggedDays) : 0,
      avgHealth: weekLogs.length
        ? Math.round(
            (weekLogs.reduce((a, l) => a + l.health_score, 0) / weekLogs.length) * 10,
          ) / 10
        : 0,
      avgMacro: (k: "protein_g" | "carbs_g" | "fat_g") =>
        loggedDays ? Math.round(sum(k) / loggedDays) : 0,
    };
  }, [logs]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-extrabold tracking-tight">Analytics</h1>
        <p className="mt-0.5 text-sm text-ink-2">Last 7 days</p>
      </header>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Daily average" value={week.avgCalories.toLocaleString()} unit="kcal" />
        <StatTile label="Meals logged" value={String(week.meals)} />
        <StatTile label="Streak" value={String(streak)} unit={streak === 1 ? "day" : "days"} />
        <StatTile
          label="Avg health score"
          value={week.meals ? `${week.avgHealth}` : "–"}
          unit={week.meals ? "/10" : undefined}
        />
      </div>

      {/* Weekly calories chart */}
      <section className="card p-5" aria-label="Calories this week">
        <h2 className="text-sm font-bold">Calories</h2>
        <p className="mb-3 mt-0.5 text-xs text-muted">
          Daily total vs your {goals.calories.toLocaleString()} kcal goal
        </p>
        <WeeklyChart totalsByDate={week.totalsByDate} goal={goals.calories} />
      </section>

      {/* Macro averages */}
      <section className="card p-5" aria-label="Macro averages">
        <h2 className="text-sm font-bold">Macros</h2>
        <p className="mb-4 mt-0.5 text-xs text-muted">
          Daily average on logged days vs goal
        </p>
        <div className="space-y-4">
          {MACROS.map(({ key, label, color }) => {
            const avg = week.avgMacro(key);
            const goal = goals[key];
            const pct = goal > 0 ? Math.min(1, avg / goal) : 0;
            return (
              <div key={key}>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: color }}
                      aria-hidden
                    />
                    {label}
                  </span>
                  <span className="text-ink-2">
                    {avg}g <span className="text-muted">/ {goal}g</span>
                  </span>
                </div>
                <div
                  className="h-2 rounded-full"
                  style={{ background: `color-mix(in srgb, ${color} 14%, white)` }}
                  role="meter"
                  aria-valuenow={avg}
                  aria-valuemin={0}
                  aria-valuemax={goal}
                  aria-label={`Average ${label.toLowerCase()} per day`}
                >
                  <div
                    className="h-2 rounded-full"
                    style={{ width: `${pct * 100}%`, background: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatTile({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs text-ink-2">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">
        {value}
        {unit && (
          <span className="ml-1 text-sm font-medium text-muted">{unit}</span>
        )}
      </p>
    </div>
  );
}
