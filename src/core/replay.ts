import {
  INSTRUMENTS,
  instrumentForDataset,
  openGapMillis,
} from "./instruments";
import { randomUUID, randomInt } from "node:crypto";
import { Store, type Chunk } from "../data/store";
import { initialBroker, processTick } from "./broker";
import { aggregate, fromTicks, knownClosure } from "./bars";
import { FRAMES, type Session, type Tick, type TF, type Bar } from "../types";
import { calculateLevels } from "./levels";
import { chartHistory } from "./history";
export class Replay {
  private reliable(c?: Chunk) {
    if (!c || c.status !== "ready") return false;
    try {
      return !JSON.parse(c.provenance).unexpectedGaps?.length;
    } catch {
      return false;
    }
  }
  session: Session | null = null;
  private loadedHour = -1;
  private loaded: Tick[] = [];
  constructor(public store: Store) {
    store.ensureHours();
  }
  setSession(s: Session) {
    const c = this.store.chunk(s.dataset, s.cursor.hour);
    if (!c || c.status !== "ready")
      throw Error(
        "The saved session's tick chunk is missing. Import the data again.",
      );
    this.loaded = this.store.readTicks(c);
    this.loadedHour = c.hour;
    const q = this.loaded[s.cursor.index];
    if (!q || q.t !== s.tick.t || q.bid !== s.tick.bid || q.ask !== s.tick.ask)
      throw Error("The saved tick cursor does not match the price data.");
    this.session = s;
  }
  eligible(dataset = "dukascopy") {
    const chunks = this.store.chunks(dataset),
      map = new Map(chunks.map((c) => [c.hour, c]));
    const range = this.store.meta<{ replayFrom?: number; replayTo?: number }>(
      "importRange:" + dataset,
      dataset === "dukascopy" ? this.store.meta("importRange", {}) : {},
    );
    return chunks.filter((c) => {
      if (
        !this.reliable(c) ||
        !c.count ||
        (dataset.startsWith("dukascopy") &&
          range.replayFrom &&
          c.hour < range.replayFrom)
      )
        return false;
      let history = 0,
        future = 0;
      for (let h = c.hour - 3600000; h >= c.hour - 5 * 86400000; h -= 3600000) {
        const old = map.get(h);
        if (this.reliable(old)) history++;
        else if (old?.status !== "closure") break;
        if (history >= 24) break;
      }
      for (let h = c.hour; h < c.hour + 2 * 86400000; h += 3600000) {
        const next = map.get(h);
        if (this.reliable(next)) future++;
        else if (next?.status !== "closure") break;
        if (future >= 4) break;
      }
      return history >= 24 && future >= 4;
    });
  }
  newSession(dataset = "dukascopy", timestamp?: number) {
    const eligible = this.eligible(dataset);
    if (!eligible.length)
      throw Error(
        "Insufficient continuous tick history. Requires 24 open history hours and at least 4 practice hours without unknown gaps.",
      );
    const prior = this.store
      .list()
      .map((x) => this.store.load(String(x.id))!)
      .filter((x) => x?.dataset === dataset)
      .map((x) => ({
        start: x.start,
        end: Math.max(x.tick.t, x.start + 4 * 3600000),
      }));
    const fresh = eligible.filter(
      (c) =>
        !prior.some((w) => c.hour < w.end && c.hour + 4 * 3600000 > w.start),
    );
    let chosen: Chunk;
    let repeated = false;
    if (timestamp !== undefined) {
      chosen = eligible.find(
        (c) => c.hour === Math.floor(timestamp / 3600000) * 3600000,
      )!;
      if (!chosen)
        throw Error(
          "The selected hour has insufficient continuous history and practice time.",
        );
    } else {
      const pool = fresh.length ? fresh : eligible;
      repeated = !fresh.length;
      chosen = pool[randomInt(pool.length)];
    }
    const ticks = this.store.readTicks(chosen);
    const index =
      timestamp === undefined ? 0 : ticks.findIndex((q) => q.t >= timestamp);
    if (index < 0) throw Error("No tick after the selected time in this hour.");
    const q = ticks[index];
    const session: Session = {
      dataset,
      id: randomUUID(),
      name: `Practice ${this.store.list().length + 1}`,
      mode: "training",
      created: Date.now(),
      start: q.t,
      cursor: { hour: chosen.hour, index },
      tick: q,
      broker: initialBroker(
        INSTRUMENTS[instrumentForDataset(dataset)].specs,
        instrumentForDataset(dataset) === "NAS100" ? 10000 : 500,
      ),
      drawings: [],
      undo: [],
      redo: [],
      indicators: [
        {
          id: randomUUID(),
          kind: "EMA",
          period: 20,
          color: "#ddb15f",
          enabled: true,
        },
      ],
      layout: {
        timeframe: "5m",
        second: "1H",
        dual: false,
        ai: true,
        bottom: 232,
        right: 290,
        blind: false,
        timezone: "Europe/Oslo",
      },
      chat: [],
      draft: "",
      notes: [],
      notebook: {
        version: "generic-v1",
        name: "Custom price action",
        source: "Generic, editable checklist. No verified Accurate RR rules.",
        text: "",
        rules: [
          {
            id: "invalidation",
            text: "I have defined clear invalidation and a stop loss.",
          },
          {
            id: "risk",
            text: "I have checked cash risk, spread and margin.",
          },
          {
            id: "thesis",
            text: "I can describe the observation and what is missing.",
          },
        ],
        verified: false,
        cutoff: q.t,
      },
      thesis: "",
      tags: "",
      checklist: {},
      updated: Date.now(),
      status: repeated
        ? "All fresh eligible practice windows have been used. An earlier window was selected with a new account."
        : "Paused — real bid/ask ticks",
    };
    this.setSession(session);
    this.store.save(session);
    return session;
  }
  private getTicks(hour: number) {
    if (this.loadedHour !== hour) {
      const c = this.store.chunk(this.session!.dataset, hour);
      if (!c || c.status !== "ready") throw Error("Tick chunk missing.");
      this.loaded = this.store.readTicks(c);
      this.loadedHour = hour;
    }
    return this.loaded;
  }
  peek(): { tick: Tick; hour: number; index: number; skipped: number } | null {
    const s = this.session;
    if (!s) return null;
    let hour = s.cursor.hour,
      index = s.cursor.index + 1,
      skipped = 0;
    for (let i = 0; i < 96; i++) {
      const c = this.store.chunk(s.dataset, hour);
      if (c?.status === "ready") {
        const ticks = this.getTicks(hour);
        if (
          index < ticks.length &&
          ticks[index].t - s.tick.t - skipped > 300000 &&
          openGapMillis(
            s.tick.t,
            ticks[index].t,
            instrumentForDataset(s.dataset),
          ) > 300000
        )
          throw Error(
            `Unexpected tick gap of ${Math.round((ticks[index].t - s.tick.t - skipped) / 60000)} open minutes. Replay is paused.`,
          );
        if (index < ticks.length)
          return { tick: ticks[index], hour, index, skipped };
        index = 0;
        hour += 3600000;
        continue;
      }
      if (c?.status === "closure") {
        skipped += 3600000;
        hour += 3600000;
        index = 0;
        continue;
      }
      throw Error(
        `Data gap ${new Date(hour).toISOString()}. Replay is paused; import the missing hour.`,
      );
    }
    throw Error("No tick is available after the market break.");
  }
  advanceOne() {
    const s = this.session!,
      next = this.peek();
    if (!next) return false;
    if (next.tick.t < s.tick.t) throw Error("Tick order corruption");
    s.cursor = { hour: next.hour, index: next.index };
    s.tick = next.tick;
    processTick(s.broker, s.tick);
    s.status = next.skipped
      ? `Skipped ${Math.round(next.skipped / 3600000)} timer kjent markedspause.`
      : "Paused";
    return true;
  }
  advanceTo(target: number, budgetMs = 15) {
    const start = performance.now();
    let n = 0;
    while (performance.now() - start < budgetMs) {
      const next = this.peek();
      if (!next || next.tick.t > target) break;
      this.advanceOne();
      n++;
    }
    return n;
  }
  nextCandle(tf: TF) {
    const s = this.session!,
      target =
        (Math.floor(s.tick.t / (FRAMES[tf] * 1000)) + 1) * FRAMES[tf] * 1000;
    let n = 0;
    while (s.tick.t < target) {
      this.advanceOne();
      n++;
      if (n > 2000000) throw Error("Too many ticks in one step.");
    }
    return n;
  }
  barsAt(cutoff: number, tf: TF): Bar[] {
    const current = this.session;
    if (!current || cutoff > current.tick.t) return [];
    const hour = Math.floor(cutoff / 3600000) * 3600000,
      c = this.store.chunk(current.dataset, hour);
    if (!c || c.status !== "ready") return [];
    const ticks = this.store.readTicks(c);
    let index = ticks.length - 1;
    while (index >= 0 && ticks[index].t > cutoff) index--;
    if (index < 0) return [];
    const snapshot = {
      ...current,
      tick: ticks[index],
      cursor: { hour, index },
    };
    return chartHistory(this.store, snapshot, ticks, tf);
  }
  bars(tf: TF): Bar[] {
    const s = this.session;
    if (!s) return [];
    return chartHistory(this.store, s, this.getTicks(s.cursor.hour), tf);
  }
  levels() {
    const s = this.session;
    if (!s) return [];
    if (
      !s.indicators.some(
        (i) => i.enabled && ["previous", "asian"].includes(i.kind),
      )
    )
      return [];
    const minute = Math.floor(s.tick.t / 60000) * 60000;
    const bars = [
      ...this.store.bars(s.dataset, s.tick.t - 7 * 86400000, minute),
      ...fromTicks(
        this.getTicks(s.cursor.hour)
          .slice(0, s.cursor.index + 1)
          .filter((q) => q.t >= minute),
      ),
    ];
    return calculateLevels(
      bars,
      s.tick.t,
      s.layout.timezone,
      s.indicators,
      (day) => {
        for (let h = day; h < day + 86400000; h += 3600000) {
          const c = this.store.chunk(s.dataset, h);
          if (!c || (c.status !== "closure" && !this.reliable(c))) return false;
        }
        return true;
      },
    );
  }
}
