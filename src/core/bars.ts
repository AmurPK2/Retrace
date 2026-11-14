import { FRAMES, type Bar, type Tick, type TF } from "../types";
export function fromTicks(ticks: Tick[], seconds = 60): Bar[] {
  const out: Bar[] = [];
  for (const q of ticks) {
    const time = Math.floor(q.t / 1000 / seconds) * seconds;
    const bar = out.at(-1);
    if (bar?.time === time) {
      bar.high = Math.max(bar.high, q.bid);
      bar.low = Math.min(bar.low, q.bid);
      bar.close = q.bid;
      bar.count++;
    } else
      out.push({
        time,
        open: q.bid,
        high: q.bid,
        low: q.bid,
        close: q.bid,
        count: 1,
      });
  }
  return out;
}
export function aggregate(bars: Bar[], tf: TF): Bar[] {
  const seconds = FRAMES[tf],
    out: Bar[] = [];
  for (const b of bars) {
    const time = Math.floor(b.time / seconds) * seconds;
    const last = out.at(-1);
    if (last?.time === time) {
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.count += b.count;
    } else out.push({ ...b, time });
  }
  return out;
}
function continuousSMA(bars: Bar[], p: number) {
  let total = 0;
  return bars.flatMap((b, i) => {
    total += b.close;
    if (i >= p) total -= bars[i - p].close;
    return i >= p - 1 ? [{ time: b.time, value: total / p }] : [];
  });
}
function continuousEMA(bars: Bar[], p: number) {
  if (bars.length < p) return [];
  let v = bars.slice(0, p).reduce((a, b) => a + b.close, 0) / p;
  const out = [{ time: bars[p - 1].time, value: v }];
  for (let i = p; i < bars.length; i++) {
    v += ((bars[i].close - v) * 2) / (p + 1);
    out.push({ time: bars[i].time, value: v });
  }
  return out;
}
function continuousRSI(bars: Bar[], p: number) {
  if (bars.length <= p) return [];
  let up = 0,
    down = 0;
  const out = [];
  for (let i = 1; i < bars.length; i++) {
    const d = bars[i].close - bars[i - 1].close;
    if (i <= p) {
      up += Math.max(0, d) / p;
      down += Math.max(0, -d) / p;
    } else {
      up = (up * (p - 1) + Math.max(0, d)) / p;
      down = (down * (p - 1) + Math.max(0, -d)) / p;
    }
    if (i >= p)
      out.push({
        time: bars[i].time,
        value: down === 0 ? (up === 0 ? 50 : 100) : 100 - 100 / (1 + up / down),
      });
  }
  return out;
}
function continuousATR(bars: Bar[], p: number) {
  let v = 0;
  const out = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i],
      prev = bars[i - 1]?.close ?? b.open;
    const tr = Math.max(
      b.high - b.low,
      Math.abs(b.high - prev),
      Math.abs(b.low - prev),
    );
    if (i < p) v += tr / p;
    else v = (v * (p - 1) + tr) / p;
    if (i >= p - 1) out.push({ time: b.time, value: v });
  }
  return out;
}
function segmented(
  bars: Bar[],
  p: number,
  calculate: (bars: Bar[], p: number) => { time: number; value: number }[],
) {
  const out: { time: number; value: number }[] = [];
  let start = 0;
  for (let i = 1; i <= bars.length; i++) {
    if (i === bars.length || bars[i].gapBefore) {
      out.push(...calculate(bars.slice(start, i), p));
      start = i;
    }
  }
  return out;
}
export const sma = (bars: Bar[], p: number) =>
  segmented(bars, p, continuousSMA);
export const ema = (bars: Bar[], p: number) =>
  segmented(bars, p, continuousEMA);
export const rsi = (bars: Bar[], p: number) =>
  segmented(bars, p, continuousRSI);
export const atr = (bars: Bar[], p: number) =>
  segmented(bars, p, continuousATR);
const zoneFormatters = new Map<string, Intl.DateTimeFormat>();
export function zonedParts(t: number, zone: string) {
  if (!zoneFormatters.has(zone))
    zoneFormatters.set(
      zone,
      new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        weekday: "short",
        hour: "numeric",
        minute: "numeric",
        hourCycle: "h23",
      }),
    );
  const parts = zoneFormatters.get(zone)!.formatToParts(t);
  const value = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  return {
    day: value("weekday"),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}
// Indicative recurring gold schedule: New York 17-18 break, Friday 17 to Sunday 18.
// Holiday/missing hours are NEVER inferred as closures from a failed request.
export function knownClosure(t: number) {
  const { day, hour } = zonedParts(t, "America/New_York");
  return (
    day === "Sat" ||
    (day === "Fri" && hour >= 17) ||
    (day === "Sun" && hour < 18) ||
    hour === 17
  );
}
export function sessionFlags(t: number) {
  const l = zonedParts(t, "Europe/London"),
    n = zonedParts(t, "America/New_York");
  return {
    london: l.hour >= 8 && l.hour < 17,
    newYork: n.hour >= 8 && n.hour < 17,
  };
}
