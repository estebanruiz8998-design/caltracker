"use client";

import { useState } from "react";
import type { FoodLog } from "@/lib/types";
import { formatTime } from "@/lib/dates";

const MACROS = [
  { key: "protein_g", letter: "P", color: "#e34948" },
  { key: "carbs_g", letter: "C", color: "#eda100" },
  { key: "fat_g", letter: "F", color: "#2a78d6" },
] as const;

export default function FoodList({
  logs,
  onDelete,
}: {
  logs: FoodLog[];
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  if (logs.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-black/15 p-8 text-center">
        <p className="text-3xl" aria-hidden>
          🍽️
        </p>
        <p className="mt-2 text-sm font-medium text-ink-2">Nothing logged yet</p>
        <p className="mt-1 text-xs text-muted">
          Tap <span className="font-semibold text-ink">+</span> to scan your first
          meal
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {logs.map((log) => {
        const isOpen = expanded === log.id;
        return (
          <li key={log.id} className="card overflow-hidden">
            <button
              type="button"
              onClick={() => {
                setExpanded(isOpen ? null : log.id);
                setConfirmingDelete(null);
              }}
              className="flex w-full items-center gap-3 p-3 text-left"
              aria-expanded={isOpen}
            >
              {log.photo ? (
                <img
                  src={log.photo}
                  alt=""
                  className="h-14 w-14 rounded-2xl object-cover"
                />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-page text-2xl">
                  {log.emoji || "🍽️"}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{log.name}</p>
                  <p className="shrink-0 text-xs text-muted">
                    {formatTime(log.loggedAt)}
                  </p>
                </div>
                <p className="mt-0.5 text-sm font-medium text-ink-2">
                  {Math.round(log.calories)} kcal
                </p>
                <div className="mt-1 flex gap-3">
                  {MACROS.map(({ key, letter, color }) => (
                    <span
                      key={key}
                      className="flex items-center gap-1 text-[11px] text-ink-2"
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: color }}
                        aria-hidden
                      />
                      {letter} {Math.round(log[key])}g
                    </span>
                  ))}
                </div>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-black/[0.06] px-4 py-3">
                {log.items.length > 0 && (
                  <ul className="space-y-1.5">
                    {log.items.map((item, i) => (
                      <li
                        key={i}
                        className="flex justify-between gap-2 text-xs text-ink-2"
                      >
                        <span className="truncate">
                          {item.name}
                          {item.quantity ? ` · ${item.quantity}` : ""}
                        </span>
                        <span className="shrink-0 font-medium">
                          {Math.round(item.calories)} kcal
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted">
                    Health score{" "}
                    <span className="font-semibold text-ink">
                      {log.health_score}/10
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirmingDelete === log.id) {
                        onDelete(log.id);
                        setConfirmingDelete(null);
                      } else {
                        setConfirmingDelete(log.id);
                      }
                    }}
                    className={`-m-2 rounded-full p-2 text-xs font-semibold ${
                      confirmingDelete === log.id
                        ? "bg-danger px-3 text-white"
                        : "text-danger"
                    }`}
                  >
                    {confirmingDelete === log.id ? "Tap to confirm" : "Delete"}
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
