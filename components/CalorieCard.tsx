"use client";

import Ring from "./Ring";

export default function CalorieCard({
  consumed,
  goal,
}: {
  consumed: number;
  goal: number;
}) {
  const remaining = Math.round(goal - consumed);
  const over = remaining < 0;
  return (
    <section className="card flex items-center justify-between p-6" aria-label="Calories">
      <div>
        <p className="text-4xl font-bold tracking-tight">
          {Math.abs(remaining).toLocaleString()}
        </p>
        <p className="mt-1 text-sm text-ink-2">
          {over ? "Calories over" : "Calories left"}
        </p>
      </div>
      <Ring
        size={104}
        stroke={10}
        progress={goal > 0 ? consumed / goal : 0}
        color={over ? "#d03b3b" : "#0b0b0b"}
        trackColor="#f0efec"
      >
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 2.5c.6 2.8-.7 4.5-2.2 6C8.2 10.1 7 11.9 7 14.2A5.1 5.1 0 0 0 12 19.5a5.1 5.1 0 0 0 5-5.3c0-2.1-1-3.8-2.1-5.2-.4 1-1 1.7-1.9 2.3.1-2.6-.4-6.3-1-8.8Z"
            fill={over ? "#d03b3b" : "#0b0b0b"}
          />
        </svg>
      </Ring>
    </section>
  );
}
