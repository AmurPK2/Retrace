import test from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { Store } from "../src/data/store";
import { fromTicks } from "../src/core/bars";
import { buildContext } from "../src/ai/context";
const cache = path.resolve(".cache/test-databases");
mkdirSync(cache, { recursive: true });
function fixture(spread = 0.5) {
  const root = mkdtempSync(path.join(cache, "worker-")),
    store = new Store(root),
    base = Date.UTC(2026, 10, 2);
  for (let h = 0; h < 35; h++) {
    const hour = base + h * 3600000,
      ticks = Array.from({ length: 60 }, (_, i) => ({
        t: hour + i * 60000,
        bid: 2000 + h + i / 100,
        ask: 2000 + spread + h + i / 100,
      }));
    const c = store.writeTicks(
      "dukascopy",
      hour,
      ticks,
      { synthetic: true },
      100,
    );
    store.putChunk(c, fromTicks(ticks));
  }
  store.close();
  return {
    root,
    base,
    cleanup() {
      if (!path.resolve(root).startsWith(cache + path.sep))
        throw Error("Unexpected test path");
      rmSync(root, { recursive: true, force: true });
    },
  };
}
function worker(root: string) {
  const instance = new Worker(path.resolve("dist-electron/worker.cjs"), {
    workerData: {
      root,
      project: path.resolve("."),
      parentPid: process.pid,
      autoSetup: false,
    },
  });
  let id = 0;
  const pending = new Map<number, any>();
  instance.on("message", (m) => {
    const p = pending.get(m.id);
    if (p) {
      pending.delete(m.id);
      m.error ? p.reject(Error(m.error)) : p.resolve(m.value);
    }
  });
  instance.on("error", (e) => {
    for (const p of pending.values()) p.reject(e);
    pending.clear();
  });
  const call = (command: any) =>
    new Promise<any>((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      instance.postMessage({ id, command });
    });
  return { instance, call };
}

test("visual RR course preserves replay and old learning, locks answers, bounds C3, survives restart and session backup", async () => {
  const f = fixture();
  let w = worker(f.root);
  try {
    await w.call({ type: "sessions.new", timestamp: f.base + 31 * 3600000 });
    const before = (await w.call({ type: "state" })).session;
    let view = await w.call({ type: "visual.open" });
    const snapshotId = view.snapshotId,
      caseTime = view.caseTime;
    const action = (action: string, value?: unknown) =>
      w.call({ type: "visual.action", snapshotId, action, value });
    assert.equal(view.c3, null);
    assert.equal(view.revealed, false);
    for (const [tf, bars] of Object.entries(view.frames) as [
      "4H" | "15m" | "1m",
      any[],
    ][])
      for (const b of bars)
        assert.ok(
          (b.time + { "4H": 14400, "15m": 900, "1m": 60 }[tf]) * 1000 <=
            view.cutoff,
        );
    await assert.rejects(action("reveal"), /Lås planen/);
    await action("mode", false);
    view = await w.call({ type: "visual.open" });
    assert.equal(view.key, null);
    view = await action("commit", { high: 1, low: 1, close: 1 });
    assert.ok(view.last.checks.every((x: any) => !x.pass));
    await assert.rejects(action("commit", { high: 1 }), /allerede låst/);
    view = await action("retry");
    assert.equal(view.key, null);
    assert.equal(view.history.length, 1);
    await assert.rejects(
      w.call({
        type: "visual.action",
        snapshotId: "stale",
        action: "step",
        value: "plan",
      }),
      /Øvingen er endret/,
    );
    await assert.rejects(action("commit", { high: NaN }), /finite|number|NaN/i);
    await action("step", "plan");
    view = await action("commit", { decision: "wait" });
    assert.equal(view.last.checks[0].pass, true);
    await action("step", "review");
    await assert.rejects(action("reveal"), /Lås planen/);
    await action("commit", { classification: "decision" });
    view = await action("reveal");
    assert.equal(view.revealed, true);
    assert.ok(view.c3);
    const after = (await w.call({ type: "state" })).session;
    for (const key of [
      "tick",
      "cursor",
      "broker",
      "drawings",
      "chat",
      "learning",
      "notebook",
      "layout",
      "draft",
      "thesis",
    ])
      assert.deepEqual(after[key], before[key], key + " changed");
    await w.instance.terminate();
    w = worker(f.root);
    view = await w.call({ type: "visual.open" });
    assert.equal(view.snapshotId, snapshotId);
    assert.equal(view.caseTime, caseTime);
    assert.equal(view.history.length, 3);
    assert.equal(view.revealed, true);
    const exported = await w.call({ type: "sessions.export" });
    assert.equal(exported.payload.rrVisual.snapshot.id, snapshotId);
    await w.call({ type: "sessions.import", backup: exported });
    const restored = await w.call({ type: "visual.open" });
    assert.notEqual(restored.sessionId, before.id);
    assert.deepEqual(restored.history, view.history);
    assert.equal(restored.revealed, true);
  } finally {
    await w.instance.terminate();
    f.cleanup();
  }
});
