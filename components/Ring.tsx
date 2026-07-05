"use client";

import type { ReactNode } from "react";

/**
 * SVG progress ring. `progress` is 0..1 (clamped); the unfilled track is a
 * light tint of the same hue so state reads across the whole ring.
 */
export default function Ring({
  size,
  stroke,
  progress,
  color,
  trackColor,
  children,
}: {
  size: number;
  stroke: number;
  progress: number;
  color: string;
  trackColor?: string;
  children?: ReactNode;
}) {
  const p = Math.min(1, Math.max(0, progress));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor ?? `color-mix(in srgb, ${color} 14%, white)`}
          strokeWidth={stroke}
        />
        {p > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * p} ${c}`}
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        )}
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}
