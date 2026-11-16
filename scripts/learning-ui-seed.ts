import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { Store, decodeTicks, sha, type Chunk } from "../src/data/store";
import { Replay } from "../src/core/replay";
import { fromTicks } from "../src/core/bars";
import { DEFAULT_AI } from "../src/types";
const root = path.resolve("artifacts/learning-checks/ui-profile");
mkdirSync(root, { recursive: true });
const marketFile = process.env.RETRACE_MARKET_FIXTURE;
if (!marketFile)
  throw Error(
    "Set RETRACE_MARKET_FIXTURE to an existing PUBLIC market-fixture database. Only market chunks are read; sessions are never copied.",
  );
const source = new DatabaseSync(marketFile, { readOnly: true });
const chunks = source
  .prepare(
    "SELECT * FROM chunks WHERE dataset='dukascopy' ORDER BY hour LIMIT 120",
  )
  .all() as unknown as Chunk[];
source.close();
const store = new Store(root);
const manifest = [];
for (const c of chunks) {
  if (c.status === "ready") {
    const bytes = readFileSync(c.path);
    if (sha(bytes) !== c.sha) throw Error("Market source hash mismatch");
    const ticks = decodeTicks(gunzipSync(bytes));
    const copy = store.writeTicks(
      c.dataset,
      c.hour,
      ticks,
      {
        ...JSON.parse(c.provenance),
        testCopy: "public historical market prices only",
      },
      c.bytes,
    );
    store.putChunk(copy, fromTicks(ticks));
    manifest.push({ hour: c.hour, count: c.count, sha: c.sha });
  } else store.putChunk({ ...c, path: "" });
}
const eligible = new Replay(store).eligible();
if (!eligible.length) throw Error("No eligible historical practice hour");
const timestamp = eligible[Math.min(3, eligible.length - 1)].hour;
store.set("aiSettings", { ...DEFAULT_AI, enabled: false, lazy: true });
store.set("discordSettings", { enabled: false });
store.close();
const instance = new Worker(path.resolve("dist-electron/worker.cjs"), {
  workerData: {
    root,
    project: process.cwd(),
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
const call = (command: any) =>
  new Promise<any>((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    instance.postMessage({ id, command });
  });
try {
  await call({ type: "sessions.new", timestamp });
  await call({ type: "study.context", value: "entry" });
  let state = await call({ type: "state" });
  await call({
    type: "study.range",
    timeframe: "4H",
    cursor: state.session.broker.seq,
  });
  state = await call({ type: "state" });
  await call({
    type: "study.commit",
    rangeId: state.session.study.range.id,
    cursor: state.session.broker.seq,
    lesson: "candles",
    value: {
      decision: "skip",
      objective: "",
      invalidation: "",
      confirmation: "Bevart eldre studie: jeg venter på en ferdig bekreftelse.",
    },
  });
  await call({ type: "challenge.start", stage: "frames" });
  state = await call({ type: "state" });
  await call({
    type: "challenge.commit",
    id: state.session.learning.active.id,
    value: {
      value: 16,
      reason:
        "Bevart eldre svar: fire timer delt i femten minutter gir seksten perioder.",
    },
  });
  await call({ type: "shutdown" });
  await instance.terminate();
  const own = new Store(root),
    saved = own.load(state.session.id)!;
  saved.learning!.active.version = "retrace-foundations-v2";
  saved.learning!.active.revealedAt = saved.tick.t;
  saved.learning!.active.feedback!.assessment = "checked";
  own.save(saved);
  own.close();
  writeFileSync(
    path.resolve("artifacts/learning-checks/ui-seed.json"),
    JSON.stringify(
      {
        root,
        sessionId: saved.id,
        legacyStudy: saved.study,
        legacyLearning: saved.learning,
        market: manifest,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      root,
      session: saved.id,
      marketChunks: manifest.length,
      timestamp: saved.tick.t,
      legacyAttempts: saved.study?.attempts.length,
    }),
  );
} finally {
  await instance.terminate();
}
