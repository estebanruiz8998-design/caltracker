/** Local date key: YYYY-MM-DD (device timezone, not UTC). */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return dateKey(new Date());
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

/** The last `n` days ending today, oldest first. */
export function lastNDays(n: number): Date[] {
  const today = new Date();
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}

export const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

export function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
