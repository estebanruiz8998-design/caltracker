"use client";

import { DAY_LETTERS, dateKey, lastNDays, todayKey } from "@/lib/dates";

export default function DateStrip({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (dateKey: string) => void;
}) {
  const days = lastNDays(7);
  const today = todayKey();
  return (
    <div className="flex justify-between" role="tablist" aria-label="Day">
      {days.map((d) => {
        const key = dateKey(d);
        const isSelected = key === selected;
        const isToday = key === today;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={isSelected}
            onClick={() => onSelect(key)}
            className="flex flex-col items-center gap-1.5"
          >
            <span className="text-[11px] font-medium text-muted">
              {DAY_LETTERS[d.getDay()]}
            </span>
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                isSelected
                  ? "bg-ink text-white"
                  : isToday
                    ? "hairline text-ink"
                    : "text-ink-2"
              }`}
            >
              {d.getDate()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
