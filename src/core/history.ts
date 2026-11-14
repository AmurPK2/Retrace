import type { Store } from "../data/store";
import { FRAMES, type Bar, type Session, type TF, type Tick } from "../types";
import { aggregate, fromTicks } from "./bars";

const HOUR = 3600000;
export const HISTORY_BARS: Record<TF, number> = {
  "1m": 4000,
  "5m": 3200,
  "15m": 2400,
  "30m": 2400,
  "1H": 2400,
  "4H": 1800,
  "1D": 500,
};

// Historical gaps remain explicit. They do not erase older valid context and
// never change execution eligibility or permit the replay clock to cross them.
export function chartHistory(
  store: Store,
  s: Session,
  ticks: Tick[],
  tf: TF,
): Bar[] {
  const period = FRAMES[tf] * 1000;
  const minute = Math.floor(s.tick.t / 60000) * 60000;
  const hour = s.cursor.hour;
  const chunks = store.chunks(s.dataset);
  const byHour = new Map(chunks.map((c) => [c.hour, c]));
  const lookback = period * HISTORY_BARS[tf] * 1.6 + 8 * 86400000;
  const from =
    Math.floor(
      Math.max(chunks[0]?.hour ?? hour, s.tick.t - lookback) / period,
    ) * period;
  const missing: { from: number; to: number }[] = [];
  for (let h = Math.floor(from / HOUR) * HOUR; h <= hour; h += HOUR) {
    const c = byHour.get(h);
    if (c?.status === "closure") continue;
    let bad = !c || c.status !== "ready";
    if (!bad && c) {
      try {
        bad = (JSON.parse(c.provenance || "{}").unexpectedGaps ?? []).some(
          (gap: { to: number }) => gap.to <= s.tick.t,
        );
      } catch {
        bad = true;
      }
    }
    if (!bad) continue;
    // Omit an affected higher-timeframe bucket in full instead of inventing
    // a completed daily/H4 candle from its available fraction.
    const start = Math.floor(h / period) * period;
    const end = Math.ceil(Math.min(h + HOUR, s.tick.t) / period) * period;
    const previous = missing.at(-1);
    if (previous && previous.to >= start)
      previous.to = Math.max(previous.to, end);
    else missing.push({ from: start, to: end });
  }
  const past = store.groupedBars(
    s.dataset,
    from,
    FRAMES[tf] >= 3600 ? hour : minute,
    FRAMES[tf],
  );
  const forming =
    FRAMES[tf] >= 3600
      ? store.bars(s.dataset, Math.max(from, hour), minute)
      : [];
  const visibleTicks = ticks
    .slice(0, s.cursor.index + 1)
    .filter((q) => q.t >= minute);
  const aggregated = aggregate(
    [...past, ...forming, ...fromTicks(visibleTicks)],
    tf,
  );
  let gapIndex = 0;
  let pending: { from: number; to: number } | undefined;
  const result: Bar[] = [];
  for (const b of aggregated) {
    while (gapIndex < missing.length && missing[gapIndex].to <= b.time * 1000) {
      const gap = missing[gapIndex++];
      pending = pending ? { from: pending.from, to: gap.to } : gap;
    }
    const gap = missing[gapIndex];
    if (gap && b.time * 1000 >= gap.from && b.time * 1000 < gap.to) continue;
    result.push(pending ? { ...b, gapBefore: pending } : b);
    pending = undefined;
  }
  return result.slice(-HISTORY_BARS[tf]);
}
