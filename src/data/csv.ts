import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { setImmediate as yieldIO } from "node:timers/promises";
import { parse } from "csv-parse";
import { Store, sha } from "./store";
import { fromTicks, knownClosure } from "../core/bars";
import type { Tick } from "../types";
export type CSVMapping = {
  timestamp: string;
  bid: string;
  ask: string;
  bidVolume?: string;
  askVolume?: string;
  timezone: string;
  unit: "iso" | "ms" | "s";
  delimiter: string;
};
export function parseTimestamp(
  value: string,
  timezone: string,
  unit: CSVMapping["unit"],
) {
  value = String(value).trim();
  if (unit !== "iso") {
    const n = Number(value) * (unit === "s" ? 1000 : 1);
    if (!Number.isFinite(n) || n < 946684800000 || n > Date.now() + 86400000)
      throw Error("Invalid epoch timestamp.");
    return n;
  }
  if (/(?:Z|[+-]\d\d:?\d\d)$/i.test(value)) {
    const t = Date.parse(value);
    if (!Number.isFinite(t)) throw Error("Invalid ISO timestamp.");
    return t;
  }
  const match = value.match(
    /^(\d{4})[-.](\d{2})[-.](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?$/,
  );
  if (!match)
    throw Error(
      "Timestamps without a UTC offset must use YYYY-MM-DD HH:mm:ss[.SSS].",
    );
  const [, y, m, d, h, mi, se, ms] = match;
  const naive = Date.UTC(
    +y,
    +m - 1,
    +d,
    +h,
    +mi,
    +se,
    Number((ms ?? "0").padEnd(3, "0")),
  );
  const calendar = new Date(naive);
  if (
    calendar.getUTCFullYear() !== +y ||
    calendar.getUTCMonth() !== +m - 1 ||
    calendar.getUTCDate() !== +d ||
    calendar.getUTCHours() !== +h ||
    calendar.getUTCMinutes() !== +mi ||
    calendar.getUTCSeconds() !== +se
  )
    throw Error("Invalid calendar date.");
  if (timezone === "UTC") return naive;
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const desired = `${y}-${m}-${d} ${h}:${mi}:${se}`;
  const candidates = [];
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const candidate = naive - offset * 60000;
    if (fmt.format(candidate) === desired) candidates.push(candidate);
  }
  if (candidates.length !== 1)
    throw Error(
      "Ambiguous or invalid local time at DST. Use ISO timestamps with an explicit UTC offset.",
    );
  return candidates[0];
}
export type CSVProgress = {
  kind: "csv";
  running: boolean;
  done: number;
  total: number;
  bytes: number;
  count: number;
  error: string;
  current: string;
  paused: boolean;
};
export async function importCSV(
  store: Store,
  file: string,
  m: CSVMapping,
  notify: (p: CSVProgress) => void = () => {},
  isCancelled: () => boolean = () => false,
) {
  new Intl.DateTimeFormat("en", { timeZone: m.timezone });
  file = path.resolve(file);
  const source = statSync(file);
  const dataset =
    "csv-" +
    sha(JSON.stringify([file, source.size, source.mtimeMs, m])).slice(0, 20);
  let hour = -1,
    rows: Tick[] = [],
    count = 0,
    last = -1,
    invalid = 0,
    duplicates = 0,
    previous = "",
    scanned = 0,
    paused = false;
  const input = createReadStream(file);
  const progress = (running: boolean, error = "") => {
    const p: CSVProgress = {
      kind: "csv",
      running,
      done: input.bytesRead,
      total: source.size,
      bytes: input.bytesRead,
      count,
      error,
      current: path.basename(file),
      paused,
    };
    store.set("importProgress", p);
    notify(p);
  };
  const flush = (partial = false) => {
    if (!rows.length) return;
    const old = store.chunk(dataset, hour);
    if (partial && old && old.count >= rows.length) {
      rows = [];
      return;
    }
    const c = store.writeTicks(
      dataset,
      hour,
      rows,
      {
        source: "CSV user import",
        file,
        mapping: m,
        importedAt: Date.now(),
        invalid,
        duplicates,
        unexpectedGaps: rows.flatMap((q, i) =>
          i > 0 && q.t - rows[i - 1].t > 300000
            ? [{ from: rows[i - 1].t, to: q.t }]
            : [],
        ),
        partial,
      },
      rows.length * 32,
    );
    if (partial) c.status = "partial";
    store.putChunk(c, fromTicks(rows));
    rows = [];
  };
  const stream = input.pipe(
    parse({
      columns: (header: string[]) => {
        for (const column of [
          m.timestamp,
          m.bid,
          m.ask,
          m.bidVolume,
          m.askVolume,
        ].filter(Boolean))
          if (!header.includes(column!))
            throw Error("CSV is missing the column: " + column);
        return header;
      },
      delimiter: m.delimiter,
      bom: true,
      skip_empty_lines: true,
      relax_column_count: false,
    }),
  );
  input.on("error", (e) => stream.destroy(e));
  progress(true);
  try {
    for await (const row of stream) {
      if (++scanned % 10000 === 0) {
        progress(true);
        await yieldIO();
      }
      if (isCancelled()) {
        paused = true;
        break;
      }
      let t: number;
      try {
        t = parseTimestamp(row[m.timestamp], m.timezone, m.unit);
      } catch {
        invalid++;
        continue;
      }
      const bid = Number(row[m.bid]),
        ask = Number(row[m.ask]),
        bv = m.bidVolume ? Number(row[m.bidVolume]) : 0,
        av = m.askVolume ? Number(row[m.askVolume]) : 0;
      if (
        !Number.isFinite(t) ||
        bid <= 0 ||
        ask < bid ||
        !Number.isFinite(bid) ||
        !Number.isFinite(ask) ||
        !Number.isFinite(bv) ||
        !Number.isFinite(av) ||
        bv < 0 ||
        av < 0
      ) {
        invalid++;
        continue;
      }
      if (t < last)
        throw Error(
          "CSV must be stably sorted by time. Equal timestamps preserve file order.",
        );
      const key = [t, bid, ask, bv, av].join(":");
      if (key === previous) {
        duplicates++;
        continue;
      }
      previous = key;
      last = t;
      const h = Math.floor(t / 3600000) * 3600000;
      if (h !== hour) {
        flush();
        // This is a labeled simulator schedule assumption, not holiday proof.
        // Unscheduled absent hours remain unknown and stop replay.
        if (hour >= 0)
          for (let missing = hour + 3600000; missing < h; missing += 3600000) {
            if (knownClosure(missing))
              store.putChunk({
                dataset,
                hour: missing,
                status: "closure",
                path: "",
                count: 0,
                first: null,
                last: null,
                bytes: 0,
                sha: "",
                provenance: JSON.stringify({
                  schedule: "New York 17-18; Friday17-Sunday18",
                  kind: "CSV standard recurring market-break assumption",
                }),
              });
          }
        hour = h;
      }
      rows.push({ t, bid, ask, bv, av });
      count++;
    }
    flush(paused);
    store.set("activeDataset", dataset);
    store.set("dataset:" + dataset, {
      file,
      mapping: m,
      count,
      invalid,
      duplicates,
      paused,
      schedule: "New York 17-18; Friday17-Sunday18 (simulator assumption)",
    });
    progress(false);
    return { dataset, count, invalid, duplicates, paused };
  } catch (e) {
    flush(true);
    progress(false, String(e));
    throw e;
  } finally {
    input.destroy();
    stream.destroy();
  }
}
