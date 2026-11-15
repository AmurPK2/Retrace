import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  openSync,
  fsyncSync,
  closeSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import type { Tick, Bar, Session } from "../types";
export type Chunk = {
  dataset: string;
  hour: number;
  status: string;
  path: string;
  count: number;
  first: number | null;
  last: number | null;
  bytes: number;
  sha: string;
  provenance: string;
};
export const sha = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");
export function atomicWrite(file: string, data: string | Buffer) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  const fd = openSync(tmp, "w");
  try {
    writeFileSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
}
export class Store {
  db: DatabaseSync;
  root: string;
  get marketRoot() {
    return this.meta<string>("marketDirectory", this.root);
  }
  constructor(root: string) {
    this.root = root;
    mkdirSync(root, { recursive: true });
    this.db = new DatabaseSync(path.join(root, "replay.sqlite"));
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=10000;",
    );
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,name TEXT NOT NULL,updated INTEGER,start INTEGER,mode TEXT,payload TEXT NOT NULL);CREATE TABLE IF NOT EXISTS chunks(dataset TEXT,hour INTEGER,status TEXT,path TEXT,count INTEGER,first INTEGER,last INTEGER,bytes INTEGER,sha TEXT,provenance TEXT,PRIMARY KEY(dataset,hour));CREATE TABLE IF NOT EXISTS bars(dataset TEXT,time INTEGER,open REAL,high REAL,low REAL,close REAL,count INTEGER,PRIMARY KEY(dataset,time));CREATE INDEX IF NOT EXISTS chunks_status ON chunks(dataset,status,hour);CREATE TABLE IF NOT EXISTS hourbars(dataset TEXT,time INTEGER,open REAL,high REAL,low REAL,close REAL,count INTEGER,PRIMARY KEY(dataset,time));`,
    );
  }
  meta<T>(key: string, fallback: T): T {
    const row = this.db.prepare("SELECT value FROM meta WHERE key=?").get(key);
    return row ? JSON.parse(String(row.value)) : fallback;
  }
  set(key: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, JSON.stringify(value));
  }
  transaction<T>(fn: () => T): T {
    if (this.db.isTransaction) return fn();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const r = fn();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  save(s: Session) {
    s.updated = Date.now();
    this.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO sessions VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,updated=excluded.updated,start=excluded.start,mode=excluded.mode,payload=excluded.payload",
        )
        .run(s.id, s.name, s.updated, s.start, s.mode, JSON.stringify(s));
      this.set("lastSession", s.id);
    });
  }
  load(id: string): Session | null {
    const row = this.db
      .prepare("SELECT payload FROM sessions WHERE id=?")
      .get(id);
    return row ? JSON.parse(String(row.payload)) : null;
  }
  list() {
    return this.db
      .prepare(
        "SELECT id,name,updated,start,mode FROM sessions ORDER BY updated DESC",
      )
      .all();
  }
  chunk(dataset: string, hour: number): Chunk | undefined {
    return this.db
      .prepare("SELECT * FROM chunks WHERE dataset=? AND hour=?")
      .get(dataset, hour) as Chunk | undefined;
  }
  chunks(dataset: string) {
    return this.db
      .prepare("SELECT * FROM chunks WHERE dataset=? ORDER BY hour")
      .all(dataset) as Chunk[];
  }
  bars(dataset: string, from: number, through: number): Bar[] {
    return this.db
      .prepare(
        "SELECT time,open,high,low,close,count FROM bars WHERE dataset=? AND time>=? AND time<? ORDER BY time",
      )
      .all(
        dataset,
        Math.floor(from / 1000),
        Math.floor(through / 1000),
      ) as unknown as Bar[];
  }
  groupedBars(
    dataset: string,
    from: number,
    through: number,
    seconds: number,
  ): Bar[] {
    const table = seconds >= 3600 ? "hourbars" : "bars";
    return this.db
      .prepare(
        `WITH grouped AS (
      SELECT CAST(time / ? AS INTEGER) * ? AS time, MIN(time) AS first,
      MAX(time) AS last, MAX(high) AS high, MIN(low) AS low, SUM(count) AS count
      FROM ${table} WHERE dataset=? AND time>=? AND time<?
      GROUP BY CAST(time / ? AS INTEGER)
    ) SELECT g.time,f.open,g.high,g.low,l.close,g.count FROM grouped g
      JOIN ${table} f ON f.dataset=? AND f.time=g.first
      JOIN ${table} l ON l.dataset=? AND l.time=g.last ORDER BY g.time`,
      )
      .all(
        seconds,
        seconds,
        dataset,
        Math.floor(from / 1000),
        Math.floor(through / 1000),
        seconds,
        dataset,
        dataset,
      ) as unknown as Bar[];
  }
  putChunk(c: Chunk, bars: Bar[] = []) {
    this.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO chunks VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(dataset,hour) DO UPDATE SET status=excluded.status,path=excluded.path,count=excluded.count,first=excluded.first,last=excluded.last,bytes=excluded.bytes,sha=excluded.sha,provenance=excluded.provenance",
        )
        .run(
          c.dataset,
          c.hour,
          c.status,
          c.path,
          c.count,
          c.first,
          c.last,
          c.bytes,
          c.sha,
          c.provenance,
        );
      const put = this.db.prepare(
        "INSERT OR REPLACE INTO bars VALUES(?,?,?,?,?,?,?)",
      );
      for (const b of bars)
        put.run(c.dataset, b.time, b.open, b.high, b.low, b.close, b.count);
      if (bars.length)
        this.db
          .prepare("INSERT OR REPLACE INTO hourbars VALUES(?,?,?,?,?,?,?)")
          .run(
            c.dataset,
            c.hour / 1000,
            bars[0].open,
            Math.max(...bars.map((b) => b.high)),
            Math.min(...bars.map((b) => b.low)),
            bars.at(-1)!.close,
            bars.reduce((n, b) => n + b.count, 0),
          );
    });
  }
  writeTicks(
    dataset: string,
    hour: number,
    ticks: Tick[],
    provenance: object,
    sourceBytes: number,
  ) {
    const binary = encodeTicks(ticks);
    const zipped = gzipSync(binary, { level: 5 });
    const digest = sha(zipped);
    // A checkpoint must never overwrite the bytes referenced by an earlier
    // committed database row. Unreferenced interrupted writes are harmless.
    const safe = sha(dataset).slice(0, 16),
      relative = `ticks/${safe}/${hour}-${digest.slice(0, 24)}.ticks.gz`;
    const target = path.join(this.marketRoot, relative);
    atomicWrite(target, zipped);
    return {
      dataset,
      hour,
      status: ticks.length ? "ready" : "empty",
      path: path.resolve(target),
      count: ticks.length,
      first: ticks[0]?.t ?? null,
      last: ticks.at(-1)?.t ?? null,
      bytes: sourceBytes,
      sha: digest,
      provenance: JSON.stringify({
        ...provenance,
        storedBytes: zipped.length,
        rawSha256: sha(binary),
        format: "f64le utc-ms,bid,ask,f32le bid/ask quote volumes,32 bytes",
      }),
    };
  }
  readTicks(c: Chunk) {
    if (!c.path) return [];
    const target = path.resolve(this.root, c.path);
    if (
      ![this.root, ...this.meta<string[]>("marketRoots", [])].some((root) =>
        target.startsWith(path.resolve(root) + path.sep),
      )
    )
      throw Error("Invalid chunk path.");
    const bytes = readFileSync(target);
    if (sha(bytes) !== c.sha) throw Error("Integrity failure in " + c.hour);
    return decodeTicks(gunzipSync(bytes));
  }
  checkpoint() {
    this.db.exec("PRAGMA wal_checkpoint(FULL)");
  }
  close() {
    this.checkpoint();
    this.db.close();
  }
  hourBars(dataset: string, from: number, through: number): Bar[] {
    return this.db
      .prepare(
        "SELECT time,open,high,low,close,count FROM hourbars WHERE dataset=? AND time>=? AND time<? ORDER BY time",
      )
      .all(
        dataset,
        Math.floor(from / 1000),
        Math.floor(through / 1000),
      ) as unknown as Bar[];
  }
  ensureHours() {
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS hourbars(dataset TEXT,time INTEGER,open REAL,high REAL,low REAL,close REAL,count INTEGER,PRIMARY KEY(dataset,time));",
    );
    this.db.exec(
      `INSERT OR IGNORE INTO hourbars WITH grouped AS (SELECT dataset,CAST(time/3600 AS INTEGER)*3600 AS time,MIN(time) AS first,MAX(time) AS last,MAX(high) AS high,MIN(low) AS low,SUM(count) AS count FROM bars GROUP BY dataset,CAST(time/3600 AS INTEGER)) SELECT g.dataset,g.time,f.open,g.high,g.low,l.close,g.count FROM grouped g JOIN bars f ON f.dataset=g.dataset AND f.time=g.first JOIN bars l ON l.dataset=g.dataset AND l.time=g.last;`,
    );
  }
}
export function encodeTicks(ticks: Tick[]) {
  const out = Buffer.alloc(ticks.length * 32);
  ticks.forEach((q, i) => {
    const o = i * 32;
    out.writeDoubleLE(q.t, o);
    out.writeDoubleLE(q.bid, o + 8);
    out.writeDoubleLE(q.ask, o + 16);
    out.writeFloatLE(q.bv ?? 0, o + 24);
    out.writeFloatLE(q.av ?? 0, o + 28);
  });
  return out;
}
export function decodeTicks(b: Buffer): Tick[] {
  if (b.length % 32) throw Error("Corrupt tick chunk.");
  const out = [];
  for (let o = 0; o < b.length; o += 32)
    out.push({
      t: b.readDoubleLE(o),
      bid: b.readDoubleLE(o + 8),
      ask: b.readDoubleLE(o + 16),
      bv: b.readFloatLE(o + 24),
      av: b.readFloatLE(o + 28),
    });
  return out;
}
