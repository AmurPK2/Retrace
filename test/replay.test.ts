import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { Store } from "../src/data/store";
import { Replay } from "../src/core/replay";
import { place } from "../src/core/broker";
import {
  fromTicks,
  aggregate,
  ema,
  rsi,
  knownClosure,
  sessionFlags,
} from "../src/core/bars";
import { parseTimestamp } from "../src/data/csv";
import { buildContext } from "../src/ai/context";
// Isolated synthetic fixture, never installed into the user's data directory.
function fixture() {
  const cache = path.resolve(".cache/test-databases");
  mkdirSync(cache, { recursive: true });
  const root = mkdtempSync(path.join(cache, "xau-replay-test-")),
    store = new Store(root),
    base = Date.UTC(2026, 10, 2, 0);
  for (let h = 0; h < 60; h++) {
    const hour = base + h * 3600000;
    const ticks = Array.from({ length: 60 }, (_, i) => ({
      t: hour + i * 60000,
      bid: 2000 + h + i / 100,
      ask: 2000.5 + h + i / 100,
    }));
    const c = store.writeTicks(
      "fixture",
      hour,
      ticks,
      { synthetic: true },
      ticks.length * 32,
    );
    store.putChunk(c, fromTicks(ticks));
  }
  return {
    root,
    store,
    replay: new Replay(store),
    base,
    cleanup() {
      store.close();
      if (!path.resolve(root).startsWith(cache + path.sep))
        throw Error("Unexpected test directory");
      rmSync(root, { recursive: true, force: true });
    },
  };
}
test("forming H1/4H bars reveal no future prices, including same timestamp cursor", () => {
  const f = fixture();
  try {
    f.replay.newSession("fixture", f.base + 25 * 3600000 + 2 * 60000);
    const bars = f.replay.bars("1H");
    assert.equal(bars.at(-1)!.close, 2025.02);
    assert.equal(bars.at(-1)!.high, 2025.02);
    assert.ok(f.replay.bars("4H").at(-1)!.high < 2026);
    assert.ok(ema(bars, 20).at(-1)!.value < 2025.02);
  } finally {
    f.cleanup();
  }
});
test("continue restores exact cursor, order state, drawings, drafts and notes without replaying fills", () => {
  const f = fixture();
  try {
    const s = f.replay.newSession("fixture", f.base + 25 * 3600000);
    place(s.broker, s.tick, {
      side: "buy",
      kind: "market",
      lots: 0.01,
      sl: 2010,
      tp: 2030,
      thesis: "fixture",
      tags: [],
      strategy: "test",
    });
    s.draft = "unsent";
    s.notebook.text = "saved source";
    s.notes.push({
      id: "n",
      text: "note",
      cutoff: s.tick.t,
      cursor: s.broker.seq,
      tags: [],
    });
    f.replay.advanceOne();
    f.store.save(s);
    const exact = JSON.stringify(s),
      restored = new Replay(f.store);
    restored.setSession(f.store.load(s.id)!);
    assert.equal(JSON.stringify(restored.session), exact);
    assert.equal(restored.session!.broker.positions.length, 1);
    assert.equal(restored.session!.broker.fills.length, 0);
  } finally {
    f.cleanup();
  }
});
test("accelerated batches produce identical outcomes to individual ticks", () => {
  const f = fixture();
  try {
    const original = f.replay.newSession("fixture", f.base + 25 * 3600000);
    place(original.broker, original.tick, {
      side: "buy",
      kind: "market",
      lots: 0.01,
      sl: 2020,
      tp: 2026,
      thesis: "fixture",
      tags: [],
      strategy: "test",
    });
    const other = new Replay(f.store);
    other.setSession(structuredClone(original));
    for (let i = 0; i < 100; i++) f.replay.advanceOne();
    const target = f.replay.session!.tick.t;
    while (other.session!.tick.t < target) other.advanceTo(target, 100);
    assert.deepEqual(other.session!.broker, f.replay.session!.broker);
    assert.deepEqual(other.session!.cursor, f.replay.session!.cursor);
  } finally {
    f.cleanup();
  }
});
test("missing chunks pause instead of jumping; new random session owns new balance", () => {
  const f = fixture();
  try {
    const s = f.replay.newSession("fixture", f.base + 25 * 3600000);
    s.broker.balance = 700;
    f.store.save(s);
    const b = f.replay.newSession("fixture");
    assert.equal(b.broker.balance, 500);
    assert.equal(b.broker.positions.length, 0);
    f.store.db
      .prepare("DELETE FROM chunks WHERE dataset=? AND hour=?")
      .run("fixture", b.cursor.hour + 3600000);
    b.cursor.index = 59;
    b.tick = f.store.readTicks(f.store.chunk("fixture", b.cursor.hour)!)[59];
    assert.throws(() => f.replay.advanceOne(), /Data gap/);
  } finally {
    f.cleanup();
  }
});
test("AI context excludes future notes, annotations and outcome messages", () => {
  const f = fixture();
  try {
    const s = f.replay.newSession("fixture", f.base + 25 * 3600000);
    s.notes = [
      {
        id: "future",
        text: "future answer",
        cutoff: s.tick.t + 60000,
        cursor: 100,
        tags: [],
      },
    ];
    s.chat = [
      {
        id: "m",
        role: "assistant",
        text: "future outcome",
        at: 0,
        cutoff: s.tick.t + 1,
        cursor: 1,
        model: "test",
        profile: "test",
        strategy: "test",
        status: "complete",
      },
    ];
    const ctx = buildContext(s, f.replay.bars("5m"), f.replay.bars("1H"));
    assert.equal(ctx.notes.length, 0);
    assert.equal(ctx.conversation.length, 0);
    assert.ok(ctx.candles.every((c) => c.time * 1000 <= s.tick.t));
    assert.ok(!JSON.stringify(ctx).includes("future answer"));
  } finally {
    f.cleanup();
  }
});
test("market schedules and London/New York DST are independent", () => {
  assert.equal(knownClosure(Date.UTC(2026, 10, 7, 12)), true);
  assert.equal(knownClosure(Date.UTC(2026, 10, 8, 22)), true);
  assert.equal(knownClosure(Date.UTC(2026, 10, 8, 23)), false);
  assert.equal(sessionFlags(Date.UTC(2026, 2, 20, 12)).newYork, true);
  assert.equal(sessionFlags(Date.UTC(2026, 2, 20, 7)).london, false);
});
test("CSV timezone conversion detects ambiguous and nonexistent local DST times", () => {
  assert.equal(
    parseTimestamp("2026-11-02 10:00:00", "Europe/Oslo", "iso"),
    Date.UTC(2026, 10, 2, 9),
  );
  assert.throws(
    () => parseTimestamp("2026-10-25 02:30:00", "Europe/Oslo", "iso"),
    /Ambiguous/,
  );
  assert.throws(
    () => parseTimestamp("2026-03-29 02:30:00", "Europe/Oslo", "iso"),
    /Ambiguous/,
  );
  assert.equal(
    parseTimestamp("2026-11-02T10:00:00+01:00", "UTC", "iso"),
    Date.UTC(2026, 10, 2, 9),
  );
});

test("historical decision HTF reconstruction ignores later cached extrema and does not mutate the replay", () => {
  const f = fixture();
  try {
    const s = f.replay.newSession("fixture", f.base + 25 * 3600000 + 2 * 60000),
      at = s.tick.t;
    f.replay.nextCandle("1H");
    const before = JSON.stringify(s),
      htf = f.replay.barsAt(at, "4H");
    assert.ok(htf.at(-1)!.high <= 2025.02);
    assert.equal(htf.at(-1)!.close, 2025.02);
    assert.equal(JSON.stringify(s), before);
  } finally {
    f.cleanup();
  }
});
