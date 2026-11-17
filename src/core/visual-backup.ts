import { z } from "zod";
import {
  VISUAL_STEPS,
  VISUAL_VERSION,
  checkVisual,
  visualCase,
  visualCases,
  type VisualCourse,
} from "./visual-course";
const number = z.number().finite().positive();
const bar = z.object({
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
  count: z.number().finite().nonnegative(),
  gapBefore: z
    .object({ from: z.number().finite(), to: z.number().finite() })
    .optional(),
});
export const visualAnswerSchema = z
  .object({
    candle: number.optional(),
    high: number.optional(),
    low: number.optional(),
    close: number.optional(),
    classification: z.string().max(50).optional(),
    gap: z.enum(["bullish", "bearish", "none"]).optional(),
    gapHigh: number.optional(),
    gapLow: number.optional(),
    confirmation: z.union([number, z.literal("none")]).optional(),
    decision: z.enum(["buy", "sell", "wait"]).optional(),
    entry: number.optional(),
    sl: number.optional(),
    tp: number.optional(),
  })
  .strict();
const schema = z.object({
  snapshot: z.object({
    version: z.literal(VISUAL_VERSION),
    id: z.string().max(100),
    sessionId: z.string().max(100),
    dataset: z.string().max(200),
    cutoff: number,
    specs: z
      .object({
        contract: number,
        minLot: number,
        lotStep: number,
        leverage: number,
        commission: z.number().finite(),
        slippage: z.number().finite(),
        swapLong: z.number().finite(),
        swapShort: z.number().finite(),
        stopOut: z.number().finite(),
        precision: z.number().int().min(0).max(10),
      })
      .passthrough(),
    frames: z.object({
      "4H": z.array(bar).max(1800),
      "15m": z.array(bar).max(4000),
      "1m": z.array(bar).max(5000),
    }),
  }),
  caseTime: number,
  step: z.enum(VISUAL_STEPS),
  guided: z.boolean(),
  activeId: z.string().max(100),
  revealed: z.array(number).max(50),
  attempts: z
    .array(
      z.object({
        id: z.string().max(100),
        caseTime: number,
        step: z.enum(VISUAL_STEPS),
        guided: z.boolean(),
        at: number,
        answer: visualAnswerSchema,
        checks: z
          .array(z.object({ pass: z.boolean(), text: z.string().max(3000) }))
          .max(10),
      }),
    )
    .max(200),
});
export function restoreVisualBackup(
  input: unknown,
  session: { id: string; dataset: string; tick: { t: number } },
  importedId: string,
): VisualCourse {
  const parsed = schema.parse(input) as VisualCourse;
  if (
    parsed.snapshot.sessionId !== session.id ||
    parsed.snapshot.dataset !== session.dataset ||
    parsed.snapshot.cutoff > session.tick.t
  )
    throw Error(
      "Visual course backup does not match the session or replay cutoff.",
    );
  const choices = visualCases(parsed.snapshot);
  visualCase(parsed);
  for (const a of parsed.attempts) {
    if (!choices.some((c) => c.c1.time === a.caseTime))
      throw Error("Unknown visual attempt reference.");
    a.checks = checkVisual(
      { ...parsed, caseTime: a.caseTime, step: a.step },
      a.answer,
    );
  }
  for (const time of parsed.revealed) {
    const c = choices.find((c) => c.c1.time === time);
    if (
      !c ||
      !parsed.attempts.some((a) => a.caseTime === time && a.step === "plan") ||
      !parsed.snapshot.frames["4H"].some(
        (b) =>
          b.time === c.c2.time + 14400 &&
          (b.time + 14400) * 1000 <= parsed.snapshot.cutoff,
      )
    )
      throw Error("Invalid visual reveal in backup.");
  }
  parsed.snapshot.sessionId = importedId;
  return parsed;
}
