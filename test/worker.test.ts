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

test("RR study locks cursor-bounded evidence, survives restart and backup, and does not rewrite trading or notebook data", async () => {
  const f = fixture();
  let w = worker(f.root);
  try {
    await w.call({
      type: "sessions.new",
      timestamp: f.base + 25 * 3600000 + 7 * 60000,
    });
    let state = await w.call({ type: "state" });
    const original = structuredClone(state.session),
      cursor = structuredClone(state.session.cursor);
    assert.equal(state.session.study, undefined);
    await w.call({ type: "study.context", value: "entry" });
    state = await w.call({ type: "state" });
    assert.equal(state.session.layout.timeframe, "15m");
    assert.equal(state.session.layout.second, "1H");
    assert.equal(state.session.layout.dual, true);
    assert.deepEqual(state.session.cursor, cursor);
    await w.call({
      type: "study.progress",
      value: { selected: "candles", completed: ["context", "context"] },
    });
    await assert.rejects(
      w.call({
        type: "study.progress",
        value: { selected: "invented", completed: [] },
      }),
    );
    await w.call({
      type: "study.range",
      timeframe: "15m",
      cursor: state.session.broker.seq,
    });
    state = await w.call({ type: "state" });
    const range = structuredClone(state.session.study.range);
    assert.equal(state.rrView.c3Closed, false);
    assert.equal(state.rrView.c3.close, state.session.tick.bid);
    const plan = {
      decision: "long",
      objective: "C1 high",
      invalidation: "Close below marked local level",
      confirmation: "Wait for the saved local confirmation",
    };
    await w.call({ type: "study.draft", rangeId: range.id, value: plan });
    const id = await w.call({
      type: "study.commit",
      rangeId: range.id,
      cursor: state.session.broker.seq,
      lesson: "candles",
      value: plan,
    });
    state = await w.call({ type: "state" });
    const frozen = structuredClone(state.session.study.attempts[0]);
    const futureCopy = structuredClone(state.session);
    futureCopy.study.attempts.push({
      ...frozen,
      id: "future-study",
      committedAt: state.session.tick.t + 3600000,
      committedSeq: state.session.broker.seq + 100,
      plan: { ...plan, confirmation: "FUTURE_STUDY_REVIEW_SECRET" },
    });
    assert.equal(
      JSON.stringify(
        buildContext(futureCopy, state.bars, state.secondBars),
      ).includes("FUTURE_STUDY_REVIEW_SECRET"),
      false,
    );
    assert.equal(frozen.exposure, "developing");
    assert.equal(frozen.visibleC3.close, original.tick.bid);
    await w.call({
      type: "study.draft",
      rangeId: range.id,
      value: { ...plan, objective: "late overwrite" },
    });
    await assert.rejects(
      w.call({
        type: "study.commit",
        rangeId: range.id,
        cursor: state.session.broker.seq,
        lesson: "candles",
        value: plan,
      }),
      /already locked/,
    );
    await assert.rejects(
      w.call({ type: "study.review", id, reflection: "Too early" }),
      /not fully available/,
    );
    await assert.rejects(
      w.call({
        type: "study.reveal",
        id,
        cursor: state.session.broker.seq - 1,
      }),
      /cursor changed/,
    );
    assert.deepEqual(
      (await w.call({ type: "state" })).session.study.attempts[0],
      frozen,
    );
    await w.call({
      type: "study.reveal",
      id,
      cursor: state.session.broker.seq,
    });
    state = await w.call({ type: "state" });
    assert.equal(state.session.tick.t, f.base + 25 * 3600000 + 15 * 60000);
    assert.equal(state.rrView.c3Closed, true);
    assert.equal(state.rrView.c3.close, 2025.14);
    const revealedCursor = structuredClone(state.session.cursor);
    await w.call({
      type: "study.reveal",
      id,
      cursor: state.session.broker.seq,
    });
    assert.deepEqual(
      (await w.call({ type: "state" })).session.cursor,
      revealedCursor,
    );
    await w.call({
      type: "study.review",
      id,
      reflection: "The C3 body rose, but one candle cannot establish an edge.",
    });
    state = await w.call({ type: "state" });
    assert.equal(state.session.study.attempts[0].review.c3.close, 2025.14);
    assert.deepEqual(state.session.study.attempts[0].plan, plan);
    assert.equal(
      state.session.study.attempts[0].visibleC3.close,
      original.tick.bid,
    );
    assert.deepEqual(state.session.notebook, original.notebook);
    assert.deepEqual(state.session.drawings, original.drawings);
    for (const key of ["balance", "fills", "positions", "pending"])
      assert.deepEqual(state.session.broker[key], original.broker[key]);
    assert.deepEqual(state.rrProgress.completed, ["context"]);
    const expectedStudy = structuredClone(state.session.study),
      expectedProgress = structuredClone(state.rrProgress);
    const exported = await w.call({ type: "sessions.export" });
    assert.deepEqual(exported.payload.rrProgress, expectedProgress);
    await w.call({ type: "freeze" });
    await w.call({ type: "shutdown" });
    await w.instance.terminate();
    w = worker(f.root);
    state = await w.call({ type: "state" });
    assert.deepEqual(state.session.study, expectedStudy);
    assert.deepEqual(state.rrProgress, expectedProgress);
    await w.call({ type: "sessions.import", backup: exported });
    state = await w.call({ type: "state" });
    assert.notEqual(state.session.id, original.id);
    assert.deepEqual(state.session.study, expectedStudy);
    assert.deepEqual(state.session.notebook, original.notebook);
    await w.call({
      type: "study.range",
      timeframe: "15m",
      cursor: state.session.broker.seq,
    });
    state = await w.call({ type: "state" });
    assert.equal(state.session.study.activeId, undefined);
    assert.equal(state.session.study.attempts.length, 1);
    assert.equal(state.session.study.draft.confirmation, "");
    await w.call({ type: "freeze" });
    await w.call({
      type: "study.draft",
      rangeId: state.session.study.range.id,
      value: {
        ...plan,
        confirmation: "Final study draft flushed after freeze",
      },
    });
    await assert.rejects(
      w.call({
        type: "study.commit",
        rangeId: state.session.study.range.id,
        cursor: state.session.broker.seq,
        lesson: "candles",
        value: plan,
      }),
      /closing/,
    );
    await w.call({ type: "shutdown" });
    await w.instance.terminate();
    w = worker(f.root);
    assert.equal(
      (await w.call({ type: "state" })).session.study.draft.confirmation,
      "Final study draft flushed after freeze",
    );
    await w.call({ type: "shutdown" });
  } finally {
    await w.instance.terminate();
    f.cleanup();
  }
});

test("RR reveal pauses and keeps the locked plan when C3 meets a missing tick hour", async () => {
  const f = fixture();
  let w = worker(f.root);
  try {
    await w.call({
      type: "sessions.new",
      timestamp: f.base + 25 * 3600000 + 7 * 60000,
    });
    const store = new Store(f.root);
    store.db
      .prepare("DELETE FROM chunks WHERE dataset=? AND hour=?")
      .run("dukascopy", f.base + 26 * 3600000);
    store.close();
    let state = await w.call({ type: "state" });
    await w.call({
      type: "study.range",
      timeframe: "1H",
      cursor: state.session.broker.seq,
    });
    state = await w.call({ type: "state" });
    const id = await w.call({
      type: "study.commit",
      rangeId: state.session.study.range.id,
      cursor: state.session.broker.seq,
      lesson: "review",
      value: {
        decision: "skip",
        objective: "",
        invalidation: "",
        confirmation: "The local structure is unclear",
      },
    });
    const locked = structuredClone(
      (await w.call({ type: "state" })).session.study.attempts[0],
    );
    await assert.rejects(
      w.call({ type: "study.reveal", id, cursor: state.session.broker.seq }),
      /Data gap/,
    );
    state = await w.call({ type: "state" });
    assert.equal(state.playing, false);
    assert.equal(state.session.tick.t, f.base + 25 * 3600000 + 59 * 60000);
    assert.equal(state.rrView.c3Closed, false);
    assert.deepEqual(state.session.study.attempts[0], locked);
    await assert.rejects(
      w.call({
        type: "study.review",
        id,
        reflection: "Cannot review a missing close",
      }),
      /not fully available/,
    );
    assert.equal(state.session.broker.balance, 500);
    assert.equal(state.session.broker.fills.length, 0);
    await w.call({ type: "shutdown" });
    await w.instance.terminate();
    w = worker(f.root);
    state = await w.call({ type: "state" });
    assert.deepEqual(state.session.study.attempts[0], locked);
    assert.equal(state.rrView.c3Closed, false);
    await w.call({ type: "shutdown" });
  } finally {
    await w.instance.terminate();
    f.cleanup();
  }
});
test("shutdown/restore preserves exact state, drawing, layout, notebook, chat draft and pending order without duplicates", async () => {
  const f = fixture();
  let w = worker(f.root);
  try {
    await w.call({ type: "sessions.new", timestamp: f.base + 25 * 3600000 });
    let state = await w.call({ type: "state" });
    await w.call({
      type: "ui",
      value: {
        draft: "unsent persisted question",
        journalDraft: "unfinished journal reflection",
        thesis: "decision",
        tags: "test",
        layout: {
          ...state.session.layout,
          timeframe: "1H",
          dual: true,
          range: { from: 10, to: 120 },
        },
      },
    });
    await w.call({
      type: "drawings",
      value: [
        {
          id: "drawing",
          kind: "trend",
          a: { time: f.base / 1000, price: 2000 },
          b: { time: f.base / 1000 + 60, price: 2010 },
          color: "#c7a66c",
          locked: true,
          label: "fixture",
          levels: [0, 1],
          createdCursor: 0,
        },
      ],
    });
    await w.call({
      type: "notebook",
      value: {
        ...state.session.notebook,
        version: "verified-fixture-v1",
        text: "preserved source notes",
      },
    });
    await w.call({
      type: "order",
      order: {
        side: "buy",
        kind: "limit",
        price: 2020,
        sl: 2010,
        tp: 2030,
        lots: 0.01,
        thesis: "fixture",
        tags: ["test"],
        strategy: "verified-fixture-v1",
      },
    });
    state = await w.call({ type: "state" });
    await Promise.all([w.call({ type: "freeze" }), w.call({ type: "freeze" })]);
    await w.call({ type: "shutdown" });
    await w.instance.terminate();
    w = worker(f.root);
    const restored = await w.call({ type: "state" });
    assert.deepEqual(restored.session.cursor, state.session.cursor);
    assert.deepEqual(
      restored.session.broker,
      JSON.parse(JSON.stringify(state.session.broker)),
    );
    assert.deepEqual(restored.session.drawings, state.session.drawings);
    assert.deepEqual(restored.session.layout, state.session.layout);
    assert.equal(restored.session.draft, "unsent persisted question");
    assert.equal(
      restored.session.journalDraft,
      "unfinished journal reflection",
    );
    assert.equal(restored.session.notebook.text, "preserved source notes");
    assert.equal(restored.playing, false);
    assert.equal(restored.session.broker.pending.length, 1);
    await w.call({ type: "freeze" });
    await w.call({ type: "shutdown" });
  } finally {
    await w.instance.terminate();
    f.cleanup();
  }
});
test("abnormal worker termination recovers committed cursor rather than advancing wall time", async () => {
  const f = fixture();
  let w = worker(f.root);
  try {
    await w.call({ type: "sessions.new", timestamp: f.base + 25 * 3600000 });
    await w.call({ type: "step", kind: "tick" });
    const before = await w.call({ type: "state" });
    await w.instance.terminate();
    w = worker(f.root);
    const after = await w.call({ type: "state" });
    assert.equal(after.recovered, true);
    assert.equal(after.playing, false);
    assert.deepEqual(after.session.cursor, before.session.cursor);
    assert.deepEqual(after.session.broker, before.session.broker);
    await w.call({ type: "freeze" });
    await w.call({ type: "shutdown" });
  } finally {
    await w.instance.terminate();
    f.cleanup();
  }
});
test("failed SQLite checkpoint is reported, transaction remains recoverable, retry does not duplicate a fill", async () => {
  const f = fixture(),
    w = worker(f.root);
  let injector: Store | undefined;
  try {
    await w.call({ type: "sessions.new", timestamp: f.base + 25 * 3600000 });
    const before = await w.call({ type: "state" });
    injector = new Store(f.root);
    injector.db.exec(
      "CREATE TRIGGER reject_save BEFORE UPDATE ON sessions BEGIN SELECT RAISE(ABORT,'simulated write failure'); END;",
    );
    await assert.rejects(
      () =>
        w.call({
          type: "ui",
          value: { thesis: "accepted in memory, failed on disk" },
        }),
      /simulated write failure/,
    );
    assert.equal(injector.load(before.session.id)!.thesis, "");
    await assert.rejects(
      () => w.call({ type: "freeze" }),
      /simulated write failure/,
    );
    injector.db.exec("DROP TRIGGER reject_save");
    await w.call({ type: "freeze" });
    await w.call({ type: "shutdown" });
    assert.equal(
      injector.load(before.session.id)!.thesis,
      "accepted in memory, failed on disk",
    );
    assert.equal(injector.load(before.session.id)!.broker.fills.length, 0);
  } finally {
    await w.instance.terminate();
    injector?.close();
    f.cleanup();
  }
});

test("automatic level direction preserves absolute protection and invalid edits leave the same order intact after restart", async () => {
  const f = fixture();
  let w = worker(f.root);
  try {
    await w.call({ type: "sessions.new", timestamp: f.base + 25 * 3600000 });
    const initial = await w.call({ type: "state" });
    const bid = initial.session.tick.bid;
    const post = (side: string, price: number, sl: number, tp: number) =>
      w.call({
        type: "order",
        order: {
          side,
          kind: "stop",
          automaticLevel: true,
          price,
          sl,
          tp,
          lots: 0.01,
          thesis: "automatic-level-regression",
          tags: [],
          strategy: "test",
        },
      });
    await assert.rejects(post("buy", bid + 5, bid + 3, bid + 9), /SL must be/);
    await post("buy", bid + 5, bid + 7, bid + 1);
    await post("sell", bid - 5, bid - 7, bid - 1);
    let state = await w.call({ type: "state" });
    const [above, below] = state.session.broker.pending;
    assert.equal(above.side, "sell");
    assert.equal(above.kind, "limit");
    assert.equal(above.sl, bid + 7);
    assert.equal(above.tp, bid + 1);
    assert.equal(below.side, "buy");
    assert.equal(below.kind, "limit");
    assert.equal(below.sl, bid - 7);
    assert.equal(below.tp, bid - 1);
    assert.equal(above.automaticLevel, true);
    await assert.rejects(post("buy", bid - 2, bid + 1, bid + 4), /SL must be/);
    await w.call({ type: "freeze" });
    await w.call({ type: "shutdown" });
    await w.instance.terminate();
    w = worker(f.root);
    state = await w.call({ type: "state" });
    assert.equal(state.session.broker.pending[0].automaticLevel, true);
    await assert.rejects(
      w.call({
        type: "pending.edit",
        id: above.id,
        changes: { price: bid - 3 },
      }),
      /SL must be/,
    );
    const unchanged = await w.call({ type: "state" });
    assert.deepEqual(
      unchanged.session.broker.pending,
      state.session.broker.pending,
    );
    await w.call({
      type: "pending.edit",
      id: above.id,
      changes: { price: bid + 4 },
    });
    const entryOnly = await w.call({ type: "state" });
    const same = entryOnly.session.broker.pending.find(
      (p: any) => p.id === above.id,
    );
    assert.equal(same.sl, bid + 7);
    assert.equal(same.tp, bid + 1);
    await w.call({
      type: "pending.edit",
      id: above.id,
      changes: { price: bid - 3, sl: bid - 5, tp: bid + 1 },
    });
    state = await w.call({ type: "state" });
    const moved = state.session.broker.pending.find(
      (p: any) => p.price === bid - 3,
    );
    assert.equal(moved.id, above.id);
    assert.equal(moved.side, "buy");
    assert.equal(moved.kind, "limit");
    assert.equal(moved.sl, bid - 5);
    assert.equal(moved.tp, bid + 1);
    assert.equal(state.session.broker.pending.length, 2);
    assert.equal(state.session.broker.positions.length, 0);
    assert.equal(state.session.broker.fills.length, 0);
    assert.equal(state.session.broker.balance, 500);
    await w.call({ type: "pending.cancel", id: moved.id });
    const remaining = await w.call({ type: "state" });
    assert.equal(remaining.session.broker.pending.length, 1);
    assert.equal(remaining.session.broker.pending[0].id, below.id);
    assert.deepEqual(
      remaining.session.broker.fills,
      state.session.broker.fills,
    );
    assert.equal(remaining.session.broker.balance, 500);
    await w.call({ type: "freeze" });
    await w.call({ type: "shutdown" });
    await w.instance.terminate();
    w = worker(f.root);
    const restored = await w.call({ type: "state" });
    assert.deepEqual(
      restored.session.broker.pending,
      remaining.session.broker.pending,
    );
    await w.call({ type: "shutdown" });
  } finally {
    await w.instance.terminate();
    f.cleanup();
  }
});

test("new challenge blocks price advancement until committed, saves answer before reveal, and restores it exactly", async () => {
  const f = fixture();
  let w = worker(f.root);
  try {
    await w.call({
      type: "sessions.new",
      timestamp: f.base + 25 * 3600000,
      challenge: "candles",
    });
    let s = (await w.call({ type: "state" })).session;
    const id = s.learning.active.id,
      cutoff = s.tick.t;
    await assert.rejects(
      w.call({ type: "step", kind: "candle" }),
      /Lås svaret/,
    );
    await assert.rejects(w.call({ type: "play", value: true }), /Lås svaret/);
    await assert.rejects(
      w.call({ type: "challenge.reveal", id }),
      /Lock an answer/,
    );
    const high = s.learning.active.htf
      .filter((b: any) => (b.time + 14400) * 1000 <= cutoff)
      .at(-1).high;
    await w.call({
      type: "challenge.commit",
      id,
      value: { reason: "Ferdig candle med synlig topp før start", value: high },
    });
    const committed = (await w.call({ type: "state" })).session.learning.active;
    assert.equal(committed.cutoff, cutoff);
    assert.equal(committed.revealedAt, undefined);
    await w.call({ type: "shutdown" });
    await w.instance.terminate();
    w = worker(f.root);
    assert.deepEqual(
      (await w.call({ type: "state" })).session.learning.active,
      committed,
    );
    await w.call({ type: "challenge.reveal", id });
    s = (await w.call({ type: "state" })).session;
    assert.ok(s.tick.t > cutoff);
    assert.deepEqual(s.learning.active.answer, committed.answer);
    assert.deepEqual(s.learning.active.checks, committed.checks);
    await w.call({ type: "challenge.next" });
    s = (await w.call({ type: "state" })).session;
    assert.equal(s.learning.history.length, 1);
    assert.equal(s.learning.active.stage, "pair");
    await w.call({ type: "shutdown" });
  } finally {
    await w.instance.terminate();
    f.cleanup();
  }
});

test("pending revisions preserve original decisions and next-candle execution processes the intermediate fill and stop", async () => {
  const f = fixture(0.005),
    w = worker(f.root);
  try {
    await w.call({
      type: "sessions.new",
      timestamp: f.base + 25 * 3600000 + 7 * 60000,
    });
    let s = (await w.call({ type: "state" })).session;
    const bid = s.tick.bid;
    await w.call({
      type: "order",
      order: {
        side: "sell",
        kind: "limit",
        price: bid + 0.05,
        sl: bid + 0.2,
        tp: bid - 1,
        lots: 0.01,
        tags: [],
        thesis: "revision test",
        strategy: "test",
        setupId: "two-entry-idea",
      },
    });
    s = (await w.call({ type: "state" })).session;
    const id = s.broker.pending[0].id;
    await w.call({
      type: "pending.edit",
      id,
      changes: { price: bid + 0.02, sl: bid + 0.04 },
    });
    const st = new Store(f.root);
    const rows = st.db
      .prepare("SELECT id,payload FROM decisions WHERE session=?")
      .all(s.id);
    st.close();
    assert.equal(rows.length, 2);
    const original = JSON.parse(String(rows.find((r) => r.id !== id)!.payload)),
      revision = JSON.parse(String(rows.find((r) => r.id === id)!.payload));
    assert.equal(original.proposal.entry, bid + 0.05);
    assert.equal(revision.proposal.entry, bid + 0.02);
    assert.equal(revision.proposal.sl, bid + 0.04);
    await w.call({
      type: "ui",
      value: { layout: { ...s.layout, timeframe: "15m" } },
    });
    await w.call({ type: "step", kind: "candle" });
    s = (await w.call({ type: "state" })).session;
    assert.equal(s.broker.pending.length, 0);
    assert.equal(s.broker.positions.length, 0);
    assert.equal(s.broker.fills.length, 1);
    const fill = s.broker.fills[0];
    assert.equal(fill.positionId, id);
    assert.equal(fill.setupId, "two-entry-idea");
    assert.equal(fill.reason, "SL");
    assert.ok(fill.opened < fill.closed && fill.closed < s.tick.t);
    assert.ok(s.broker.seq >= 8);
    await w.call({ type: "shutdown" });
  } finally {
    await w.instance.terminate();
    f.cleanup();
  }
});

test("consecutive immediate coach answers release the task and do not require a downloaded model", async () => {
  const f = fixture(),
    w = worker(f.root);
  try {
    await w.call({ type: "sessions.new", timestamp: f.base + 25 * 3600000 });
    let s = (await w.call({ type: "state" })).session;
    for (const text of [
      "Which timeframe should I mark for 15m?",
      "Vurder oppsettet mitt med C1 og C2.",
    ]) {
      await w.call({
        type: "ai.ask",
        text,
        cursor: s.broker.seq,
        tradeId: "chart",
      });
      s = (await w.call({ type: "state" })).session;
      assert.equal(s.chat.at(-1).status, "complete");
      assert.equal(s.chat.at(-1).savedFacts, true);
    }
    assert.equal(s.chat.length, 4);
    await w.call({ type: "shutdown" });
  } finally {
    await w.instance.terminate();
    f.cleanup();
  }
});

test("independent drawing property edits do not reinstate hidden state or overwrite concurrent labels", async () => {
  const f = fixture(),
    w = worker(f.root);
  try {
    await w.call({ type: "sessions.new", timestamp: f.base + 25 * 3600000 });
    const s = (await w.call({ type: "state" })).session;
    const d = {
      id: "atomic-object",
      kind: "fib",
      a: { time: s.tick.t / 1000 - 600, price: 2000 },
      b: { time: s.tick.t / 1000, price: 2020 },
      color: "#49d3c6",
      locked: false,
      label: "original",
      levels: [0, 0.5, 1],
      createdCursor: s.broker.seq,
    };
    await w.call({ type: "drawings", value: [d] });
    await w.call({ type: "drawing.patch", id: d.id, patch: { hidden: true } });
    await w.call({ type: "drawing.patch", id: d.id, patch: { hidden: false } });
    await w.call({ type: "drawing.patch", id: d.id, patch: { locked: true } });
    await w.call({
      type: "drawing.patch",
      id: d.id,
      patch: { label: "renamed" },
    });
    const saved = (await w.call({ type: "state" })).session.drawings[0];
    assert.equal(saved.hidden, false);
    assert.equal(saved.locked, true);
    assert.equal(saved.label, "renamed");
    assert.deepEqual(saved.a, d.a);
    await w.call({ type: "drawing.remove", id: d.id });
    await w.call({ type: "drawing.undo" });
    assert.deepEqual(
      (await w.call({ type: "state" })).session.drawings[0],
      saved,
    );
    await w.call({ type: "shutdown" });
  } finally {
    await w.instance.terminate();
    f.cleanup();
  }
});

test("challenge can start in an existing session, preserves abandoned attempts and saves feedback across restart", async () => {
  const f = fixture();
  let w = worker(f.root);
  try {
    await w.call({ type: "sessions.new", timestamp: f.base + 25 * 3600000 });
    let state = await w.call({ type: "state" });
    const original = structuredClone(state.session);
    await w.call({
      type: "ai.settings",
      value: { ...state.settings, enabled: false },
    });
    await w.call({ type: "challenge.start", stage: "frames" });
    let s = (await w.call({ type: "state" })).session;
    assert.equal(s.id, original.id);
    assert.deepEqual(s.broker, original.broker);
    assert.deepEqual(s.drawings, original.drawings);
    assert.deepEqual(s.chat, original.chat);
    assert.deepEqual(s.tick, original.tick);
    const abandoned = s.learning.active.id;
    await w.call({ type: "challenge.start", stage: "frames" });
    s = (await w.call({ type: "state" })).session;
    assert.equal(s.learning.history[0].id, abandoned);
    await w.call({
      type: "challenge.commit",
      id: s.learning.active.id,
      value: { value: 8, reason: "Jeg teller åtte perioder i fire timer." },
    });
    await w.call({ type: "challenge.feedback", id: s.learning.active.id });
    s = (await w.call({ type: "state" })).session;
    assert.equal(s.learning.active.feedback.assessment, "needs-practice");
    assert.equal(s.learning.active.feedback.source, "checks");
    await w.call({ type: "shutdown" });
    await w.instance.terminate();
    w = worker(f.root);
    assert.deepEqual(
      (await w.call({ type: "state" })).session.learning,
      s.learning,
    );
    await w.call({ type: "shutdown" });
  } finally {
    await w.instance.terminate();
    f.cleanup();
  }
});

test("interrupted challenge review recovers its answer and can return to free practice", async () => {
  const f = fixture();
  let w = worker(f.root);
  try {
    await w.call({ type: "sessions.new", timestamp: f.base + 25 * 3600000 });
    await w.call({ type: "challenge.start", stage: "frames" });
    let s = (await w.call({ type: "state" })).session;
    await w.call({
      type: "challenge.commit",
      id: s.learning.active.id,
      value: {
        value: 16,
        reason: "Jeg regner om fire timer til minutter og deler på femten.",
      },
    });
    s = (await w.call({ type: "state" })).session;
    await w.call({ type: "shutdown" });
    await w.instance.terminate();
    const store = new Store(f.root);
    const saved = store.load(s.id)!;
    saved.learning!.active.feedback!.status = "generating";
    store.save(saved);
    store.close();
    w = worker(f.root);
    let restored = (await w.call({ type: "state" })).session;
    assert.equal(restored.learning.active.feedback.status, "complete");
    assert.equal(restored.learning.active.feedback.source, "checks");
    assert.deepEqual(restored.learning.active.answer, s.learning.active.answer);
    await w.call({ type: "challenge.start", stage: "candles" });
    restored = (await w.call({ type: "state" })).session;
    const id = restored.learning.active.id;
    await assert.rejects(
      w.call({ type: "step", kind: "candle" }),
      /Lås svaret/,
    );
    await w.call({ type: "challenge.end" });
    await w.call({ type: "step", kind: "candle" });
    s = (await w.call({ type: "state" })).session;
    assert.ok(s.learning.active.endedAt);
    assert.equal(s.learning.active.id, id);
    assert.equal(s.learning.active.answer, undefined);
    assert.ok(s.tick.t > restored.tick.t);
    await w.call({ type: "shutdown" });
  } finally {
    await w.instance.terminate();
    f.cleanup();
  }
});
