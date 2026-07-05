"use client";

import { useState } from "react";
import { DAY_LETTERS, dateKey, lastNDays, todayKey } from "@/lib/dates";

/** Round up to a clean axis maximum (1 / 2 / 2.5 / 5 × 10^n). */
function niceCeil(value: number): number {
  if (value <= 0) return 1000;
  const pow = 10 ** Math.floor(Math.log10(value));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * pow >= value) return m * pow;
  }
  return 10 * pow;
}

const W = 340;
const H = 190;
const PAD_LEFT = 38;
const PAD_RIGHT = 10;
const PAD_TOP = 18;
const PAD_BOTTOM = 26;
const BAR_W = 22; // ≤ 24px per mark spec

export default function WeeklyChart({
  totalsByDate,
  goal,
}: {
  totalsByDate: Record<string, number>;
  goal: number;
}) {
  const [active, setActive] = useState<number | null>(null);

  const days = lastNDays(7);
  const today = todayKey();
  const values = days.map((d) => Math.round(totalsByDate[dateKey(d)] ?? 0));
  const yMax = niceCeil(Math.max(goal, ...values) * 1.05);

  const plotW = W - PAD_LEFT - PAD_RIGHT;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const band = plotW / 7;
  const y = (v: number) => PAD_TOP + plotH * (1 - v / yMax);
  const ticks = [0, yMax / 2, yMax];
  const goalY = y(goal);

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Calories per day for the last 7 days against a goal of ${goal.toLocaleString()}`}
      >
        {/* Gridlines + y ticks */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD_LEFT}
              x2={W - PAD_RIGHT}
              y1={y(t)}
              y2={y(t)}
              stroke="#e1e0d9"
              strokeWidth="1"
            />
            <text
              x={PAD_LEFT - 6}
              y={y(t) + 3.5}
              textAnchor="end"
              fontSize="9"
              fill="#898781"
            >
              {t >= 1000 ? `${(t / 1000).toLocaleString()}k` : t}
            </text>
          </g>
        ))}

        {/* Goal reference line */}
        <line
          x1={PAD_LEFT}
          x2={W - PAD_RIGHT}
          y1={goalY}
          y2={goalY}
          stroke="#c3c2b7"
          strokeWidth="1"
        />
        <text
          x={W - PAD_RIGHT}
          y={goalY - 4}
          textAnchor="end"
          fontSize="9"
          fill="#898781"
        >
          Goal
        </text>

        {/* Bars — 4px rounded data-end, square baseline */}
        {values.map((v, i) => {
          const cx = PAD_LEFT + band * i + band / 2;
          const barX = cx - BAR_W / 2;
          const barTop = y(v);
          const barH = Math.max(0, H - PAD_BOTTOM - barTop);
          const r = Math.min(4, barH);
          const isToday = dateKey(days[i]) === today;
          const isActive = active === i;
          return (
            <g key={i}>
              {barH > 0 && (
                <path
                  d={`M ${barX} ${H - PAD_BOTTOM}
                      L ${barX} ${barTop + r}
                      Q ${barX} ${barTop} ${barX + r} ${barTop}
                      L ${barX + BAR_W - r} ${barTop}
                      Q ${barX + BAR_W} ${barTop} ${barX + BAR_W} ${barTop + r}
                      L ${barX + BAR_W} ${H - PAD_BOTTOM} Z`}
                  fill="#0b0b0b"
                  opacity={active === null || isActive ? 1 : 0.35}
                  style={{ transition: "opacity 0.15s" }}
                />
              )}
              {/* Selective direct label: today only (others via tooltip) */}
              {isToday && v > 0 && !isActive && (
                <text
                  x={cx}
                  y={barTop - 5}
                  textAnchor="middle"
                  fontSize="9.5"
                  fontWeight="700"
                  fill="#0b0b0b"
                >
                  {v.toLocaleString()}
                </text>
              )}
              {/* Tooltip for the active bar */}
              {isActive && (
                <text
                  x={cx}
                  y={(v > 0 ? barTop : H - PAD_BOTTOM) - 5}
                  textAnchor="middle"
                  fontSize="9.5"
                  fontWeight="700"
                  fill="#0b0b0b"
                >
                  {v.toLocaleString()} kcal
                </text>
              )}
              {/* Hit target: full band, larger than the mark */}
              <rect
                x={PAD_LEFT + band * i}
                y={PAD_TOP}
                width={band}
                height={plotH}
                fill="transparent"
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse") setActive(i);
                }}
                onPointerLeave={(e) => {
                  if (e.pointerType === "mouse") setActive(null);
                }}
                onClick={() => setActive((a) => (a === i ? null : i))}
              />
              {/* x labels */}
              <text
                x={cx}
                y={H - 8}
                textAnchor="middle"
                fontSize="9.5"
                fill={isToday ? "#0b0b0b" : "#898781"}
                fontWeight={isToday ? 700 : 400}
              >
                {DAY_LETTERS[days[i].getDay()]}
              </text>
            </g>
          );
        })}

        {/* Baseline */}
        <line
          x1={PAD_LEFT}
          x2={W - PAD_RIGHT}
          y1={H - PAD_BOTTOM}
          y2={H - PAD_BOTTOM}
          stroke="#c3c2b7"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}
