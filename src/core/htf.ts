import { FRAMES, type Bar, type TF } from "../types";
export type HTFSettings = {
  enabled: boolean;
  timeframe: TF;
  count: number;
  width: number;
  gap: number;
  up: string;
  down: string;
  levels: boolean;
};
export const DEFAULT_HTF: HTFSettings = {
  enabled: true,
  timeframe: "4H",
  count: 1,
  width: 56,
  gap: 18,
  up: "#ff9b4a",
  down: "#a0a0a0",
  levels: true,
};
// Input is produced by Replay.bars at the exact tick cutoff, never by an
// unrestricted historical OHLC request. UTC buckets do not move with DST.
export function htfCandles(bars: Bar[], cutoff: number, tf: TF, count: number) {
  const currentStart = Math.floor(cutoff / (FRAMES[tf] * 1000)) * FRAMES[tf];
  return (
    bars
      .filter((b) => b.time * 1000 <= cutoff)
      // Single-candle mode never substitutes a previous closed candle during a gap.
      .filter((b) => count !== 1 || b.time === currentStart)
      .slice(-count)
      .map((b) => ({
        ...b,
        closed: (b.time + FRAMES[tf]) * 1000 <= cutoff,
        remaining: Math.max(
          0,
          Math.ceil(((b.time + FRAMES[tf]) * 1000 - cutoff) / 1000),
        ),
      }))
  );
}
export function countdown(seconds: number) {
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}
