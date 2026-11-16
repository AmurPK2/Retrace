import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import lzma from "lzma/src/lzma_worker.js";
import { Store, sha, encodeTicks, decodeTicks } from "../src/data/store";
import { Importer } from "../src/data/importer";
import { dataQuality, tickGaps } from "../src/data/quality";
import { fromTicks } from "../src/core/bars";
import { Replay } from "../src/core/replay";
import { place } from "../src/core/broker";
import {
  coachEvidenceReply,
  coachEvidenceIssue,
  coachRuleIssue,
} from "../src/ai/coach-evidence";
import { buildContext, promptSnapshot } from "../src/ai/context";
import { fitContext } from "../src/ai/budget";
import { holdout } from "../scripts/coach-holdout";
const base = Date.UTC(2026, 1, 10, 12),
  hour = 3600000;
const cache = path.resolve(".cache/coach-quality");
mkdirSync(cache, { recursive: true });
function fixture() {
  const root = mkdtempSync(path.join(cache, "case-"));
  const store = new Store(root);
  return {
    root,
    store,
    close() {
      store.close();
      assert.ok(root.startsWith(cache + path.sep));
      rmSync(root, { recursive: true, force: true });
    },
  };
}
const ticks = (h = base, n = 60) =>
  Array.from({ length: n }, (_, i) => ({
    t: h + i * 60000,
    bid: 2000 + i / 100,
    ask: 2000.5 + i / 100,
    bv: 2,
    av: 3,
  }));
async function bi5() {
  const qs = ticks(),
    b = Buffer.alloc(qs.length * 20);
  qs.forEach((q, i) => {
    b.writeUInt32BE(q.t - base, i * 20);
    b.writeUInt32BE(Math.round(q.ask * 1000), i * 20 + 4);
    b.writeUInt32BE(Math.round(q.bid * 1000), i * 20 + 8);
    b.writeFloatBE(3, i * 20 + 12);
    b.writeFloatBE(2, i * 20 + 16);
  });
  return new Promise<Buffer>((resolve, reject) =>
    (lzma.LZMA_WORKER as any).compress(b, 1, (r: any, e: any) =>
      e ? reject(e) : resolve(Buffer.from(r)),
    ),
  );
}
test("whole-hour cache replacements cannot retain old minute/hour prices", () => {
  const f = fixture();
  try {
    f.store.putChunk(
      f.store.writeTicks("dukascopy", base, ticks(), {}, 100),
      fromTicks(ticks()),
    );
    f.store.putChunk(
      f.store.writeTicks("dukascopy", base, ticks(base, 10), {}, 100),
      fromTicks(ticks(base, 10)),
    );
    assert.equal(f.store.bars("dukascopy", base, base + hour).length, 10);
    const c = f.store.chunk("dukascopy", base)!;
    f.store.putChunk({
      ...c,
      status: "missing",
      path: "",
      count: 0,
      first: null,
      last: null,
      sha: "",
    });
    assert.equal(f.store.bars("dukascopy", base, base + hour).length, 0);
    assert.equal(f.store.hourBars("dukascopy", base, base + hour).length, 0);
  } finally {
    f.close();
  }
});
test("hash-valid ticks still need valid values, order and matching hour metadata", () => {
  assert.throws(
    () => decodeTicks(encodeTicks([{ t: base, bid: 2000, ask: 1999 }])),
    /Invalid/,
  );
  assert.throws(() => decodeTicks(encodeTicks(ticks().reverse())), /unordered/);
  const f = fixture();
  try {
    const c = f.store.writeTicks("dukascopy", base, ticks(), {}, 100);
    assert.throws(() => f.store.readTicks({ ...c, count: 59 }), /metadata/);
    assert.throws(
      () => f.store.readTicks({ ...c, hour: base - hour }),
      /metadata/,
    );
  } finally {
    f.close();
  }
});
for (const localGood of [true, false])
  test(`corrupt ready cache repairs in one pass; verified local source=${localGood}`, async () => {
    const f = fixture();
    try {
      const data = await bi5(),
        qs = ticks();
      const c = f.store.writeTicks(
        "dukascopy",
        base,
        qs,
        { sourceSha256: sha(data) },
        data.length,
      );
      f.store.putChunk(c, fromTicks(qs));
      writeFileSync(c.path, "corrupted");
      mkdirSync(path.join(f.root, "source/XAUUSD"), { recursive: true });
      writeFileSync(
        path.join(f.root, "source/XAUUSD", base + ".bi5"),
        localGood ? data : Buffer.from("not verified"),
      );
      let calls = 0;
      const importer = new Importer(f.store);
      importer.fetch = async () => {
        calls++;
        return data;
      };
      await importer.range(base, base + hour);
      const fixed = f.store.chunk("dukascopy", base)!;
      assert.equal(fixed.status, "ready");
      assert.equal(f.store.readTicks(fixed).length, 60);
      assert.equal(calls, localGood ? 0 : 1);
      assert.equal(JSON.parse(fixed.provenance).recoveredSource, localGood);
    } finally {
      f.close();
    }
  });
test("open-hour 404 stays unknown; invalid saved closure is rechecked instead of skipped", async () => {
  const f = fixture();
  try {
    f.store.putChunk({
      dataset: "dukascopy",
      hour: base,
      status: "closure",
      path: "",
      count: 0,
      first: null,
      last: null,
      bytes: 0,
      sha: "",
      provenance: "{}",
    });
    const importer = new Importer(f.store);
    let calls = 0;
    importer.fetch = async () => {
      calls++;
      return null;
    };
    await importer.range(base, base + hour);
    assert.equal(calls, 1);
    assert.equal(f.store.chunk("dukascopy", base)!.status, "missing");
    assert.equal(
      dataQuality(f.store, "dukascopy", base, base + 60000).status,
      "insufficient",
    );
  } finally {
    f.close();
  }
});
test("quality recomputes old edge gaps, excludes later gaps, and verifies closures per instrument", () => {
  const f = fixture();
  try {
    const qs = ticks(base, 11);
    f.store.putChunk(
      f.store.writeTicks("dukascopy", base, qs, {}, 100),
      fromTicks(qs),
    );
    assert.equal(
      dataQuality(f.store, "dukascopy", base, base + 10 * 60000).status,
      "sufficient",
    );
    assert.equal(
      dataQuality(f.store, "dukascopy", base, base + 20 * 60000).status,
      "insufficient",
    );
    const goldBreak = Date.UTC(2026, 1, 10, 22);
    f.store.putChunk({
      dataset: "dukascopy",
      hour: goldBreak,
      status: "closure",
      path: "",
      count: 0,
      first: null,
      last: null,
      bytes: 0,
      sha: "",
      provenance: "{}",
    });
    assert.equal(
      dataQuality(f.store, "dukascopy", goldBreak, goldBreak + hour - 1)
        .knownClosedHours,
      1,
    );
    f.store.putChunk({
      ...f.store.chunk("dukascopy", goldBreak)!,
      dataset: "dukascopy:EURAUD",
    });
    assert.equal(
      dataQuality(f.store, "dukascopy:EURAUD", goldBreak, goldBreak + hour - 1)
        .status,
      "insufficient",
    );
    assert.equal(
      tickGaps([{ t: base + 10 * 60000, bid: 2000, ask: 2001 }], base, "EURAUD")
        .length,
      2,
    );
  } finally {
    f.close();
  }
});
test("unknown missing hour cannot create a fill across the gap", () => {
  const f = fixture();
  try {
    for (let i = 0; i < 35; i++) {
      const qs = ticks(base + i * hour);
      f.store.putChunk(
        f.store.writeTicks("dukascopy", base + i * hour, qs, {}, 100),
        fromTicks(qs),
      );
    }
    const r = new Replay(f.store),
      s = r.newSession("dukascopy", base + 25 * hour + 59 * 60000);
    place(s.broker, s.tick, {
      side: "buy",
      kind: "limit",
      lots: 0.01,
      price: 1999,
      sl: 1990,
      tp: 2010,
      thesis: "test",
      strategy: "test",
      tags: [],
    });
    const next = f.store.chunk("dukascopy", base + 26 * hour)!;
    f.store.putChunk({ ...next, status: "missing" });
    const seq = s.broker.seq;
    assert.throws(() => r.advanceOne(), /Data gap/);
    assert.equal(s.broker.seq, seq);
    assert.equal(s.broker.positions.length, 0);
    assert.equal(s.broker.pending.length, 1);
  } finally {
    f.close();
  }
});
test("two drawn entries keep independent computed risk, distinct targets and exact C1/C2 level references", () => {
  const c = holdout()[0].context,
    a = c.assessment!;
  assert.deepEqual(
    a.entries.map((p) => [p.entry, p.sl, p.tp, p.risk]),
    [
      [2005, 1990, 2020, 15],
      [1998, 1990, 2035, 8],
    ],
  );
  assert.equal(a.combinedRisk, 23);
  assert.deepEqual(a.entries[0].levelReferences.tp, ["C1 high"]);
  assert.deepEqual(a.entries[1].levelReferences.tp, ["C2 high"]);
  assert.equal(a.execution.drafts, 2);
  assert.equal(a.execution.pending, 0);
  assert.equal(a.pair!.c2.completed, true);
  assert.match(coachEvidenceReply(c, "Vurder oppsettet"), /15.00 USD/);
  assert.match(coachEvidenceReply(c, "Vurder oppsettet"), /8.00 USD/);
});
test("model cannot label missing stops safe, invent pending/fills, or accept a winner without entry rules", () => {
  const cases = holdout();
  assert.ok(
    coachEvidenceIssue(
      "Dette er ufarlig og risikoen er overholdt.",
      cases[5].context,
    ),
  );
  assert.ok(
    coachEvidenceIssue("You have a pending buy at 2005.", cases[2].context),
  );
  assert.ok(
    coachEvidenceIssue("Du har kjøpt med denne inngangen.", cases[0].context),
  );
  assert.ok(
    coachEvidenceIssue(
      "Your strategy is valid because it won.",
      cases[2].context,
    ),
  );
  assert.ok(
    coachRuleIssue("Use that same 4H candle's close as your stop loss level."),
  );
  assert.ok(
    coachRuleIssue(
      "No. Your stop and target must be outside that candle range.",
    ),
  );
});
test("missing SL remains incomplete rather than passing optional geometry fields", () => {
  const c = holdout()[5].context;
  assert.equal(c.assessment!.geometry, "incomplete");
  assert.equal(c.assessment!.combinedRisk, null);
  assert.match(
    coachEvidenceReply(c, "Vurder oppsettet"),
    /kan ikke beregnes uten SL/,
  );
});
test("context shows completion at each timeframe and discloses reduction", () => {
  const c = holdout()[0].context,
    p = promptSnapshot(c) as any;
  assert.equal(p.candles.rows.at(-1).at(-1), true);
  assert.equal(p.secondCandles.rows.at(-1).at(-1), true);
  c.strategy.text = "rule ".repeat(2500);
  const fitted = fitContext(c, 4096, 640, false);
  assert.equal(fitted.contextLimits.strategyTextTruncated, true);
  assert.ok(fitted.assessment);
  assert.equal(
    (promptSnapshot(fitted) as any).contextLimits.fullEvidenceNotIncluded
      .strategyTextTruncated,
    true,
  );
});

test("original-decision completion uses original cutoff and timeframe, never later replay time", () => {
  const c = holdout()[0].context;
  const start = c.cutoff - 60000;
  c.reviewMode = true;
  c.selectedTrade = { id: "executed" } as any;
  c.reviewAtDecision = {
    cutoff: start + 60000,
    timeframe: "15m",
    secondTimeframe: "4H",
    candles: [
      {
        time: start / 1000,
        open: 2000,
        high: 2001,
        low: 1999,
        close: 2000,
        count: 1,
      },
    ],
    secondCandles: [],
    strategy: { text: "" },
  } as any;
  c.cutoff += 86400000;
  const snapshot = promptSnapshot(c) as any;
  assert.equal(snapshot.originalDecision.candles.rows[0].at(-1), false);
});
test("an authored numeric threshold is groundable but does not prove compliance", async () => {
  const { validateGrounding } = await import("../src/ai/context");
  const c = holdout()[0].context;
  assert.equal(
    validateGrounding("Your written threshold is 2030.", c),
    "Your written threshold is 2030.",
  );
  assert.throws(() => validateGrounding("Use SL at 1980.", c), /verified/);
  assert.equal(
    c.assessment!.ruleVerification.includes("not automatic approval"),
    true,
  );
});
test("worker abstains on incomplete evidence without loading a model", async () => {
  const { Worker } = await import("node:worker_threads");
  const f = fixture();
  let worker: InstanceType<typeof Worker> | undefined;
  try {
    for (let i = 0; i < 35; i++) {
      const qs = ticks(base + i * hour);
      f.store.putChunk(
        f.store.writeTicks("dukascopy", base + i * hour, qs, {}, 100),
        fromTicks(qs),
      );
    }
    worker = new Worker(path.resolve("dist-electron/worker.cjs"), {
      workerData: {
        root: f.root,
        project: path.resolve("."),
        parentPid: process.pid,
        autoSetup: false,
      },
    });
    let id = 0;
    const pending = new Map<
      number,
      { resolve: (v: any) => void; reject: (e: Error) => void }
    >();
    worker.on("message", (m) => {
      const p = pending.get(m.id);
      if (p) {
        pending.delete(m.id);
        m.error ? p.reject(Error(m.error)) : p.resolve(m.value);
      }
    });
    const call = (command: any) =>
      new Promise<any>((resolve, reject) => {
        pending.set(++id, { resolve, reject });
        worker!.postMessage({ id, command });
      });
    await call({ type: "sessions.new", timestamp: base + 25 * hour });
    const old = f.store.chunk("dukascopy", base + 24 * hour)!;
    f.store.putChunk({ ...old, status: "missing" });
    let state = await call({ type: "state" });
    await call({
      type: "ai.ask",
      text: "Vurder oppsettet mitt.",
      cursor: state.session.broker.seq,
      tradeId: "chart",
    });
    state = await call({ type: "state" });
    assert.equal(state.session.chat.at(-1).status, "complete");
    assert.equal(state.session.chat.at(-1).savedFacts, true);
    assert.match(state.session.chat.at(-1).text, /prisgrunnlaget/);
    assert.equal(state.ai.state, "ready");
    assert.equal(state.session.broker.positions.length, 0);
    await call({ type: "shutdown" });
  } finally {
    await worker?.terminate();
    f.close();
  }
});

test("two-plan review cannot silently omit both actual entries or call computed risk unknown", () => {
  const c = holdout()[0].context;
  assert.ok(
    coachEvidenceIssue(
      "Plan A is better at 15 USD, plan B is worse at 8 USD.",
      c,
    ),
  );
  assert.ok(
    coachEvidenceIssue("Entry 2005 and entry 1998 have unknown risk.", c),
  );
  assert.equal(
    coachEvidenceIssue(coachEvidenceReply(c, "Vurder oppsettet"), c),
    null,
  );
});

test("honest negated validity is not mistaken for approving missing rules", () => {
  const c = holdout()[2].context;
  assert.equal(
    coachEvidenceIssue(
      "Without a rule, you cannot verify if the setup is valid.",
      c,
    ),
    null,
  );
  assert.ok(coachEvidenceIssue("The strategy is valid because it won.", c));
});

test("old edge-gap cache is retried against source even without an old gap receipt", async () => {
  const f = fixture();
  try {
    const qs = ticks(base, 10);
    f.store.putChunk(
      f.store.writeTicks("dukascopy", base, qs, {}, 100),
      fromTicks(qs),
    );
    const data = await bi5();
    let fetches = 0;
    const importer = new Importer(f.store);
    importer.fetch = async () => {
      fetches++;
      return data;
    };
    await importer.range(base, base + hour);
    assert.equal(fetches, 1);
    assert.equal(f.store.chunk("dukascopy", base)!.count, 60);
    assert.equal(
      dataQuality(f.store, "dukascopy", base, base + 59 * 60000).status,
      "sufficient",
    );
  } finally {
    f.close();
  }
});

test("a repair cannot relabel C2 close as its high even when both numbers exist in context", () => {
  const c = holdout()[0].context;
  assert.ok(
    coachEvidenceIssue(
      "Entry 2005 and entry 1998 have C2-high (2025) as target.",
      c,
    ),
  );
  assert.equal(
    coachEvidenceIssue(
      "Entry 2005 and entry 1998 have C2-high (2035) as target.",
      c,
    ),
    null,
  );
});
