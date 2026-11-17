import { FRAMES, type Bar, type Specs } from "../types";
import { classifyC2, type RRCandlePattern } from "./rr-study";

export const VISUAL_VERSION = "rr-visual-v1";
export const VISUAL_STEPS = [
  "candle",
  "range",
  "sweep",
  "frames",
  "fvg",
  "confirmation",
  "plan",
  "review",
] as const;
export type VisualStep = (typeof VISUAL_STEPS)[number];
export type VisualFrame = "4H" | "15m" | "1m";
export type VisualAnswer = {
  candle?: number;
  high?: number;
  low?: number;
  close?: number;
  classification?: string;
  gap?: string;
  gapHigh?: number;
  gapLow?: number;
  confirmation?: number | "none";
  decision?: "buy" | "sell" | "wait";
  entry?: number;
  sl?: number;
  tp?: number;
};
export type VisualCheck = { pass: boolean; text: string };
export type VisualAttempt = {
  id: string;
  caseTime: number;
  step: VisualStep;
  guided: boolean;
  at: number;
  answer: VisualAnswer;
  checks: VisualCheck[];
};
export type VisualSnapshot = {
  version: string;
  id: string;
  sessionId: string;
  dataset: string;
  cutoff: number;
  specs: Specs;
  frames: Record<VisualFrame, Bar[]>;
};
export type VisualCourse = {
  snapshot: VisualSnapshot;
  caseTime: number;
  step: VisualStep;
  guided: boolean;
  attempts: VisualAttempt[];
  revealed: number[];
  activeId: string;
};
export type VisualCase = { c1: Bar; c2: Bar; cutoff: number };
export const PATTERN_NB: Record<RRCandlePattern, string> = {
  "break-up": "Close over C1-high",
  "break-down": "Close under C1-low",
  "sweep-high": "Topp tatt · close innenfor",
  "sweep-low": "Bunn tatt · close innenfor",
  "two-sided": "Begge sider tatt",
  boundary: "Close på grensen",
  inside: "Innenfor · ingen sweep",
};
export function completedVisualBars(
  bars: Bar[],
  tf: VisualFrame,
  cutoff: number,
) {
  return bars.filter(
    (b) =>
      [b.time, b.open, b.high, b.low, b.close].every(Number.isFinite) &&
      b.low > 0 &&
      b.low <= Math.min(b.open, b.close) &&
      b.high >= Math.max(b.open, b.close) &&
      (b.time + FRAMES[tf]) * 1000 <= cutoff,
  );
}
export function visualCases(snapshot: VisualSnapshot): VisualCase[] {
  const h4 = completedVisualBars(snapshot.frames["4H"], "4H", snapshot.cutoff);
  return h4
    .slice(0, -1)
    .flatMap((c1, i) => {
      const c2 = h4[i + 1];
      return c2.time === c1.time + 14400 && !c2.gapBefore
        ? [{ c1, c2, cutoff: (c2.time + 14400) * 1000 }]
        : [];
    })
    .slice(-24);
}
export function visualCase(course: VisualCourse): VisualCase {
  const found = visualCases(course.snapshot).find(
    (c) => c.c1.time === course.caseTime,
  );
  if (!found)
    throw Error(
      "Referanseparet er ikke tilgjengelig i dette beslutningsgrunnlaget.",
    );
  return found;
}
export function beginVisual(snapshot: VisualSnapshot): VisualCourse {
  const cases = visualCases(snapshot);
  // Choose a historical pair with a known C3, but do not send C3 to the renderer.
  const candidate =
    [...cases]
      .reverse()
      .find((c) =>
        snapshot.frames["4H"].some(
          (b) =>
            b.time === c.c2.time + 14400 &&
            (b.time + 14400) * 1000 <= snapshot.cutoff,
        ),
      ) ?? cases.at(-1);
  if (!candidate)
    throw Error(
      "Last ned nok sammenhengende historikk til to ferdige 4H-candles først.",
    );
  return {
    snapshot,
    caseTime: candidate.c1.time,
    step: "candle",
    guided: true,
    attempts: [],
    revealed: [],
    activeId: snapshot.id + "-start",
  };
}
export function visualBars(
  course: VisualCourse,
  tf: VisualFrame,
  reveal = false,
) {
  const c = visualCase(course);
  const until = reveal
    ? Math.min(course.snapshot.cutoff, c.cutoff + 14400000)
    : c.cutoff;
  return completedVisualBars(course.snapshot.frames[tf], tf, until)
    .filter((b) => b.time >= c.c1.time - (tf === "4H" ? 12 * 14400 : 4 * 3600))
    .slice(tf === "4H" ? -16 : -140);
}
export function visualGap(course: VisualCourse) {
  const c = visualCase(course),
    bars = visualBars(course, "15m");
  const triples = bars.slice(2).flatMap((third, i) => {
    const first = bars[i],
      middle = bars[i + 1];
    if (
      first.time + 900 !== middle.time ||
      middle.time + 900 !== third.time ||
      middle.gapBefore ||
      third.gapBefore ||
      third.time < c.c2.time
    )
      return [];
    const direction =
      third.low > first.high
        ? "bullish"
        : third.high < first.low
          ? "bearish"
          : "none";
    return [
      {
        first,
        middle,
        third,
        direction,
        high:
          direction === "bullish"
            ? third.low
            : direction === "bearish"
              ? first.low
              : undefined,
        low:
          direction === "bullish"
            ? first.high
            : direction === "bearish"
              ? third.high
              : undefined,
      },
    ];
  });
  return (
    [...triples].reverse().find((x) => x.direction !== "none") ??
    triples.at(-1) ??
    null
  );
}
export function visualConfirmation(course: VisualCourse) {
  const c = visualCase(course),
    bars = visualBars(course, "15m"),
    pattern = classifyC2(c.c1, c.c2);
  const direction = ["sweep-low", "break-up"].includes(pattern)
    ? "buy"
    : ["sweep-high", "break-down"].includes(pattern)
      ? "sell"
      : "wait";
  const before = bars.filter((b) => b.time < c.c2.time).slice(-8);
  if (!before.length || direction === "wait")
    return { direction, level: null, first: null };
  const level =
    direction === "buy"
      ? Math.max(...before.map((b) => b.high))
      : Math.min(...before.map((b) => b.low));
  const first =
    bars.find(
      (b) =>
        b.time >= c.c2.time &&
        (direction === "buy" ? b.close > level : b.close < level),
    ) ?? null;
  return { direction, level, first };
}
export function visualAnswerKey(course: VisualCourse): VisualAnswer {
  const c = visualCase(course),
    gap = visualGap(course),
    confirmation = visualConfirmation(course);
  const sign = confirmation.direction === "sell" ? -1 : 1;
  const risk = Math.max(c.c1.high, c.c2.high) - Math.min(c.c1.low, c.c2.low);
  return {
    candle: course.step === "frames" ? c.c2.time : c.c1.time,
    high: c.c1.high,
    low: c.c1.low,
    close: c.c1.close,
    classification: classifyC2(c.c1, c.c2),
    gap: gap?.direction ?? "none",
    gapHigh: gap?.high,
    gapLow: gap?.low,
    confirmation: confirmation.first?.time ?? "none",
    decision: confirmation.direction as "buy" | "sell" | "wait",
    entry: c.c2.close,
    sl:
      sign === 1
        ? Math.min(c.c1.low, c.c2.low) - risk * 0.03
        : Math.max(c.c1.high, c.c2.high) + risk * 0.03,
    tp: c.c2.close + sign * risk * 2,
  };
}
export function checkVisual(
  course: VisualCourse,
  answer: VisualAnswer,
): VisualCheck[] {
  const c = visualCase(course),
    key = visualAnswerKey(course);
  const tolerance = Math.max(
    10 ** -course.snapshot.specs.precision * 2,
    (c.c1.high - c.c1.low) * 0.025,
  );
  const price = (
    value: number | undefined,
    expected: number | undefined,
    label: string,
  ): VisualCheck => ({
    pass:
      value !== undefined &&
      expected !== undefined &&
      Number.isFinite(value) &&
      Math.abs(value - expected) <= tolerance,
    text:
      label +
      ": " +
      (expected?.toFixed(course.snapshot.specs.precision) ??
        "ikke tilgjengelig"),
  });
  switch (course.step) {
    case "candle":
      return [
        price(answer.high, key.high, "High er øverste wick-spiss"),
        price(answer.low, key.low, "Low er nederste wick-spiss"),
        price(answer.close, key.close, "Close er kroppens sluttpris"),
      ];
    case "range":
      return [
        {
          pass: answer.candle === c.c1.time,
          text: "C1 er den ferdige 4H-candlen rett før C2. Referansen flyttes ikke etter svaret.",
        },
        price(answer.high, key.high, "C1-high"),
        price(answer.low, key.low, "C1-low"),
      ];
    case "sweep":
      return [
        {
          pass: answer.classification === key.classification,
          text:
            PATTERN_NB[key.classification as RRCandlePattern] +
            ". C2-close " +
            c.c2.close.toFixed(3) +
            "; C1-high " +
            c.c1.high.toFixed(3) +
            "; C1-low " +
            c.c1.low.toFixed(3) +
            ". Veke utenfor og close utenfor er ulike observasjoner. Dette gir ingen sikker retning for C3.",
        },
      ];
    case "frames":
      return [
        {
          pass:
            typeof answer.candle === "number" &&
            answer.candle >= c.c2.time &&
            answer.candle + 900 <= c.c2.time + 14400 &&
            visualBars(course, "15m").some((b) => b.time === answer.candle),
          text:
            "15m-candlen må ligge i den markerte C2-perioden, fra " +
            new Date(c.c2.time * 1000).toISOString().slice(11, 16) +
            " UTC. Begge visninger stopper ved samme tidspunkt.",
        },
      ];
    case "fvg": {
      const gap = visualGap(course);
      if (!gap)
        return [
          {
            pass: answer.gap === "none",
            text: "Ingen komplett sammenhengende tre-candle-sekvens er tilgjengelig. Manglende data er ikke en FVG.",
          },
        ];
      return [
        {
          pass: answer.gap === gap.direction,
          text:
            gap.direction === "none"
              ? "Wickene på candle 1 og 3 overlapper: ingen FVG i den markerte sekvensen."
              : (gap.direction === "bullish" ? "Bullish FVG" : "Bearish FVG") +
                ": gapet er mellom wickene på candle 1 og 3. Alle tre er ferdige ved beslutningstidspunktet.",
        },
        ...(gap.direction === "none"
          ? []
          : [
              price(answer.gapHigh, gap.high, "Øvre FVG-grense"),
              price(answer.gapLow, gap.low, "Nedre FVG-grense"),
            ]),
      ];
    }
    case "confirmation":
      return [
        {
          pass: answer.confirmation === key.confirmation,
          text:
            key.confirmation === "none"
              ? "Ingen slik 15m-stenging er bekreftet i det låste grunnlaget. Vent er riktig observasjon."
              : "Første 15m-stenging gjennom øvingsnivået: " +
                new Date((Number(key.confirmation) + 900) * 1000)
                  .toISOString()
                  .slice(11, 16) +
                " UTC. Dette er før C2s 4H-stenging; det kan ikke etterpå kalles en inngang etter 4H-bekreftelse. Øvingsnivået er ikke en universell RR/CISD-regel.",
        },
      ];
    case "plan": {
      if (answer.decision === "wait")
        return [
          {
            pass: true,
            text: "Vent er lagret før avsløring. Candle-geometri alene dokumenterer ingen komplett inngangsregel.",
          },
        ];
      const buy = answer.decision === "buy",
        valid = [answer.entry, answer.sl, answer.tp].every(
          (x) => typeof x === "number" && Number.isFinite(x) && x > 0,
        );
      return [
        {
          pass:
            valid &&
            (buy
              ? answer.sl! < answer.entry! && answer.tp! > answer.entry!
              : answer.sl! > answer.entry! && answer.tp! < answer.entry!),
          text: "Kjøp krever SL < entry < TP. Salg krever TP < entry < SL. Geometri alene godkjenner ikke en trade.",
        },
        {
          pass:
            valid &&
            (buy
              ? answer.sl! < Math.min(c.c1.low, c.c2.low)
              : answer.sl! > Math.max(c.c1.high, c.c2.high)),
          text: "Denne øvingen bruker uttrykkelig SL utenfor referanseparets ytterste wick. C1-grensen alene kan ligge innenfor sweepen. Dette er én valgt stopregel, ikke alle RR-varianter.",
        },
      ];
    }
    case "review":
      return [
        {
          pass: answer.classification === "decision",
          text: "Resultatet avgjør ikke om beslutningen fulgte reglene. Vi viser faktisk C3 etter at planen er låst; ingen inngang eller fylling antas.",
        },
      ];
  }
}
export function visualView(course: VisualCourse) {
  const c = visualCase(course),
    revealed = course.revealed.includes(course.caseTime);
  const last = course.attempts.find((a) => a.id === course.activeId);
  const explained = course.guided || !!last;
  const gap = visualGap(course),
    confirmation = visualConfirmation(course);
  const c3 = revealed
    ? (course.snapshot.frames["4H"].find(
        (b) =>
          b.time === c.c2.time + 14400 &&
          (b.time + 14400) * 1000 <= course.snapshot.cutoff,
      ) ?? null)
    : null;
  return {
    version: VISUAL_VERSION,
    snapshotId: course.snapshot.id,
    sessionId: course.snapshot.sessionId,
    dataset: course.snapshot.dataset,
    capturedAt: course.snapshot.cutoff,
    cutoff: c.cutoff,
    precision: course.snapshot.specs.precision,
    caseTime: course.caseTime,
    step: course.step,
    guided: course.guided,
    reference: c,
    frames: Object.fromEntries(
      (["4H", "15m", "1m"] as const).map((tf) => [
        tf,
        visualBars(course, tf, revealed),
      ]),
    ) as Record<VisualFrame, Bar[]>,
    cases: visualCases(course.snapshot).map((x) => ({
      time: x.c1.time,
      cutoff: x.cutoff,
    })),
    gap: gap
      ? {
          times: [gap.first.time, gap.middle.time, gap.third.time],
          ...(explained
            ? { direction: gap.direction, high: gap.high, low: gap.low }
            : {}),
        }
      : null,
    confirmation: {
      direction: confirmation.direction,
      level: confirmation.level,
    },
    key: explained ? visualAnswerKey(course) : null,
    last: last ?? null,
    history: course.attempts.map((a) => ({ ...a })),
    revealed,
    c3,
    canReveal:
      !!course.attempts.find(
        (a) => a.caseTime === course.caseTime && a.step === "plan",
      ) &&
      !!course.snapshot.frames["4H"].find(
        (b) =>
          b.time === c.c2.time + 14400 &&
          (b.time + 14400) * 1000 <= course.snapshot.cutoff,
      ),
  };
}
export type VisualView = ReturnType<typeof visualView>;
