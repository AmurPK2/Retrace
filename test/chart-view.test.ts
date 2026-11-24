import test from "node:test";
import assert from "node:assert/strict";
import {
  captureChartRange,
  initialChartRange,
  selectTimeframeRange,
  timeAtLogical,
} from "../src/core/chart-view";
import { FRAMES, type TF, type ChartRange } from "../src/types";
const end = Date.UTC(2026, 0, 15, 16) / 1000;
const times = (tf: TF, n = 500) =>
  Array.from({ length: n }, (_, i) => end - (n - 1 - i) * FRAMES[tf]);
test("4H to 15m to 1m keeps candle spacing and replay position, instead of the wall-clock span", () => {
  let tf: TF = "4H",
    t = times(tf),
    range = captureChartRange(t, FRAMES[tf], tf, { from: 360, to: 507 });
  const width = range.to - range.from;
  for (const next of ["15m", "1m", "4H"] as TF[]) {
    const source = structuredClone(range);
    const selected = selectTimeframeRange(tf, next, range);
    t = times(next, 4000);
    const view = initialChartRange(t, FRAMES[next], selected.range, next);
    assert.equal(view.to - view.from, width);
    assert.equal(view.to - (t.length - 1), 8);
    assert.deepEqual(
      range,
      source,
      "Switching must not rewrite the original viewport",
    );
    range = captureChartRange(t, FRAMES[next], next, view);
    tf = next;
  }
});
test("returning to a timeframe restores its own zoom; replay-follow survives advancement", () => {
  const h4 = captureChartRange(times("4H"), 14400, "4H", {
    from: 450,
    to: 505,
  });
  const m15 = captureChartRange(times("15m"), 900, "15m", {
    from: 290,
    to: 510,
  });
  const selected = selectTimeframeRange("15m", "4H", m15, { "4H": h4 });
  const view = initialChartRange(times("4H", 510), 14400, selected.range, "4H");
  assert.equal(view.to - view.from, 55);
  assert.equal(view.to, 515);
  assert.equal(selected.ranges["15m"]?.to, 510);
});
test("a panned historical focus stays historical across frames and market breaks", () => {
  const t = times("4H");
  for (let i = 300; i < t.length; i++) t[i] += 2 * 86400;
  const source = captureChartRange(t, 14400, "4H", { from: 280, to: 320 });
  assert.equal(source.rightOffset, undefined);
  const target = times("15m", 10000);
  const selected = selectTimeframeRange("4H", "15m", source);
  const view = initialChartRange(target, 900, selected.range, "15m");
  assert.equal(view.to - view.from, 40);
  assert.equal(
    timeAtLogical(target, (view.from + view.to) / 2, 900),
    (source.fromTime! + source.toTime!) / 2,
  );
  const restored = initialChartRange(t, 14400, source, "4H");
  assert.equal(restored.from, 280);
  assert.equal(restored.to, 320);
});
test("an unavailable historical focus stays at the nearest real candles, not extrapolated whitespace", () => {
  const old = captureChartRange(times("4H"), 14400, "4H", {
    from: 30,
    to: 150,
  });
  const view = initialChartRange(times("1m", 100), 60, old, "1m");
  assert.equal(view.to - view.from, 120);
  assert.equal((view.from + view.to) / 2, 0);
  assert.ok(Number.isFinite(view.from));
  assert.ok(Number.isFinite(view.to));
});
test("legacy timestamp views retain their same-frame anchors and independent pane caches do not leak", () => {
  const legacy: ChartRange = {
    version: 3,
    from: 10,
    to: 90,
    fromTime: times("15m")[10],
    toTime: times("15m")[90],
  };
  const restored = initialChartRange(times("15m"), 900, legacy, "15m");
  assert.equal(restored.from, 10);
  assert.equal(restored.to, 90);
  const main = selectTimeframeRange("15m", "4H", legacy, {});
  const second = selectTimeframeRange("1H", "4H", undefined, {});
  assert.equal(second.range, undefined);
  assert.equal(main.ranges["15m"]?.timeframe, "15m");
  assert.equal(legacy.timeframe, undefined);
});

test("over-compressed legacy saves repair once; explicit new overview zoom is preserved", () => {
  const t = times("15m", 4000);
  const legacy: ChartRange = {
    version: 3,
    from: 1500,
    to: 4100,
    fromTime: t[1500],
    toTime: t.at(-1)! + 101 * 900,
  };
  const fixed = initialChartRange(t, 900, legacy, "15m");
  assert.equal(fixed.to - fixed.from, 147);
  assert.equal(fixed.to, 4007);
  const explicit = { ...legacy, timeframe: "15m" as const, rightOffset: 101 };
  const overview = initialChartRange(t, 900, explicit, "15m");
  assert.equal(overview.to - overview.from, 2600);
  assert.equal(legacy.from, 1500);
});
