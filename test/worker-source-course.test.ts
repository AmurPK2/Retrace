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

test("source course locks, persists and merges attempts through backup without changing replay or broker state", async () => {
  const f = fixture();
  let w = worker(f.root);
  try {
    let p = await w.call({ type: "rrcourse.open" });
    assert.equal(p.selected, "external");
    assert.equal(p.attempts.length, 0);
    await w.call({ type: "sessions.new", timestamp: f.base + 31 * 3600000 });
    const before = (await w.call({ type: "state" })).session;
    const action = (action: string, value?: unknown) =>
      w.call({ type: "rrcourse.action", action, value });
    await action("select", "cisd");
    await action("mode", false);
    p = await action("commit", { choice: "A" });
    assert.equal(p.attempts.at(-1).answer.choice, "A");
    await assert.rejects(action("commit", { choice: "B" }), /allerede låst/);
    await action("retry");
    p = await action("commit", { choice: "B" });
    assert.equal(p.attempts.length, 2);
    await assert.rejects(action("select", "invented"), /Ukjent/);
    await assert.rejects(action("mode", "false"));
    const after = (await w.call({ type: "state" })).session;
    for (const key of [
      "tick",
      "cursor",
      "broker",
      "drawings",
      "chat",
      "layout",
      "learning",
      "notebook",
    ])
      assert.deepEqual(after[key], before[key], key);
    await w.call({ type: "shutdown" });
    await w.instance.terminate();
    w = worker(f.root);
    p = await w.call({ type: "rrcourse.open" });
    assert.equal(p.attempts.length, 2);
    assert.equal(p.selected, "cisd");
    assert.ok(p.activeAttempt);
    const backup = await w.call({ type: "sessions.export" });
    assert.equal(backup.payload.rrSourceCourse.attempts.length, 2);
    await action("select", "weighted-r");
    await action("commit", { values: { r: 3.5 } });
    await w.call({ type: "sessions.import", backup });
    p = await w.call({ type: "rrcourse.open" });
    assert.equal(p.attempts.length, 3);
    assert.equal(p.selected, "weighted-r");
    assert.equal(new Set(p.attempts.map((a: any) => a.id)).size, 3);
  } finally {
    await w.call({ type: "shutdown" }).catch(() => {});
    await w.instance.terminate();
    f.cleanup();
  }
});
