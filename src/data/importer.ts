import {
  INSTRUMENTS,
  closedHour,
  openGapMillis,
  type InstrumentId,
} from "../core/instruments";
import lzmaModule from "lzma/src/lzma_worker.js";
const LZMA_WORKER = lzmaModule.LZMA_WORKER;
const { decompress } = LZMA_WORKER;
import { Store, sha, atomicWrite } from "./store";
import { fromTicks, knownClosure } from "../core/bars";
import { type Tick } from "../types";
import path from "node:path";
import { readFileSync } from "node:fs";
import { tickGaps } from "./quality";
// Price step is explicitly sourced from Dukascopy's XAU/USD instrument metadata,
// NOT a symbol-length heuristic. See docs/DATA.md and the pinned metadata receipt.
export const DUKA = {
  symbol: "XAUUSD",
  divisor: 1000,
  precision: 3,
  recordBytes: 20,
  timestampUnit: "milliseconds from UTC hour",
  metadata:
    "https://www.dukascopy.com/client/javadoc3/com/dukascopy/api/Instrument.html",
};
export function urlFor(hour: number, instrument: InstrumentId = "XAUUSD") {
  const d = new Date(hour),
    p = (n: number) => String(n).padStart(2, "0");
  return `https://datafeed.dukascopy.com/datafeed/${INSTRUMENTS[instrument].symbol}/${d.getUTCFullYear()}/${p(d.getUTCMonth())}/${p(d.getUTCDate())}/${p(d.getUTCHours())}h_ticks.bi5`;
}
export async function decodeBi5(
  data: Buffer,
  hour: number,
  divisor = DUKA.divisor,
) {
  if (!data.length) return { ticks: [], invalid: 0, duplicates: 0 };
  const bytes = await new Promise<Buffer>((resolve, reject) =>
    decompress(data, (r, e) =>
      e
        ? reject(e)
        : resolve(
            typeof r === "string" ? Buffer.from(r, "binary") : Buffer.from(r),
          ),
    ),
  );
  if (bytes.length % 20) throw Error("BI5 length is not divisible by 20");
  let invalid = 0,
    duplicates = 0;
  const rows: (Tick & { i: number })[] = [];
  for (let o = 0; o < bytes.length; o += 20) {
    const ms = bytes.readUInt32BE(o),
      ask = bytes.readUInt32BE(o + 4) / divisor,
      bid = bytes.readUInt32BE(o + 8) / divisor,
      av = bytes.readFloatBE(o + 12),
      bv = bytes.readFloatBE(o + 16);
    if (
      ms >= 3600000 ||
      !Number.isFinite(bid) ||
      !Number.isFinite(ask) ||
      bid <= 0 ||
      ask < bid ||
      !Number.isFinite(av) ||
      !Number.isFinite(bv) ||
      av < 0 ||
      bv < 0
    ) {
      invalid++;
      continue;
    }
    rows.push({ t: hour + ms, bid, ask, av, bv, i: o / 20 });
  }
  rows.sort((a, b) => a.t - b.t || a.i - b.i);
  let lastKey = "";
  const ticks: Tick[] = [];
  for (const { i, ...q } of rows) {
    const k = `${q.t}:${q.bid}:${q.ask}:${q.av}:${q.bv}`;
    if (lastKey === k) {
      duplicates++;
      continue;
    }
    lastKey = k;
    ticks.push(q);
  }
  return { ticks, invalid, duplicates };
}
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
export function retryAfterMs(value: string | null, now = Date.now()) {
  if (!value) return 120000;
  const seconds = Number(value);
  const wait = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(value) - now;
  return Number.isFinite(wait)
    ? Math.min(86400000, Math.max(1000, wait))
    : 30000;
}
export class Importer {
  private nextFetchAt = 0;
  private cooldownUntil = 0;
  private async wait(ms: number) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (this.paused) throw Error("Import paused.");
      await delay(Math.min(250, end - Date.now()));
    }
  }
  private async fetchSlot() {
    const at = Math.max(Date.now(), this.nextFetchAt, this.cooldownUntil);
    this.nextFetchAt = at + 1800;
    await this.wait(Math.max(0, at - Date.now()));
    while (Date.now() < this.cooldownUntil)
      await this.wait(Math.min(1000, this.cooldownUntil - Date.now()));
  }
  paused = false;
  cancelled = false;
  active = new Set<AbortController>();
  progress = {
    running: false,
    done: 0,
    total: 0,
    bytes: 0,
    error: "",
    current: "",
    paused: false,
  };
  constructor(
    public store: Store,
    public notify: (p: typeof Importer.prototype.progress) => void = () => {},
    public instrument: InstrumentId = "XAUUSD",
  ) {}
  get dataset() {
    return INSTRUMENTS[this.instrument].dataset;
  }
  get metadata() {
    return {
      ...DUKA,
      ...INSTRUMENTS[this.instrument],
      precision: INSTRUMENTS[this.instrument].specs.precision,
    };
  }
  stop() {
    this.paused = true;
    this.progress.paused = true;
    for (const c of this.active) c.abort();
    this.notify(this.progress);
  }
  async fetch(hour: number): Promise<Buffer | null> {
    let last: Error | undefined;
    for (let i = 0; i < 4; i++) {
      if (this.paused) throw Error("Import paused.");
      await this.fetchSlot();
      const c = new AbortController();
      this.active.add(c);
      const timer = setTimeout(() => c.abort(), 30000);
      try {
        const r = await fetch(urlFor(hour, this.instrument), {
          signal: c.signal,
          headers: {
            "User-Agent": "XAUUSD-Replay/0.1 (personal historical study)",
          },
        });
        if (r.status === 429 || r.status === 503) {
          const wait = retryAfterMs(r.headers.get("retry-after"));
          this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + wait);
          this.notify({
            ...this.progress,
            current:
              "Price source requested a wait; retrying automatically after " +
              Math.ceil(wait / 1000) +
              " seconds.",
          });
        }
        if (r.status === 404) return null;
        if (!r.ok) throw Error(`HTTP ${r.status}`);
        return Buffer.from(await r.arrayBuffer());
      } catch (e) {
        last = e as Error;
        if (this.paused) throw last;
        await this.wait(2000 * 2 ** i);
      } finally {
        clearTimeout(timer);
        this.active.delete(c);
      }
    }
    throw last;
  }
  async latestCompleteDay(now = Date.now()) {
    let day = Math.floor(now / 86400000) * 86400000 - 86400000;
    for (let i = 0; i < 21; i++, day -= 86400000) {
      if (closedHour(day + 12 * 3600000, this.instrument)) continue;
      const cached = this.store.chunk(this.dataset, day + 12 * 3600000);
      if (cached?.status === "ready") {
        try {
          if (this.store.readTicks(cached).length) return day;
        } catch {
          /* Continue to the original source; range() repairs the cache. */
        }
      }
      const data = await this.fetch(day + 12 * 3600000);
      if (data?.length) {
        const { ticks } = await decodeBi5(
          data,
          day + 12 * 3600000,
          this.metadata.divisor,
        );
        if (ticks.length) return day;
      }
    }
    throw Error(
      "No completed historical day was found in the last 21 days. Select a date or import CSV.",
    );
  }
  async year() {
    const end = await this.latestCompleteDay();
    const d = new Date(end);
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    const from = d.getTime() + 86400000;
    return this.range(from - 8 * 86400000, end + 86400000, {
      replayFrom: from,
      replayTo: end + 86400000,
      warmupDays: 8,
    });
  }
  async range(from: number, to: number, extra: object = {}) {
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      to <= from ||
      to - from > 380 * 86400000
    )
      throw Error("Select up to 380 days.");
    this.paused = false;
    const lease = this.store.meta<{ pid: number } | null>("importLease", null);
    if (lease && lease.pid !== process.pid) {
      try {
        process.kill(lease.pid, 0);
        throw Error("An import is already running.");
      } catch (e) {
        if (/already running|already|allerede/.test(String(e))) throw e;
      }
    }
    this.store.set("importLease", { pid: process.pid, started: Date.now() });
    this.store.set("importPause", false);
    this.progress = {
      running: true,
      done: 0,
      total: Math.ceil((to - from) / 3600000),
      bytes: 0,
      error: "",
      current: "",
      paused: false,
    };
    this.store.set("importRange:" + this.dataset, { from, to, ...extra });
    const queue: number[] = [];
    for (let h = Math.floor(from / 3600000) * 3600000; h < to; h += 3600000)
      queue.push(h);
    const work = async () => {
      while (queue.length && !this.paused) {
        if (this.store.meta("importPause", false)) {
          this.stop();
          break;
        }
        const hour = queue.shift()!;
        this.progress.current = new Date(hour).toISOString();
        let old = this.store.chunk(this.dataset, hour);
        // A corrupt cache is recoverable in this same pass. Do not need two imports.
        if (old?.status === "closure" && !closedHour(hour, this.instrument))
          old = undefined;
        if (old?.status === "ready") {
          try {
            const cachedTicks = this.store.readTicks(old);
            if (
              JSON.parse(old.provenance).unexpectedGaps?.length ||
              tickGaps(cachedTicks, hour, this.instrument).length
            )
              old = undefined;
          } catch {
            old = undefined;
          }
        }
        try {
          if (old && ["ready", "closure"].includes(old.status)) {
            if (old.status === "ready") this.store.readTicks(old);
            this.progress.bytes += old.bytes;
          } else if (closedHour(hour, this.instrument)) {
            this.store.putChunk({
              dataset: this.dataset,
              hour,
              status: "closure",
              path: "",
              count: 0,
              first: null,
              last: null,
              bytes: 0,
              sha: "",
              provenance: JSON.stringify({
                schedule:
                  this.instrument +
                  " recurring calendar v1; America/New_York DST",
                kind: "recurring market break",
              }),
            });
          } else {
            let data: Buffer | null = null;
            let recoveredSource = false;
            // Reuse original compressed bytes only with an existing SHA receipt.
            try {
              const receipt = this.store.chunk(this.dataset, hour);
              const expected =
                receipt && JSON.parse(receipt.provenance).sourceSha256;
              if (expected) {
                const original = readFileSync(
                  path.join(
                    this.store.marketRoot,
                    "source",
                    this.metadata.symbol,
                    `${hour}.bi5`,
                  ),
                );
                if (sha(original) === expected) {
                  const decoded = await decodeBi5(
                    original,
                    hour,
                    this.metadata.divisor,
                  );
                  if (
                    decoded.ticks.length &&
                    !decoded.invalid &&
                    !tickGaps(decoded.ticks, hour, this.instrument).length
                  ) {
                    data = original;
                    recoveredSource = true;
                  }
                }
              }
            } catch {
              /* Unverified originals cannot repair a cache. Fetch instead. */
            }
            if (!data) data = await this.fetch(hour);
            if (!data?.length) {
              this.store.putChunk({
                dataset: this.dataset,
                hour,
                status: "missing",
                path: "",
                count: 0,
                first: null,
                last: null,
                bytes: 0,
                sha: "",
                provenance: JSON.stringify({
                  url: urlFor(hour, this.instrument),
                  http: data === null ? 404 : 200,
                  checkedAt: Date.now(),
                  note: "unverified gap, not assumed holiday",
                }),
              });
            } else {
              const result = await decodeBi5(data, hour, this.metadata.divisor);
              if (!result.ticks.length)
                throw Error("No valid ticks in an open hour.");
              atomicWrite(
                path.join(
                  this.store.marketRoot,
                  "source",
                  this.metadata.symbol,
                  `${hour}.bi5`,
                ),
                data,
              );
              if (result.invalid)
                throw Error("Invalid source ticks; hour remains unavailable.");
              const unexpectedGaps = tickGaps(
                result.ticks,
                hour,
                this.instrument,
              );
              const c = this.store.writeTicks(
                this.dataset,
                hour,
                result.ticks,
                {
                  url: urlFor(hour, this.instrument),
                  downloadedAt: Date.now(),
                  recoveredSource,
                  sourceSha256: sha(data),
                  ...this.metadata,
                  invalid: result.invalid,
                  duplicates: result.duplicates,
                  unexpectedGaps,
                },
                data.length,
              );
              this.store.putChunk(c, fromTicks(result.ticks));
              this.progress.bytes += data.length;
            }
          }
          this.progress.done++;
        } catch (e) {
          if (!this.paused)
            this.progress.error = `${new Date(hour).toISOString()}: ${String(e)}`;
          if (!this.paused) {
            this.store.set("lastImportError", this.progress.error);
            this.store.putChunk({
              dataset: this.dataset,
              hour,
              status: "missing",
              path: "",
              count: 0,
              first: null,
              last: null,
              bytes: 0,
              sha: "",
              provenance: JSON.stringify({
                url: urlFor(hour, this.instrument),
                error: this.progress.error,
                checkedAt: Date.now(),
                note: "failed download; not assumed holiday",
              }),
            });
          }
        }
        this.notify({ ...this.progress });
        this.store.set("importProgress", this.progress);
      }
    };
    await work(); // One polite request stream per app; bounded retries and shared cooldown.
    this.progress.running = false;
    this.notify({ ...this.progress });
    this.store.set("importProgress", this.progress);
    this.store.set("importLease", null);
    return { ...this.progress, dataset: this.dataset };
  }
}
