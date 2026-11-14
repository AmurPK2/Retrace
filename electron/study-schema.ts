import { z } from "zod";
import { FRAMES } from "../src/types";
import { RR_LESSON_IDS } from "../src/core/rr-lessons";
import { RR_TIMEFRAMES, classifyC2 } from "../src/core/rr-study";
const positive = z.number().finite().positive(),
  time = z.number().finite().nonnegative(),
  seq = z.number().int().nonnegative();
const bar = z
  .object({
    time,
    open: positive,
    high: positive,
    low: positive,
    close: positive,
    count: seq,
    gapBefore: z.object({ from: time, to: time }).optional(),
  })
  .refine(
    (b) =>
      b.high >= Math.max(b.open, b.close, b.low) &&
      b.low <= Math.min(b.open, b.close),
    "Invalid candle geometry",
  );
const range = z
  .object({
    id: z.string().min(1).max(100),
    timeframe: z.enum(RR_TIMEFRAMES),
    c1: bar,
    c2: bar,
    selectedAt: time,
    selectedSeq: seq,
    pattern: z.enum([
      "break-up",
      "break-down",
      "sweep-high",
      "sweep-low",
      "two-sided",
      "boundary",
      "inside",
    ]),
  })
  .refine(
    (r) =>
      r.c2.time === r.c1.time + FRAMES[r.timeframe] &&
      r.selectedAt >= (r.c2.time + FRAMES[r.timeframe]) * 1000 &&
      r.pattern === classifyC2(r.c1, r.c2),
    "Study range requires consecutive closed candles and matching classification",
  );
export const rrPlanSchema = z.object({
  decision: z.enum(["long", "short", "skip"]),
  objective: z.string().max(2000),
  invalidation: z.string().max(2000),
  confirmation: z.string().max(4000),
});
const attempt = z
  .object({
    id: z.string().min(1).max(100),
    version: z.string().max(120),
    lesson: z.enum(RR_LESSON_IDS),
    range,
    plan: rrPlanSchema,
    committedAt: time,
    committedSeq: seq,
    visibleC3: bar.optional(),
    exposure: z.enum(["unseen", "developing", "already-closed"]),
    review: z
      .object({
        c3: bar,
        savedAt: time,
        savedSeq: seq,
        reflection: z.string().max(6000),
      })
      .optional(),
  })
  .refine(
    (a) =>
      a.committedAt >= a.range.selectedAt &&
      a.committedSeq >= a.range.selectedSeq &&
      (!a.review ||
        (a.review.c3.time === a.range.c2.time + FRAMES[a.range.timeframe] &&
          a.review.savedAt >=
            Math.max(
              a.committedAt,
              (a.review.c3.time + FRAMES[a.range.timeframe]) * 1000,
            ) &&
          a.review.savedSeq >= a.committedSeq)),
    "Invalid study timeline",
  );
export const rrStudySchema = z
  .object({
    range: range.optional(),
    overlay: z.boolean(),
    draft: rrPlanSchema,
    attempts: z.array(attempt).max(1000),
    activeId: z.string().max(100).optional(),
  })
  .refine(
    (s) =>
      new Set(s.attempts.map((a) => a.id)).size === s.attempts.length &&
      (!s.activeId ||
        s.attempts.some(
          (a) => a.id === s.activeId && a.range.id === s.range?.id,
        )),
    "Unknown or duplicate study exercise",
  );
export const rrProgressSchema = z.object({
  version: z.string().max(120),
  selected: z.enum(RR_LESSON_IDS),
  completed: z.array(z.enum(RR_LESSON_IDS)).max(RR_LESSON_IDS.length),
});
