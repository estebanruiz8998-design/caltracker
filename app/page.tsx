"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import DateStrip from "@/components/DateStrip";
import CalorieCard from "@/components/CalorieCard";
import MacroCard from "@/components/MacroCard";
import FoodList from "@/components/FoodList";

export default function HomePage() {
  const { goals, streak, today, logsFor, totalsFor, deleteLog } = useStore();
  const [selectedDay, setSelectedDay] = useState(today);

  // When the date rolls over while the tab is open, follow it — but only if
  // the user was viewing "today" (don't yank them off a day they picked).
  const prevToday = useRef(today);
  useEffect(() => {
    if (prevToday.current !== today) {
      setSelectedDay((d) => (d === prevToday.current ? today : d));
      prevToday.current = today;
    }
  }, [today]);

  const totals = totalsFor(selectedDay);
  const logs = logsFor(selectedDay);
  const isToday = selectedDay === today;

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold tracking-tight">CalTracker</h1>
        <div
          className="card flex items-center gap-1.5 rounded-full px-3 py-1.5"
          title={`${streak}-day streak`}
        >
          <span aria-hidden>🔥</span>
          <span className="text-sm font-bold">{streak}</span>
        </div>
      </header>

      <DateStrip selected={selectedDay} onSelect={setSelectedDay} />

      <CalorieCard consumed={totals.calories} goal={goals.calories} />

      <div className="flex gap-3">
        <MacroCard
          label="Protein"
          consumed={totals.protein_g}
          goal={goals.protein_g}
          color="#e34948"
        />
        <MacroCard
          label="Carbs"
          consumed={totals.carbs_g}
          goal={goals.carbs_g}
          color="#eda100"
        />
        <MacroCard
          label="Fat"
          consumed={totals.fat_g}
          goal={goals.fat_g}
          color="#2a78d6"
        />
      </div>

      <section aria-label="Logged meals">
        <h2 className="mb-3 text-base font-bold">
          {isToday ? "Recently eaten" : "Eaten this day"}
        </h2>
        <FoodList logs={logs} onDelete={deleteLog} />
      </section>
    </div>
  );
}
