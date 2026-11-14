import type { RRRange } from "../core/rr-study";
import { FRAMES } from "../types";

export function RRRangeOverlay({
  range,
  x,
  y,
  width,
  accent,
  muted,
  cutoff,
  detailed,
}: {
  range: RRRange;
  x: (t: number) => number;
  y: (p: number) => number;
  width: number;
  accent: string;
  muted: string;
  cutoff: number;
  detailed: boolean;
}) {
  const seconds = FRAMES[range.timeframe],
    c3 = range.c2.time + seconds;
  const left = x(range.c1.time),
    right = Math.min(width - 70, x(c3 + seconds));
  const high = y(range.c1.high),
    low = y(range.c1.low),
    mid = y((range.c1.high + range.c1.low) / 2);
  if (
    right < 0 ||
    left > width - 70 ||
    ![left, right, high, low, mid].every(Number.isFinite)
  )
    return null;
  const labelX = Math.max(8, Math.min(width - 220, left + 7));
  return (
    <g
      className="rr-chart-overlay"
      aria-label={`Study reference range ${range.timeframe}`}
      style={{ pointerEvents: "none" }}
    >
      <rect
        x={Math.max(0, left)}
        y={Math.min(high, low)}
        width={Math.max(0, right - Math.max(0, left))}
        height={Math.abs(low - high)}
        fill={accent}
        fillOpacity={0.045}
      />
      <line
        x1={Math.max(0, left)}
        x2={right}
        y1={high}
        y2={high}
        stroke={muted}
        strokeDasharray="5 4"
      />
      <line
        x1={Math.max(0, left)}
        x2={right}
        y1={low}
        y2={low}
        stroke={muted}
        strokeDasharray="5 4"
      />
      <line
        x1={Math.max(0, left)}
        x2={right}
        y1={mid}
        y2={mid}
        stroke={muted}
        strokeOpacity={0.5}
        strokeDasharray="2 6"
      />
      <text x={labelX} y={high - 7} fill={muted} fontSize={9}>
        {range.timeframe} C1 H {range.c1.high.toFixed(3)}
      </text>
      <text x={labelX} y={low + 13} fill={muted} fontSize={9}>
        {range.timeframe} C1 L {range.c1.low.toFixed(3)}
      </text>
      {detailed && Math.abs(x(range.c2.time) - x(range.c1.time)) >= 16 ? (
        [
          [range.c1.time, "C1"],
          [range.c2.time, "C2"],
          [c3, cutoff >= (c3 + seconds) * 1000 ? "C3" : "C3 · forming"],
        ].map(([t, label]) => {
          const xx = x(t as number);
          if (xx < 6 || xx > width - 110) return null;
          return (
            <g key={t}>
              <line
                x1={xx}
                x2={xx}
                y1={40}
                y2={Math.max(44, Math.min(high, low) - 18)}
                stroke={muted}
                strokeOpacity={0.35}
                strokeDasharray="2 5"
              />
              <text x={xx + 4} y={45} fill={accent} fontSize={9}>
                {label}
              </text>
            </g>
          );
        })
      ) : (
        <text x={labelX} y={45} fill={muted} fontSize={9}>
          {range.timeframe} C1 range
        </text>
      )}
    </g>
  );
}
