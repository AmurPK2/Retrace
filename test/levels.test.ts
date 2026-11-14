import test from "node:test";
import assert from "node:assert/strict";
import { calculateLevels } from "../src/core/levels";
import type { Bar, Indicator } from "../src/types";
test("Asian levels use minute boundaries in the display timezone, not whole higher candles or UTC day", () => {
  const cutoff = Date.UTC(2026, 10, 2, 8),
    ticks: [number, number][] = [
      [Date.UTC(2026, 10, 1, 23), 2000],
      [Date.UTC(2026, 10, 2, 4), 2010],
      [Date.UTC(2026, 10, 2, 6), 2099],
    ];
  const bars: Bar[] = ticks.map(([t, p]) => ({
    time: t / 1000,
    open: p,
    high: p,
    low: p,
    close: p,
    count: 1,
  }));
  const indicators: Indicator[] = [
    {
      id: "asian",
      kind: "asian",
      period: 14,
      color: "#aabbcc",
      enabled: true,
      start: 0,
      end: 6,
    },
  ];
  const levels = calculateLevels(bars, cutoff, "Europe/Oslo", indicators);
  assert.equal(levels.find((l) => l.label === "Asia H")!.price, 2010);
  assert.equal(levels.find((l) => l.label === "Asia L")!.price, 2000);
});
test("previous-day levels mark incomplete coverage rather than implying a verified full day", () => {
  const cutoff = Date.UTC(2026, 10, 2, 8),
    bars: Bar[] = [
      {
        time: Date.UTC(2026, 10, 1, 12) / 1000,
        open: 2000,
        high: 2020,
        low: 1990,
        close: 2010,
        count: 20,
      },
    ];
  const levels = calculateLevels(
    bars,
    cutoff,
    "UTC",
    [
      {
        id: "p",
        kind: "previous",
        period: 14,
        color: "#aabbcc",
        enabled: true,
      },
    ],
    () => false,
  );
  assert.equal(levels[0].complete, false);
  assert.match(levels[0].label, /incomplete/);
});
