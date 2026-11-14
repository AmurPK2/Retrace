import { FRAMES, type Bar, type TF } from "../types";
import { RR_COURSE_VERSION, type RRLessonId } from "./rr-lessons";

export const RR_TIMEFRAMES = ["5m", "15m", "1H", "4H"] as const;
export type RRTimeframe = (typeof RR_TIMEFRAMES)[number];
export type RRCandlePattern =
  | "break-up"
  | "break-down"
  | "sweep-high"
  | "sweep-low"
  | "two-sided"
  | "boundary"
  | "inside";
export const RR_PATTERN_LABELS: Record<RRCandlePattern, string> = {
  "break-up": "Body close above C1",
  "break-down": "Body close below C1",
  "sweep-high": "High swept · close back inside",
  "sweep-low": "Low swept · close back inside",
  "two-sided": "Both sides swept · mixed",
  boundary: "Close on C1 boundary",
  inside: "Inside C1 · no sweep",
};
export type RRRange = {
  id: string;
  timeframe: RRTimeframe;
  c1: Bar;
  c2: Bar;
  selectedAt: number;
  selectedSeq: number;
  pattern: RRCandlePattern;
};
export type RRPlan = {
  decision: "long" | "short" | "skip";
  objective: string;
  invalidation: string;
  confirmation: string;
};
export const EMPTY_RR_PLAN: RRPlan = {
  decision: "skip",
  objective: "",
  invalidation: "",
  confirmation: "",
};
export type RRAttempt = {
  id: string;
  version: string;
  lesson: RRLessonId;
  range: RRRange;
  plan: RRPlan;
  committedAt: number;
  committedSeq: number;
  visibleC3?: Bar;
  exposure: "unseen" | "developing" | "already-closed";
  review?: { c3: Bar; savedAt: number; savedSeq: number; reflection: string };
};
export type RRStudy = {
  range?: RRRange;
  overlay: boolean;
  draft: RRPlan;
  attempts: RRAttempt[];
  activeId?: string;
};
export type RRStudyView = {
  range: RRRange | null;
  c3: Bar | null;
  c3Closed: boolean;
  coverage: "waiting" | "developing" | "closed" | "missing";
};
export function emptyRRStudy(): RRStudy {
  return { overlay: true, draft: { ...EMPTY_RR_PLAN }, attempts: [] };
}
export function classifyC2(c1: Bar, c2: Bar): RRCandlePattern {
  const above = c2.high > c1.high,
    below = c2.low < c1.low;
  if (above && below) return "two-sided";
  if (c2.close > c1.high) return "break-up";
  if (c2.close < c1.low) return "break-down";
  if (c2.close === c1.high || c2.close === c1.low) return "boundary";
  if (above) return "sweep-high";
  if (below) return "sweep-low";
  return "inside";
}
function safeBar(b: Bar) {
  return (
    [b.time, b.open, b.high, b.low, b.close].every(Number.isFinite) &&
    b.low > 0 &&
    b.high >= Math.max(b.open, b.close, b.low) &&
    b.low <= Math.min(b.open, b.close)
  );
}
export function chooseRRRange(
  bars: Bar[],
  cutoff: number,
  seq: number,
  timeframe: RRTimeframe,
  id: string,
  c1Time?: number,
): RRRange {
  const width = FRAMES[timeframe];
  const completed = bars.filter(
    (b) => safeBar(b) && (b.time + width) * 1000 <= cutoff,
  );
  const i =
    c1Time === undefined
      ? completed.length - 2
      : completed.findIndex((b) => b.time === c1Time);
  const c1 = completed[i],
    c2 = completed[i + 1];
  if (!c1 || !c2 || c2.time !== c1.time + width)
    throw Error(
      "Choose two consecutive closed candles. A forming candle or a data gap cannot confirm C2.",
    );
  return {
    id,
    timeframe,
    c1: { ...c1 },
    c2: { ...c2 },
    selectedAt: cutoff,
    selectedSeq: seq,
    pattern: classifyC2(c1, c2),
  };
}
export function rrStudyView(
  range: RRRange | undefined,
  bars: Bar[],
  cutoff: number,
  seq = Infinity,
): RRStudyView {
  if (
    !range ||
    range.selectedAt > cutoff ||
    range.selectedSeq > seq ||
    (range.c2.time + FRAMES[range.timeframe]) * 1000 > cutoff
  )
    return { range: null, c3: null, c3Closed: false, coverage: "waiting" };
  const width = FRAMES[range.timeframe],
    start = range.c2.time + width;
  // Bars must come from Replay.bars, whose forming OHLC is cursor-bounded.
  // Never include a future bar merely because it exists in a storage cache.
  const c3 = bars.find(
    (b) => b.time === start && b.time * 1000 <= cutoff && safeBar(b),
  );
  const closed = cutoff >= (start + width) * 1000;
  return {
    range,
    c3: c3 ? { ...c3 } : null,
    c3Closed: !!c3 && closed,
    coverage: c3
      ? closed
        ? "closed"
        : "developing"
      : cutoff < start * 1000
        ? "waiting"
        : "missing",
  };
}
export function commitRRAttempt(
  range: RRRange,
  plan: RRPlan,
  lesson: RRLessonId,
  bars: Bar[],
  cutoff: number,
  seq: number,
  id: string,
): RRAttempt {
  const view = rrStudyView(range, bars, cutoff, seq);
  if (!view.range)
    throw Error("The selected range is unavailable at this replay point.");
  if (!plan.confirmation.trim())
    throw Error("Write your confirmation, or your reason to skip.");
  if (
    plan.decision !== "skip" &&
    (!plan.objective.trim() || !plan.invalidation.trim())
  )
    throw Error(
      "Add an objective and invalidation before saving a directional idea.",
    );
  return {
    id,
    version: RR_COURSE_VERSION,
    lesson,
    range: structuredClone(range),
    plan: { ...plan },
    committedAt: cutoff,
    committedSeq: seq,
    ...(view.c3 ? { visibleC3: { ...view.c3 } } : {}),
    exposure: view.c3Closed
      ? "already-closed"
      : view.c3
        ? "developing"
        : "unseen",
  };
}
export function rrC3Description(c3: Bar, c1: Bar) {
  const body =
    c3.close > c3.open
      ? "Closed above its open"
      : c3.close < c3.open
        ? "Closed below its open"
        : "Closed at its open";
  const touched = [
    c3.high >= c1.high ? "reached C1 high" : "",
    c3.low <= c1.low ? "reached C1 low" : "",
  ].filter(Boolean);
  return `${body}${touched.length ? ` · ${touched.join(" and ")}` : " · stayed between C1 extremes"}.`;
}
export function partialRExample(
  entry: number,
  stop: number,
  tp1: number,
  tp2: number,
  firstPercent: number,
) {
  if (
    ![entry, stop, tp1, tp2, firstPercent].every(Number.isFinite) ||
    Math.min(entry, stop, tp1, tp2) <= 0 ||
    firstPercent < 0 ||
    firstPercent > 100 ||
    entry === stop
  )
    return null;
  const sign = stop < entry ? 1 : -1;
  if ((tp1 - entry) * sign <= 0 || (tp2 - entry) * sign <= 0) return null;
  const risk = Math.abs(entry - stop),
    r1 = ((tp1 - entry) * sign) / risk,
    r2 = ((tp2 - entry) * sign) / risk,
    part = firstPercent / 100;
  return {
    risk,
    r1,
    r2,
    bankedR: part * r1,
    fullR: part * r1 + (1 - part) * r2,
    runnerBeR: part * r1,
  };
}
export function studyContextLayout(preset: "context" | "entry") {
  return preset === "context"
    ? { timeframe: "1H" as TF, second: "4H" as TF, dual: true }
    : { timeframe: "15m" as TF, second: "1H" as TF, dual: true };
}
