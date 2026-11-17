import test from "node:test";
import assert from "node:assert/strict";
import { FRAMES, DEFAULT_SPECS, type Bar } from "../src/types";
import {
  beginVisual,
  checkVisual,
  completedVisualBars,
  visualAnswerKey,
  visualBars,
  visualCases,
  visualConfirmation,
  visualGap,
  visualView,
  type VisualSnapshot,
} from "../src/core/visual-course";

const base = Date.UTC(2026, 0, 15) / 1000;
function bar(time: number, open = 100, high = 110, low = 90, close = 105): Bar {
  return { time, open, high, low, close, count: 50 };
}
function snapshot(): VisualSnapshot {
  const h4 = Array.from({ length: 8 }, (_, i) =>
    bar(base + i * 14400, 100, 110 + i, 90, 105),
  );
  return {
    version: "rr-visual-v1",
    id: "snapshot",
    sessionId: "session",
    dataset: "synthetic-test-only",
    cutoff: (base + 8 * 14400) * 1000,
    specs: DEFAULT_SPECS,
    frames: {
      "4H": h4,
      "15m": Array.from({ length: 128 }, (_, i) => bar(base + i * 900)),
      "1m": Array.from({ length: 1920 }, (_, i) => bar(base + i * 60)),
    },
  };
}
test("visual course sends no C3 or forming/future candles before explicit reveal, across all frames", () => {
  const s = snapshot();
  s.frames["4H"].push(bar(base + 8 * 14400, 100, 9000, 1, 8000));
  const c = beginVisual(s),
    view = visualView(c);
  assert.equal(view.c3, null);
  assert.equal(view.revealed, false);
  for (const tf of ["4H", "15m", "1m"] as const)
    assert.ok(
      view.frames[tf].every((b) => (b.time + FRAMES[tf]) * 1000 <= view.cutoff),
    );
  assert.ok(
    Object.values(view.frames)
      .flat()
      .every((b) => b.high !== 9000),
  );
  assert.ok(!("snapshot" in view));
});
test("visual reference requires consecutive complete candles and refuses data-gap pairs", () => {
  const s = snapshot();
  s.frames["4H"][2].gapBefore = { from: 0, to: 1 };
  const cases = visualCases(s);
  assert.ok(!cases.some((c) => c.c2.time === s.frames["4H"][2].time));
  assert.equal(
    completedVisualBars(
      [bar(base, 100, 95, 90, 105), bar(base)],
      "4H",
      (base + 14400) * 1000,
    ).length,
    1,
  );
});
test("practice mode withholds the answer key; guided and checked work are distinguished", () => {
  const c = beginVisual(snapshot());
  c.guided = false;
  assert.equal(visualView(c).key, null);
  c.attempts.push({
    id: c.activeId,
    caseTime: c.caseTime,
    step: c.step,
    guided: false,
    at: 1,
    answer: {},
    checks: checkVisual(c, {}),
  });
  assert.ok(visualView(c).key);
  c.activeId = "retry";
  assert.equal(visualView(c).key, null);
  assert.equal(visualView(c).history.length, 1);
});
test("wick high, wick low and body close are checked independently instead of accepting a body-high click", () => {
  const c = beginVisual(snapshot()),
    key = visualAnswerKey(c);
  assert.ok(checkVisual(c, key).every((x) => x.pass));
  const wrong = checkVisual(c, { high: 105, low: key.low, close: key.close });
  assert.equal(wrong[0].pass, false);
  assert.equal(wrong[1].pass, true);
});
test("sweep-and-reclaim beyond the opposite boundary is not graded as close-back-inside", () => {
  const c = beginVisual(snapshot());
  c.step = "sweep";
  const i = c.snapshot.frames["4H"].findIndex((b) => b.time === c.caseTime);
  c.snapshot.frames["4H"][i] = bar(c.caseTime, 100, 110, 90, 105);
  c.snapshot.frames["4H"][i + 1] = bar(c.caseTime + 14400, 100, 109, 85, 95);
  assert.ok(checkVisual(c, { classification: "sweep-low" })[0].pass);
  c.snapshot.frames["4H"][i + 1] = bar(c.caseTime + 14400, 100, 120, 85, 115);
  assert.equal(checkVisual(c, { classification: "sweep-low" })[0].pass, false);
  assert.equal(visualAnswerKey(c).classification, "two-sided");
});
test("FVG uses three consecutive closed wick ranges and keeps touch/overlap separate from a gap", () => {
  const c = beginVisual(snapshot());
  c.step = "fvg";
  const t = c.caseTime + 14400;
  c.snapshot.frames["15m"] = [
    bar(t, 100, 105, 95, 103),
    bar(t + 900, 103, 115, 100, 112),
    bar(t + 1800, 113, 118, 110, 116),
  ];
  const gap = visualGap(c)!;
  assert.equal(gap.direction, "bullish");
  assert.equal(gap.low, 105);
  assert.equal(gap.high, 110);
  assert.ok(
    checkVisual(c, { gap: "bullish", gapHigh: 110, gapLow: 105 }).every(
      (x) => x.pass,
    ),
  );
  c.snapshot.frames["15m"][2].low = 105;
  assert.equal(visualGap(c)!.direction, "none");
  c.snapshot.frames["15m"][2].gapBefore = { from: t, to: t + 900 };
  assert.equal(visualGap(c), null);
});
test("confirmation checks completed close, not a wick, and identifies the first eligible close", () => {
  const c = beginVisual(snapshot());
  c.step = "confirmation";
  const i = c.snapshot.frames["4H"].findIndex((b) => b.time === c.caseTime);
  c.snapshot.frames["4H"][i] = bar(c.caseTime, 100, 110, 90, 105);
  c.snapshot.frames["4H"][i + 1] = bar(c.caseTime + 14400, 100, 109, 85, 95);
  const t = c.caseTime + 14400;
  c.snapshot.frames["15m"] = [
    ...Array.from({ length: 8 }, (_, j) => bar(t - (8 - j) * 900)),
    bar(t, 100, 120, 95, 105),
    bar(t + 900, 105, 120, 100, 115),
  ];
  assert.equal(visualConfirmation(c).first?.time, t + 900);
  assert.equal(checkVisual(c, { confirmation: t })[0].pass, false);
  assert.equal(checkVisual(c, { confirmation: t + 900 })[0].pass, true);
});
test("plan distinguishes old C1 boundary from the actual sweep extreme and does not reward profit", () => {
  const c = beginVisual(snapshot());
  c.step = "plan";
  const i = c.snapshot.frames["4H"].findIndex((b) => b.time === c.caseTime);
  c.snapshot.frames["4H"][i] = bar(c.caseTime, 100, 110, 90, 105);
  c.snapshot.frames["4H"][i + 1] = bar(c.caseTime + 14400, 100, 109, 85, 95);
  const tight = checkVisual(c, {
    decision: "buy",
    entry: 100,
    sl: 89,
    tp: 120,
  });
  assert.equal(tight[0].pass, true);
  assert.equal(tight[1].pass, false);
  assert.ok(
    checkVisual(c, { decision: "buy", entry: 100, sl: 84, tp: 120 }).every(
      (x) => x.pass,
    ),
  );
  assert.equal(
    checkVisual(c, { decision: "sell", entry: 100, sl: 84, tp: 120 })[0].pass,
    false,
  );
  assert.ok(checkVisual(c, { decision: "wait" })[0].pass);
});
test("revealed history is bounded to actual C3 and does not include later candles", () => {
  const c = beginVisual(snapshot());
  c.revealed.push(c.caseTime);
  const v = visualView(c);
  assert.equal(v.c3?.time, c.caseTime + 28800);
  for (const tf of ["4H", "15m", "1m"] as const)
    assert.ok(
      visualBars(c, tf, true).every(
        (b) => (b.time + FRAMES[tf]) * 1000 <= c.caseTime * 1000 + 43200000,
      ),
    );
  assert.equal(
    checkVisual({ ...c, step: "review" }, { classification: "result" })[0].pass,
    false,
  );
});
