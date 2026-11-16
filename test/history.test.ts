import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { Store } from "../src/data/store";
import { Replay } from "../src/core/replay";
import { fromTicks, sma, ema, rsi, atr } from "../src/core/bars";
import {
  chartTimeline,
  chartBreaks,
  timeAtLogical,
  logicalAtTime,
  initialChartRange,
  axisLabel,
  candleLabel,
} from "../src/core/chart-view";
import type { Bar } from "../src/types";

test("older verified daily context survives a missing hour; incomplete buckets and future cached prices stay hidden", () => {
  const cache = path.resolve(".cache/test-databases");
  mkdirSync(cache, { recursive: true });
  const root = mkdtempSync(path.join(cache, "history-")),
    store = new Store(root);
  const base = Date.UTC(2026, 7, 1),
    hour = 3600000,
    chosen = base + 55 * 86400000 + 12 * hour;
  try {
    store.transaction(() => {
      const chunk = store.db.prepare(
        "INSERT INTO chunks VALUES(?,?,?,?,?,?,?,?,?,?)",
      );
      const minute = store.db.prepare("INSERT INTO bars VALUES(?,?,?,?,?,?,?)");
      const hourly = store.db.prepare(
        "INSERT INTO hourbars VALUES(?,?,?,?,?,?,?)",
      );
      for (let h = 0; h < 65 * 24; h++) {
        const t = base + h * hour,
          price = 2000 + h / 100,
          high = t >= chosen ? 9999 : price + 1;
        chunk.run(
          "fixture",
          t,
          "ready",
          "",
          2,
          t,
          t + 1800000,
          64,
          "",
          JSON.stringify({ synthetic: true }),
        );
        minute.run("fixture", t / 1000, price, price, price, price, 1);
        minute.run("fixture", t / 1000 + 1800, high, high, high, high, 1);
        hourly.run("fixture", t / 1000, price, high, price, high, 2);
      }
      // Leave cached prices behind: chunk validity must control what is shown.
      store.db
        .prepare("DELETE FROM chunks WHERE dataset=? AND hour=?")
        .run("fixture", base + 35 * 86400000 + 12 * hour);
    });
    const ticks = [
      { t: chosen, bid: 2200, ask: 2200.5 },
      { t: chosen + 1800000, bid: 9999, ask: 9999.5 },
    ];
    store.putChunk(
      store.writeTicks("fixture", chosen, ticks, { synthetic: true }, 64),
      fromTicks(ticks),
    );
    const replay = new Replay(store),
      s = replay.newSession("fixture", chosen);
    const daily = replay.bars("1D");
    assert.ok(daily.length > 45, `Only ${daily.length} daily candles`);
    assert.equal(
      daily.some((b) => b.time === (base + 35 * 86400000) / 1000),
      false,
    );
    assert.ok(daily.some((b) => b.gapBefore?.from === base + 35 * 86400000));
    assert.ok(daily[0].time < (base + 10 * 86400000) / 1000);
    for (const tf of ["15m", "1H", "4H", "1D"] as const) {
      const bars = replay.bars(tf);
      assert.ok(bars.every((b) => b.time * 1000 <= s.tick.t));
      assert.ok(
        bars.every((b) => b.high < 9000),
        `${tf} exposed a future cached price`,
      );
      assert.equal(bars.at(-1)!.close, 2200);
    }
    const gap = base + 35 * 86400000 + 12 * hour;
    assert.equal(
      replay.bars("1H").some((b) => b.time === gap / 1000),
      false,
    );
  } finally {
    store.close();
    if (!path.resolve(root).startsWith(cache + path.sep))
      throw Error("Unsafe test cleanup");
    rmSync(root, { recursive: true, force: true });
  }
});

test("indicator warmup restarts after a data gap and does not connect different price regimes", () => {
  const bars: Bar[] = [100, 102, 104, 300, 302, 304].map((close, i) => ({
    time: i * 60,
    open: close,
    high: close,
    low: close,
    close,
    count: 1,
    ...(i === 3 ? { gapBefore: { from: 120000, to: 180000 } } : {}),
  }));
  assert.equal(
    sma(bars, 2).find((b) => b.time === 180),
    undefined,
  );
  assert.equal(
    ema(bars, 2).find((b) => b.time === 180),
    undefined,
  );
  assert.equal(sma(bars, 2).find((b) => b.time === 240)!.value, 301);
  assert.equal(ema(bars, 2).find((b) => b.time === 240)!.value, 301);
  assert.equal(
    rsi(bars, 2).find((b) => b.time === 240),
    undefined,
  );
  assert.equal(atr(bars, 2).find((b) => b.time === 240)!.value, 1);
});

test("chart compresses missing time without fake candles; drawings retain timestamps and old spacing resets", () => {
  const bar = (time: number): Bar => ({
    time,
    open: 2000,
    high: 2001,
    low: 1999,
    close: 2000,
    count: 1,
  });
  const bars = [
    bar(0),
    bar(60),
    { ...bar(240), gapBefore: { from: 120000, to: 240000 } },
  ];
  const points = chartTimeline(bars, "1m"),
    times = points.map((p) => p.time);
  assert.deepEqual(times, [0, 60, 240]);
  assert.equal(points[2].open, 2000);
  assert.equal(chartBreaks(bars, "1m")[0].missing, true);
  assert.equal(timeAtLogical(times, 1.5, 60), 150);
  assert.equal(logicalAtTime(times, 150, 60), 1.5);
  assert.deepEqual(
    initialChartRange([0, 60, 120, 180], 60, { from: -1000, to: 200 }),
    { from: -2, to: 11 },
  );
  const restored = initialChartRange([0, 60, 120, 180], 60, {
    from: 0,
    to: 2,
    version: 3,
    anchor: 60,
  });
  assert.equal(restored.from, 1);
  assert.equal(restored.to, 3);
  const anchored = initialChartRange([0, 60, 240], 60, {
    version: 3,
    from: 1,
    to: 4,
    fromTime: 60,
    toTime: 300,
  });
  assert.equal(anchored.from, 0);
  assert.equal(anchored.to, 4); // minimum four candles, same center
  const weekend = [bar(60), bar(60 + 2 * 86400)];
  assert.equal(chartTimeline(weekend, "1m").length, 2);
  assert.equal(chartBreaks(weekend, "1m")[0].missing, false);
});

test("axis and crosshair labels follow timeframe, display zone and UTC daily buckets", () => {
  const t = Date.UTC(2026, 0, 8, 0) / 1000;
  assert.equal(axisLabel(t + 15 * 60, "15m", "Europe/Oslo", false, 3), "01:15");
  assert.match(axisLabel(t, "1D", "Europe/Oslo", false, 2), /8.*Jan/);
  assert.doesNotMatch(axisLabel(t, "1D", "Europe/Oslo", false, 2), /01:00/);
  assert.match(candleLabel(t, "1D", "Europe/Oslo", false), /UTC/);
  assert.doesNotMatch(candleLabel(t, "1D", "Europe/Oslo", false), /01:00/);
  assert.equal(axisLabel(t, "1D", "Europe/Oslo", true, 2), "Day");
});
