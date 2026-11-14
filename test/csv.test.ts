import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { Store } from "../src/data/store";
import { importCSV, parseTimestamp, type CSVMapping } from "../src/data/csv";
import { knownClosure } from "../src/core/bars";
import { Replay } from "../src/core/replay";

test("CSV pause checkpoints an incomplete hour; reimport resumes the same dataset without losing the committed prefix", async () => {
  const cache = path.resolve(".cache/test-databases");
  mkdirSync(cache, { recursive: true });
  const root = mkdtempSync(path.join(cache, "csv-"));
  const store = new Store(root);
  try {
    const start = Date.UTC(2026, 10, 9);
    const lines = ["utc,bid,ask"];
    for (let minute = 0; minute < 70 * 60; minute++) {
      const t = start + minute * 60000;
      if (knownClosure(t)) continue;
      lines.push(`${t},${5000 + minute / 1000},${5000.25 + minute / 1000}`);
    }
    const file = path.join(root, "ticks.csv");
    writeFileSync(file, lines.join("\n"));
    const mapping: CSVMapping = {
      timestamp: "utc",
      bid: "bid",
      ask: "ask",
      timezone: "UTC",
      unit: "ms",
      delimiter: ",",
    };
    let visits = 0;
    const states: any[] = [];
    const paused = await importCSV(
      store,
      file,
      mapping,
      (p) => states.push(p),
      () => ++visits > 124,
    );
    assert.equal(paused.paused, true);
    assert.equal(paused.count, 124);
    const partial = store.chunk(paused.dataset, start + 2 * 3600000)!;
    assert.equal(partial.status, "partial");
    assert.equal(partial.count, 4);
    const committedBytes = readFileSync(partial.path);
    assert.equal(states.at(-1).running, false);
    assert.equal(states.at(-1).paused, true);
    assert.equal(states.at(-1).kind, "csv");
    const completed = await importCSV(store, file, mapping);
    assert.equal(completed.dataset, paused.dataset);
    assert.equal(completed.paused, false);
    assert.equal(completed.count, lines.length - 1);
    const complete = store.chunk(completed.dataset, partial.hour)!;
    assert.equal(complete.status, "ready");
    assert.equal(complete.count, 60);
    assert.notEqual(complete.path, partial.path);
    assert.deepEqual(readFileSync(partial.path), committedBytes);
    assert.equal(store.readTicks(partial).length, 4);
    assert.ok(
      store.chunks(completed.dataset).some((c) => c.status === "closure"),
    );
    assert.ok(new Replay(store).eligible(completed.dataset).length > 0);
  } finally {
    store.close();
    if (!path.resolve(root).startsWith(cache + path.sep))
      throw Error("Unsafe test cleanup");
    rmSync(root, { recursive: true, force: true });
  }
});

test("CSV rejects invalid calendar dates and missing mapped columns", async () => {
  assert.throws(
    () => parseTimestamp("2026-02-30 12:00:00", "UTC", "iso"),
    /calendar/,
  );
  assert.throws(
    () => parseTimestamp("2026-11-12 25:00:00", "UTC", "iso"),
    /calendar/,
  );
  const cache = path.resolve(".cache/test-databases");
  mkdirSync(cache, { recursive: true });
  const root = mkdtempSync(path.join(cache, "csv-invalid-"));
  const store = new Store(root);
  try {
    const file = path.join(root, "missing.csv");
    writeFileSync(file, "utc,bid\n1794222000000,5000\n");
    await assert.rejects(
      importCSV(store, file, {
        timestamp: "utc",
        bid: "bid",
        ask: "ask",
        timezone: "UTC",
        unit: "ms",
        delimiter: ",",
      }),
      /missing the column: ask/,
    );
    assert.equal(store.chunks(store.meta("activeDataset", "none")).length, 0);
  } finally {
    store.close();
    if (!path.resolve(root).startsWith(cache + path.sep))
      throw Error("Unsafe test cleanup");
    rmSync(root, { recursive: true, force: true });
  }
});
