import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseRRRange,
  classifyC2,
  rrStudyView,
  commitRRAttempt,
  partialRExample,
  rrC3Description,
  type RRPlan,
} from "../src/core/rr-study";
import { lessonSource, RR_LESSONS } from "../src/core/rr-lessons";
import { rrStudySchema } from "../electron/study-schema";
import type { Bar } from "../src/types";
const base = Date.UTC(2026, 0, 5) / 1000;
const c1: Bar = {
  time: base,
  open: 100,
  high: 110,
  low: 90,
  close: 105,
  count: 20,
};
const c2: Bar = {
  time: base + 900,
  open: 105,
  high: 113,
  low: 99,
  close: 104,
  count: 20,
};
const c3: Bar = {
  time: base + 1800,
  open: 104,
  high: 108,
  low: 88,
  close: 92,
  count: 20,
};
const plan: RRPlan = {
  decision: "short",
  objective: "C1 low",
  invalidation: "Acceptance above C2 high",
  confirmation: "Wait for a completed local close below the marked level",
};
const chosen = () =>
  chooseRRRange([c1, c2], (base + 1800) * 1000, 50, "15m", "range");

test("C2 geometry keeps body breaks, rejection sweeps, two-sided candles and boundary closes distinct", () => {
  const cases: [Partial<Bar>, string][] = [
    [{ high: 116, close: 114 }, "break-up"],
    [{ low: 86, high: 106, close: 88 }, "break-down"],
    [{}, "sweep-high"],
    [{ high: 108, low: 88, close: 96 }, "sweep-low"],
    [{ high: 114, low: 88, close: 112 }, "two-sided"],
    [{ high: 113, close: 110 }, "boundary"],
    [{ high: 108, low: 94, close: 100 }, "inside"],
  ];
  for (const [patch, expected] of cases)
    assert.equal(classifyC2(c1, { ...c2, ...patch }), expected);
});
test("reference selection uses two closed adjacent candles and cannot confirm a forming candle or bridge a gap", () => {
  const range = chosen();
  assert.equal(range.pattern, "sweep-high");
  assert.equal(range.c2.close, 104);
  assert.throws(
    () => chooseRRRange([c1, c2], (base + 1799) * 1000, 50, "15m", "x"),
    /closed candles/,
  );
  assert.throws(
    () =>
      chooseRRRange(
        [c1, { ...c2, time: base + 1800 }],
        (base + 3600) * 1000,
        50,
        "15m",
        "x",
      ),
    /consecutive/,
  );
  assert.throws(
    () =>
      chooseRRRange([c1, c2], (base + 1800) * 1000, 50, "15m", "x", c2.time),
    /closed candles/,
  );
});
test("study view omits later selections, equal-time later events and future C3 bars; missing history is explicit", () => {
  const range = chosen();
  assert.equal(
    rrStudyView(range, [c1, c2, c3], (base + 1799) * 1000).range,
    null,
  );
  assert.equal(
    rrStudyView(range, [c1, c2, c3], (base + 1800) * 1000, 49).range,
    null,
  );
  const before = { ...range, selectedAt: (base + 1799) * 1000 };
  assert.equal(
    rrStudyView(before, [c1, c2, c3], (base + 1799) * 1000).c3,
    null,
  );
  assert.equal(
    rrStudyView(range, [c1, c2], (base + 2700) * 1000, 50).coverage,
    "missing",
  );
  assert.equal(
    rrStudyView(range, [c1, c2, c3], (base + 2700) * 1000, 50).c3Closed,
    true,
  );
});
test("saved practice records already-visible C3 honestly and freezes the original idea and candles", () => {
  const range = chosen(),
    draft = { ...plan },
    forming = { ...c3, high: 104, low: 104, close: 104, count: 1 };
  const attempt = commitRRAttempt(
    range,
    draft,
    "candles",
    [c1, c2, forming],
    (base + 1801) * 1000,
    51,
    "a",
  );
  assert.equal(attempt.exposure, "developing");
  assert.equal(attempt.visibleC3!.low, 104);
  range.c1.high = 999;
  draft.objective = "rewritten";
  forming.low = 1;
  assert.equal(attempt.range.c1.high, 110);
  assert.equal(attempt.plan.objective, "C1 low");
  assert.equal(attempt.visibleC3!.low, 104);
  assert.equal(
    commitRRAttempt(
      chosen(),
      plan,
      "candles",
      [c1, c2, c3],
      (base + 2700) * 1000,
      70,
      "b",
    ).exposure,
    "already-closed",
  );
  assert.equal(
    commitRRAttempt(
      chosen(),
      plan,
      "candles",
      [c1, c2],
      (base + 1800) * 1000,
      50,
      "c",
    ).exposure,
    "unseen",
  );
});
test("directional plans need objective and invalidation; skips need a reason rather than a fabricated entry", () => {
  assert.throws(
    () =>
      commitRRAttempt(
        chosen(),
        { ...plan, invalidation: "" },
        "risk",
        [c1, c2],
        (base + 1800) * 1000,
        50,
        "a",
      ),
    /invalidation/,
  );
  assert.throws(
    () =>
      commitRRAttempt(
        chosen(),
        { ...plan, confirmation: " " },
        "review",
        [c1, c2],
        (base + 1800) * 1000,
        50,
        "a",
      ),
    /reason to skip/,
  );
  const skip = commitRRAttempt(
    chosen(),
    {
      decision: "skip",
      objective: "",
      invalidation: "",
      confirmation: "No clean confirmation",
    },
    "review",
    [c1, c2],
    (base + 1800) * 1000,
    50,
    "a",
  );
  assert.equal(skip.plan.decision, "skip");
});
test("partial-exit examples preserve the original denominator at zero, half and full TP1 allocations", () => {
  const half = partialRExample(4053, 4060, 4045, 4035, 50)!;
  assert.equal(half.risk, 7);
  assert.ok(Math.abs(half.fullR - 13 / 7) < 1e-12);
  assert.ok(Math.abs(half.runnerBeR - 4 / 7) < 1e-12);
  assert.equal(partialRExample(4053, 4060, 4045, 4035, 0)!.fullR, 18 / 7);
  assert.equal(partialRExample(4053, 4060, 4045, 4035, 100)!.fullR, 8 / 7);
  assert.equal(partialRExample(100, 95, 105, 110, 50)!.fullR, 1.5);
  for (const args of [
    [100, 100, 105, 110, 50],
    [100, 95, 90, 110, 50],
    [100, 95, 105, 110, 101],
    [NaN, 95, 105, 110, 50],
  ])
    assert.equal(
      partialRExample(...(args as [number, number, number, number, number])),
      null,
    );
});
test("lesson links resolve only compiled source IDs, never a supplied URL or arbitrary external destination", () => {
  assert.equal(RR_LESSONS.length, 6);
  assert.match(
    lessonSource("candles", 0),
    /^https:\/\/www\.youtube\.com\/watch\?v=8-iZA5x-Vmg&t=214s$/,
  );
  for (const [id, index] of [
    ["https://example.com", 0],
    ["candles", -1],
    ["context", 99],
    ["risk", 0.5],
  ])
    assert.throws(() => lessonSource(id, index), /Unknown lesson/);
});
test("study backup rejects forged geometry, inconsistent timelines and duplicate attempts", () => {
  const attempt = commitRRAttempt(
    chosen(),
    plan,
    "candles",
    [c1, c2],
    (base + 1800) * 1000,
    50,
    "a",
  );
  const study = {
    range: chosen(),
    overlay: true,
    draft: plan,
    attempts: [attempt],
    activeId: "a",
  };
  assert.equal(rrStudySchema.safeParse(study).success, true);
  assert.equal(
    rrStudySchema.safeParse({
      ...study,
      range: { ...chosen(), pattern: "break-up" },
    }).success,
    false,
  );
  assert.equal(
    rrStudySchema.safeParse({ ...study, attempts: [attempt, attempt] }).success,
    false,
  );
  assert.equal(
    rrStudySchema.safeParse({
      ...study,
      attempts: [
        {
          ...attempt,
          review: {
            c3,
            savedAt: (base + 2000) * 1000,
            savedSeq: 60,
            reflection: "future",
          },
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    rrC3Description(c3, c1),
    "Closed below its open · reached C1 low.",
  );
});
