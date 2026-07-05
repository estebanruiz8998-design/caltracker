"use client";

import Ring from "./Ring";

export default function MacroCard({
  label,
  consumed,
  goal,
  color,
}: {
  label: "Protein" | "Carbs" | "Fat";
  consumed: number;
  goal: number;
  color: string;
}) {
  const remaining = Math.round(goal - consumed);
  const over = remaining < 0;
  return (
    <div className="card flex flex-1 flex-col items-center gap-2 px-2 py-4">
      <p className="text-lg font-bold tracking-tight">
        {Math.abs(remaining)}g
      </p>
      <p className="-mt-2 text-[11px] text-ink-2">
        {label} {over ? "over" : "left"}
      </p>
      <Ring
        size={56}
        stroke={6}
        progress={goal > 0 ? consumed / goal : 0}
        color={color}
      >
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: color }}
          aria-hidden
        />
      </Ring>
    </div>
  );
}
