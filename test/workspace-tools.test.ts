import {configureFeedGroups} from "../electron/feed-journal";
configureFeedGroups({"example-one":"Example One","example-three":"Example Three"});
import test from "node:test";
import assert from "node:assert/strict";
import { calculateFormula, FORMULA_PRESETS } from "../src/core/formulas";
import {
  drawingHandles,
  drawingScreenHandles,
  moveDrawing,
  finishDrawing,
  planLevels,
  clipRay,
} from "../src/core/drawings";
import { validateFeed } from "../electron/telegram-feed";
import {
  alpha,
  DEFAULT_APPEARANCE,
  migrateAppearance,
  appearanceVariables,
  PALETTES,
  SHELL,
} from "../src/core/appearance";
import { limitSide, moveDraftEntry } from "../src/core/order-draft";
import { snapDrawingPoint } from "../src/core/magnet";
import type { Bar, Drawing } from "../src/types";
const bars: Bar[] = Array.from({ length: 80 }, (_, i) => ({
  time: 1700000000 + i * 60,
  open: i + 1,
  high: i + 3,
  low: i,
  close: i + 2,
  count: 1,
}));
const drawing: Drawing = {
  id: "test",
  kind: "horizontal",
  a: { time: 0, price: 2000 },
  b: { time: 60, price: 2000 },
  color: "#ffffff",
  locked: false,
  label: "",
  levels: [],
  createdCursor: 0,
};
test("horizontal drawings have one handle whose line follows the pointer", () => {
  for (const kind of ["horizontal"] as const) {
    const d = { ...drawing, kind };
    assert.equal(drawingHandles(d).length, 1);
    const p = { time: 300, price: 2025 };
    const moved = moveDrawing(d, p, d.a, "a");
    assert.deepEqual(moved.a, p);
    assert.deepEqual(moved.b, p);
    assert.deepEqual(finishDrawing(d, p).a, p);
  }
});
test("ray anchors are independent and extend through the second point in either direction", () => {
  const ray = {
    ...drawing,
    kind: "ray" as const,
    a: { time: 10, price: 10 },
    b: { time: 20, price: 20 },
  };
  assert.equal(drawingHandles(ray).length, 2);
  const moved = moveDrawing(ray, { time: 30, price: 25 }, ray.b, "b");
  assert.deepEqual(moved.a, ray.a);
  assert.deepEqual(moved.b, { time: 30, price: 25 });
  assert.deepEqual(finishDrawing(ray, { time: 40, price: 30 }).a, ray.a);
  const bounds = { left: 0, right: 100, top: 0, bottom: 100 };
  assert.deepEqual(clipRay({ x: 10, y: 10 }, { x: 20, y: 20 }, bounds), {
    x1: 10,
    y1: 10,
    x2: 100,
    y2: 100,
  });
  assert.deepEqual(clipRay({ x: 80, y: 20 }, { x: 60, y: 40 }, bounds), {
    x1: 80,
    y1: 20,
    x2: 0,
    y2: 100,
  });
  assert.deepEqual(clipRay({ x: 40, y: 60 }, { x: 40, y: 20 }, bounds), {
    x1: 40,
    y1: 60,
    x2: 40,
    y2: 0,
  });
  assert.equal(clipRay({ x: 10, y: 10 }, { x: 10, y: 10 }, bounds), null);
  assert.equal(clipRay({ x: -10, y: 50 }, { x: -20, y: 50 }, bounds), null);
});
test("planning TP is independent; changing SL never silently resets TP to 2R", () => {
  const d: Drawing = {
    ...drawing,
    kind: "long",
    b: { time: 60, price: 1990 },
    target: 2035,
    lots: 0.02,
  };
  assert.equal(drawingHandles(d).length, 5);
  const stop = moveDrawing(d, { time: 120, price: 1985 }, d.b, "b");
  assert.equal(planLevels(stop).sl, 1985);
  assert.equal(planLevels(stop).tp, 2035);
  const tp = moveDrawing(stop, { time: 120, price: 2040 }, d.a, "tp");
  assert.equal(planLevels(tp).tp, 2040);
  assert.equal(planLevels(tp).sl, 1985);
  const shifted = moveDrawing(d, { time: 30, price: 2005 }, d.a);
  assert.equal(shifted.a.price, 2005);
  assert.equal(shifted.b.price, 1995);
  assert.equal(shifted.target, 2040);
});
test("indicator formulas calculate independently checkable moving averages, shifts and comparisons", () => {
  const plots = calculateFormula(
    'fast = ta.sma(close, 3)\nplot(fast, "SMA", "#ffffff")\nplot(close - close[1], "Change", "#123456")\nplot(close > 5 ? 1 : 0, "Flag", "#abcdef")',
    bars,
  );
  assert.equal(plots[0].values[0].value, 3);
  assert.equal(plots[0].values[0].time, bars[2].time);
  assert.equal(plots[1].values[0].value, 1);
  assert.equal(plots[2].values[0].value, 0);
  assert.equal(plots[2].values.at(-1)!.value, 1);
  for (const preset of FORMULA_PRESETS)
    assert.ok(calculateFormula(preset.code, bars).length > 0);
});
test("formula engine rejects native code, imports, loops, future indexes and excessive work", () => {
  for (const code of [
    "plot(close[-1])",
    "plot(process.exit())",
    "while(true) {}",
    'import x from "fs"',
    "plot(fetch(close))",
    "plot(close.constructor)",
    "plot(ta.sma(close, 99999))",
  ])
    assert.throws(() => calculateFormula(code, bars), code);
  assert.throws(() =>
    calculateFormula(
      "plot(" + "(".repeat(40) + "close" + ")".repeat(40) + ")",
      bars,
    ),
  );
});
test("custom indicator warmup cannot bridge an unknown historical gap", () => {
  const source = bars.slice(0, 6).map((b, i) => ({
    ...b,
    close: i < 3 ? 100 : 300,
    ...(i === 3
      ? { gapBefore: { from: b.time * 1000 - 60000, to: b.time * 1000 } }
      : {}),
  }));
  const output = calculateFormula(
    'plot(ta.ema(close, 2), "EMA", "#ffffff")',
    source,
  )[0];
  assert.equal(
    output.values.some((p) => p.time === source[3].time),
    false,
  );
  assert.equal(output.values.at(-1)!.value, 300);
});
test("Telegram panel accepts only the selected group, plain bounded text and matching snapshots", () => {
  const input = {
    group: "example-one",
    live: true,
    observedAt: 1700000000000,
    messages: [
      {
        id: 2,
        time: 1700000000000,
        text: "<script>not executable</script>",
        hasMedia: false,
      },
    ],
  };
  const value = validateFeed(input, "example-one");
  assert.equal(value.messages[0].text, input.messages[0].text);
  assert.throws(() => validateFeed(input, "example-three"));
  assert.throws(() =>
    validateFeed(
      {
        ...input,
        messages: [{ ...input.messages[0], text: "x".repeat(6001) }],
      },
      "example-one",
    ),
  );
});
test("appearance opacity is bounded and deterministic", () => {
  assert.equal(alpha("#000000", 0), "#00000000");
  assert.equal(alpha("#ffffff", 100), "#ffffffff");
});
test("rectangle edge handles resize one dimension, while body dragging preserves size", () => {
  const d: Drawing = {
    ...drawing,
    kind: "zone",
    a: { time: 0, price: 2020 },
    b: { time: 100, price: 2000 },
  };
  assert.equal(drawingHandles(d).length, 8);
  const wider = moveDrawing(d, { time: 150, price: 2010 }, d.b, "e");
  assert.equal(wider.b.time, 150);
  assert.equal(wider.a.price, 2020);
  assert.equal(wider.b.price, 2000);
  const taller = moveDrawing(d, { time: 50, price: 2030 }, d.a, "n");
  assert.equal(taller.a.price, 2030);
  assert.equal(taller.b.time, 100);
  const moved = moveDrawing(
    d,
    { time: 20, price: 2005 },
    { time: 0, price: 2000 },
  );
  assert.equal(moved.b.time - moved.a.time, 100);
  assert.equal(moved.a.price - moved.b.price, 20);
});
test("position width can change without moving entry, SL or TP", () => {
  const d: Drawing = {
    ...drawing,
    kind: "long",
    b: { time: 100, price: 1990 },
    target: 2030,
  };
  const wider = moveDrawing(d, { time: 180, price: 2050 }, d.b, "width");
  assert.equal(wider.b.time, 180);
  assert.deepEqual(planLevels(wider), { entry: 2000, sl: 1990, tp: 2030 });
});
test("weak magnet uses a small OHLC radius; strong and off modes are distinct", () => {
  const source = [
      { time: 60, open: 100, high: 110, low: 90, close: 105, count: 1 },
    ],
    x = (t: number) => t,
    y = (p: number) => p;
  assert.equal(
    snapDrawingPoint({ time: 61, price: 106 }, source, 61, 106, x, y, "weak")
      .point.price,
    105,
  );
  assert.equal(
    snapDrawingPoint({ time: 61, price: 122 }, source, 61, 122, x, y, "weak")
      .snapped,
    false,
  );
  assert.equal(
    snapDrawingPoint({ time: 61, price: 122 }, source, 61, 122, x, y, "strong")
      .point.price,
    110,
  );
  assert.equal(
    snapDrawingPoint({ time: 61, price: 106 }, source, 61, 106, x, y, "off")
      .point.price,
    106,
  );
  assert.equal(
    snapDrawingPoint(
      { time: 200, price: 106 },
      source,
      200,
      106,
      x,
      y,
      "strong",
    ).snapped,
    false,
  );
});
test("limit draft automatically chooses side around the visible bid without submitting", () => {
  assert.equal(limitSide(2001, 2000), "sell");
  assert.equal(limitSide(1999, 2000), "buy");
  assert.equal(limitSide(2000, 2000), "buy");
  assert.throws(() => limitSide(NaN, 2000));
});
test("automatic limit entry drag preserves risk/reward distances and flips SL/TP correctly with side", () => {
  const original = {
    side: "buy" as const,
    kind: "limit" as const,
    entry: 2000,
    sl: 1990,
    tp: 2020,
    lots: 0.02,
    autoSide: true,
  };
  const sell = moveDraftEntry(original, 2010, 2005);
  assert.equal(sell.side, "sell");
  assert.equal(sell.sl, 2020);
  assert.equal(sell.tp, 1990);
  const buy = moveDraftEntry(original, 1995, 2005);
  assert.equal(buy.side, "buy");
  assert.equal(buy.sl, 1985);
  assert.equal(buy.tp, 2015);
});

test("rectangle grips remain on the visible edges across compressed weekend time and reversed anchors", () => {
  const d = {
    kind: "zone",
    a: { time: 300, price: 10 },
    b: { time: 100, price: 20 },
  } as Drawing;
  const x = (t: number) => (t === 100 ? 70 : t === 300 ? 270 : 0);
  const y = (p: number) => 400 - p * 10;
  const points = drawingScreenHandles(d, x, y);
  assert.deepEqual(
    points.find((p) => p.key === "nw"),
    { key: "nw", x: 70, y: 200 },
  );
  assert.deepEqual(
    points.find((p) => p.key === "e"),
    { key: "e", x: 270, y: 250 },
  );
  assert.deepEqual(
    points.find((p) => p.key === "n"),
    { key: "n", x: 170, y: 200 },
  );
  assert.equal(points.length, 8);
});

test("rolling formula extrema match independent windows and restart after an unknown gap", () => {
  const values = [3, 1, 5, 2, 4, 9, 7, 6, 8];
  const source = values.map((close, i) => ({
    ...bars[i],
    close,
    ...(i === 5 ? { gapBefore: { from: 0, to: 1 } } : {}),
  }));
  const plots = calculateFormula(
    "plot(ta.highest(close,3))\nplot(ta.lowest(close,3))",
    source,
  );
  assert.deepEqual(
    plots[0].values.map((p) => p.value),
    [5, 5, 5, 9, 8],
  );
  assert.deepEqual(
    plots[1].values.map((p) => p.value),
    [1, 1, 2, 6, 6],
  );
});

test("saved old theme names migrate without losing opacity or creating an undefined startup palette", () => {
  const mapping = {
    black: "cyber",
    night: "midnight",
    slate: "midnight",
    light: "lavender",
    aurum: "claude",
  } as const;
  for (const [old, next] of Object.entries(mapping)) {
    const look = migrateAppearance({
      ...DEFAULT_APPEARANCE,
      preset: old,
      zoneOpacity: 37,
      panelOpacity: 88,
    });
    assert.equal(look.preset, next);
    assert.equal(look.zoneOpacity, 37);
    assert.equal(look.panelOpacity, 88);
    assert.equal(appearanceVariables(look)["--chart-bg"], PALETTES[next].bg);
    assert.equal(appearanceVariables(look)["--bg"], SHELL.bg);
  }
  assert.equal(
    migrateAppearance({ ...DEFAULT_APPEARANCE, preset: "__proto__" }).preset,
    "cyber",
  );
  const accurate = migrateAppearance({
    ...DEFAULT_APPEARANCE,
    preset: "accurate",
  });
  const accurateVars = appearanceVariables(accurate);
  assert.equal(accurate.preset, "accurate");
  assert.equal(accurateVars["--chart-bg"], "#0C0D0B");
  assert.equal(accurateVars["--bg"], "#0C0D0B");
  assert.equal(PALETTES.accurate.up, "#FF8A1E");
  assert.equal(PALETTES.accurate.down, "#8A8A8A");
  for (const preset of [
    "cyber",
    "midnight",
    "phantom",
    "lavender",
    "claude",
  ] as const) {
    assert.equal(
      appearanceVariables({ ...accurate, preset })["--bg"],
      SHELL.bg,
    );
  }
});
