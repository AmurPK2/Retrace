import { useState } from "react";
import { FRAMES, type Bar } from "../types";
import {
  DEFAULT_HTF,
  htfCandles,
  countdown,
  type HTFSettings,
} from "../core/htf";
export function HTFCandles({
  bars,
  cutoff,
  value,
  save,
  precision = 3,
}: {
  bars: Bar[];
  cutoff: number;
  value?: HTFSettings;
  save: (v: HTFSettings) => void;
  precision?: number;
}) {
  const c = { ...DEFAULT_HTF, ...value },
    [settings, setSettings] = useState(false);
  if (!c.enabled) return null;
  const candles = htfCandles(bars, cutoff, c.timeframe, c.count),
    width = (c.width + c.gap) * candles.length + 115,
    single = c.count === 1,
    plotHeight = single ? 200 : 155;
  const low = Math.min(...candles.map((b) => b.low)),
    high = Math.max(...candles.map((b) => b.high)),
    span = Math.max(0.001, high - low);
  const y = (p: number) => 22 + ((high - p) / span) * plotHeight;
  return (
    <section
      className="htf-candles"
      aria-label="Higher timeframe candles"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header>
        <button
          title="Side candle settings"
          onClick={() => setSettings(!settings)}
        >
          {c.timeframe} {single ? "candle" : "candles"} · UTC
        </button>
        <button
          title="Hide side candles"
          onClick={() => save({ ...c, enabled: false })}
        >
          ×
        </button>
      </header>
      {settings && (
        <div className="htf-settings">
          <label>
            Timeframe
            <select
              value={c.timeframe}
              onChange={(e) =>
                save({
                  ...c,
                  timeframe: e.target.value as HTFSettings["timeframe"],
                })
              }
            >
              {Object.keys(FRAMES).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          {(["count", "width", "gap"] as const).map((k) => (
            <label key={k}>
              {k}
              <input
                type="number"
                value={c[k]}
                min={k === "count" ? 1 : k === "width" ? 12 : 4}
                max={k === "count" ? 5 : k === "width" ? 64 : 40}
                onChange={(e) => save({ ...c, [k]: +e.target.value })}
              />
            </label>
          ))}
          {(["up", "down"] as const).map((k) => (
            <label key={k}>
              {k}
              <input
                type="color"
                value={c[k]}
                onChange={(e) => save({ ...c, [k]: e.target.value })}
              />
            </label>
          ))}
          <label>
            <input
              type="checkbox"
              checked={c.levels}
              onChange={(e) => save({ ...c, levels: e.target.checked })}
            />
            Level labels
          </label>
          <p>
            UTC bars: 00/04/08/12/16/20 for 4H. Display timezone changes labels
            only. Market pauses contain no invented candles.
          </p>
        </div>
      )}
      <svg
        width={width}
        height={plotHeight + 67}
        role="img"
        aria-label={
          c.timeframe +
          (single ? " developing candle" : " candles") +
          " at the replay cutoff"
        }
      >
        {candles.map((b, i) => {
          const x = 10 + i * (c.width + c.gap),
            color = b.close >= b.open ? c.up : c.down;
          return (
            <g key={b.time} data-htf-time={b.time} data-complete={b.closed}>
              <title>
                {(b.closed ? "Completed" : "Developing") +
                  " O " +
                  b.open +
                  " H " +
                  b.high +
                  " L " +
                  b.low +
                  " C " +
                  b.close}
              </title>
              <line
                x1={x + c.width / 2}
                x2={x + c.width / 2}
                y1={y(b.high)}
                y2={y(b.low)}
                stroke={color}
              />
              <rect
                x={x}
                y={Math.min(y(b.open), y(b.close))}
                width={c.width}
                height={Math.max(2, Math.abs(y(b.open) - y(b.close)))}
                fill={color}
                fillOpacity={b.closed ? 0.55 : 0.85}
                stroke={color}
              />
              <text x={x} y={plotHeight + 41}>
                {b.closed ? "Closed" : "Forming"}
              </text>
              <text x={x} y={plotHeight + 57}>
                {b.closed
                  ? new Date(b.time * 1000).toISOString().slice(11, 16)
                  : countdown(b.remaining)}
              </text>
              {c.levels &&
                i === candles.length - 1 &&
                (["high", "open", "close", "low"] as const).map((key, j) => (
                  <g key={key}>
                    <line
                      x1={x + c.width}
                      x2={width - 5}
                      y1={y(b[key])}
                      y2={y(b[key])}
                      stroke={color}
                      strokeDasharray="2 4"
                    />
                    <text x={x + c.width + 6} y={18 + j * 15}>
                      {key[0].toUpperCase()} {b[key].toFixed(precision)}
                    </text>
                  </g>
                ))}
            </g>
          );
        })}
      </svg>
      {!candles.length && (
        <p>
          {single
            ? "Waiting for verified prices in the current " +
              c.timeframe +
              " candle."
            : "No verified candles at this time."}
        </p>
      )}
    </section>
  );
}
