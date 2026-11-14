import type { Bar } from "../types";
export type MagnetMode = "off" | "weak" | "strong";
export function snapDrawingPoint(
  point: { time: number; price: number },
  bars: Bar[],
  px: number,
  py: number,
  x: (time: number) => number,
  y: (price: number) => number,
  mode: MagnetMode,
) {
  if (mode === "off" || !bars.length) return { point, snapped: false };
  let lo = 0,
    hi = bars.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (bars[mid].time < point.time) lo = mid + 1;
    else hi = mid;
  }
  const choices = [bars[lo], bars[Math.max(0, lo - 1)]],
    bar = choices.reduce((a, b) =>
      Math.abs(x(a.time) - px) < Math.abs(x(b.time) - px) ? a : b,
    );
  if (Math.abs(x(bar.time) - px) > 16) return { point, snapped: false };
  const prices = [bar.open, bar.high, bar.low, bar.close];
  const price = prices.reduce((a, b) =>
    Math.abs(y(a) - py) < Math.abs(y(b) - py) ? a : b,
  );
  const snapped = Math.abs(y(price) - py) <= (mode === "strong" ? 18 : 7);
  return {
    point: { time: bar.time, price: snapped ? price : point.price },
    snapped,
  };
}
