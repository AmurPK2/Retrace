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
  height,
  priceY,
  onLearn,
  onFit,
}: {
  bars: Bar[];
  cutoff: number;
  value?: HTFSettings;
  save: (value: HTFSettings) => void;
  precision?: number;
  height: number;
  priceY: (price: number) => number;
  onLearn: () => void;
  onFit: () => void;
}) {
  const c = { ...DEFAULT_HTF, ...value };
  const [settings, setSettings] = useState(false);
  if (!c.enabled) return null;
  const candles = htfCandles(bars, cutoff, c.timeframe, c.count);
  const width = Math.max(178, (c.width + c.gap) * candles.length + 100);
  const current = candles.at(-1);
  const outside = candles.some(
    (b) => priceY(b.high) < 68 || priceY(b.low) > height - 28,
  );
  return (
    <section
      className="htf-candles htf-aligned"
      aria-label="Higher timeframe candles"
      style={{ width, height }}
    >
      <div className="htf-heading" onPointerDown={(e) => e.stopPropagation()}>
        <div>
          <b>{c.timeframe}-candle</b>
          <span>
            {current?.closed ? "Ferdig" : "Pågående"} ·{" "}
            {current ? countdown(current.remaining) : "—"}
          </span>
        </div>
        <div className="htf-heading-actions">
          <button
            onClick={onLearn}
            title="Lær å lese 4H-candlen og se videoguiden"
          >
            Lær 4H
          </button>
          <button
            onClick={() => setSettings(!settings)}
            aria-label="Tilpass side-candle"
            title="Endre bredde, farger eller tidsramme"
          >
            Tilpass
          </button>
          <button
            onClick={() => save({ ...c, enabled: false })}
            aria-label="Skjul side-candle"
            title="Skjul side-candle"
          >
            ×
          </button>
        </div>
      </div>
      {settings && (
        <div
          className="htf-settings"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <strong>Samme prisskala som charten</strong>
          <p>
            Høyden følger prisene når du zoomer. Bredde endrer bare hvor tykk
            candlen er.
          </p>
          <label>
            Tidsramme
            <select
              aria-label="Side-candle tidsramme"
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
          {(
            [
              ["count", "Antall candles", 1, 5],
              ["width", "Bredde", 12, 64],
              ["gap", "Avstand", 4, 40],
            ] as const
          ).map(([key, label, min, max]) => (
            <label key={key}>
              {label}
              <input
                aria-label={label}
                type="number"
                min={min}
                max={max}
                value={c[key]}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= min && n <= max)
                    save({ ...c, [key]: n });
                }}
              />
            </label>
          ))}
          {(
            [
              ["up", "Oppgang"],
              ["down", "Nedgang"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="color"
                value={c[key]}
                onChange={(e) => save({ ...c, [key]: e.target.value })}
              />
            </label>
          ))}
          <label>
            <input
              type="checkbox"
              checked={c.levels}
              onChange={(e) => save({ ...c, levels: e.target.checked })}
            />
            Vis prisnivåer
          </label>
          <p>
            4H starter 00, 04, 08, 12, 16 og 20 UTC. Tidssonen endrer etiketter,
            ikke candlegrensene.
          </p>
          <button onClick={() => setSettings(false)}>Ferdig</button>
        </div>
      )}
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={c.timeframe + " developing candle at the replay cutoff"}
      >
        <defs>
          <clipPath id="htf-price-clip">
            <rect
              x="0"
              y="62"
              width={width}
              height={Math.max(0, height - 86)}
            />
          </clipPath>
        </defs>
        <g clipPath="url(#htf-price-clip)">
          {candles.map((b, i) => {
            const x = 10 + i * (c.width + c.gap),
              color = b.close >= b.open ? c.up : c.down;
            return (
              <g
                key={b.time}
                data-htf-time={b.time}
                data-complete={b.closed}
                data-htf-open-y={priceY(b.open)}
                data-htf-close-y={priceY(b.close)}
              >
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
                  y1={priceY(b.high)}
                  y2={priceY(b.low)}
                  stroke={color}
                  strokeWidth="2"
                />
                <rect
                  x={x}
                  y={Math.min(priceY(b.open), priceY(b.close))}
                  width={c.width}
                  height={Math.max(
                    2,
                    Math.abs(priceY(b.open) - priceY(b.close)),
                  )}
                  fill={color}
                  fillOpacity={0.72}
                  stroke={color}
                />
                {c.levels &&
                  i === candles.length - 1 &&
                  (["high", "open", "close", "low"] as const).map((key, j) => (
                    <g key={key}>
                      <line
                        x1={x + c.width}
                        x2={width - 4}
                        y1={priceY(b[key])}
                        y2={priceY(b[key])}
                        stroke={color}
                        strokeDasharray="3 5"
                      />
                      {(key === "high" ||
                        key === "low" ||
                        (Math.abs(priceY(b.open) - priceY(b.close)) > 28 &&
                          Math.abs(priceY(b[key]) - priceY(b.high)) > 18 &&
                          Math.abs(priceY(b[key]) - priceY(b.low)) > 18)) && (
                        <text
                          x={x + c.width + 7}
                          y={priceY(b[key]) + (key === "low" ? 13 : -5)}
                        >
                          {key[0].toUpperCase()} {b[key].toFixed(precision)}
                        </text>
                      )}
                    </g>
                  ))}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="htf-bottom" onPointerDown={(e) => e.stopPropagation()}>
        {!current ? (
          <span>Venter på priser i denne {c.timeframe}-perioden.</span>
        ) : outside ? (
          <button
            onClick={onFit}
            title="Tilpass chartets prisskala til hele 4H-området"
          >
            Vis hele {c.timeframe}-candlen
          </button>
        ) : (
          <span>Samme prisskala · UTC</span>
        )}
        {current && (
          <details>
            <summary>Open · high · low · close</summary>
            <p>
              Åpning {current.open.toFixed(precision)}
              <br />
              Høy {current.high.toFixed(precision)}
              <br />
              Lav {current.low.toFixed(precision)}
              <br />
              {current.closed ? "Slutt" : "Pris nå"}{" "}
              {current.close.toFixed(precision)}
            </p>
          </details>
        )}
      </div>
    </section>
  );
}
