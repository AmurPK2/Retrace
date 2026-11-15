import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  INSTRUMENTS,
  marketClosed,
  openGapMillis,
} from "../src/core/instruments";
import {
  initialBroker,
  place,
  editPending,
  processTick,
  pnl,
} from "../src/core/broker";
import { draftIssues, planEvidence } from "../src/core/order-validation";
import { htfCandles, countdown } from "../src/core/htf";
import { coachRuleIssue, coachEvidenceReply } from "../src/ai/coach-evidence";
import { buildContext, validateGrounding } from "../src/ai/context";
import {
  beginChallenge,
  commitChallenge,
  checkChallenge,
  pairClass,
} from "../src/core/challenges";
import { urlFor } from "../src/data/importer";
import type { Session, Bar } from "../src/types";
const base = Date.UTC(2026, 0, 13, 8),
  bar = (t: number, o: number, h: number, l: number, c: number): Bar => ({
    time: t / 1000,
    open: o,
    high: h,
    low: l,
    close: c,
    count: 50,
  });
function session(): Session {
  return {
    id: "test",
    dataset: "dukascopy",
    name: "fixture",
    created: base,
    start: base,
    tick: { t: base + 3600000, bid: 2015, ask: 2015.5 },
    cursor: { hour: base + 3600000, index: 0 },
    broker: initialBroker(),
    layout: {
      timeframe: "15m",
      second: "1H",
      dual: false,
      ai: false,
      bottom: 140,
      right: 290,
      blind: false,
      timezone: "Europe/Oslo",
    },
    drawings: [],
    undo: [],
    redo: [],
    chat: [],
    indicators: [],
    notes: [],
    draft: "",
    thesis: "",
    tags: "",
    notebook: {
      name: "test",
      version: "test",
      source: "",
      text: "",
      verified: false,
      cutoff: base,
      rules: [],
    },
    checklist: {},
    mode: "training",
    updated: base,
    status: "paused",
  };
}
const order = {
  side: "buy" as const,
  kind: "limit" as const,
  lots: 0.01,
  price: 2010,
  sl: 2000,
  tp: 2020,
  thesis: "test",
  tags: [],
  strategy: "test",
  setupId: "pair",
};
test("ENTRY, SL, TP and size edits preserve the same pending identity and unrelated absolute levels", () => {
  const s = session(),
    id = place(s.broker, s.tick, order);
  editPending(s.broker, s.tick, id, { price: 2009 });
  let p = s.broker.pending[0];
  assert.equal(p.id, id);
  assert.equal(p.sl, 2000);
  assert.equal(p.tp, 2020);
  editPending(s.broker, s.tick, id, { sl: 1998 });
  editPending(s.broker, s.tick, id, { tp: 2022 });
  editPending(s.broker, s.tick, id, { lots: 0.02 });
  p = s.broker.pending[0];
  assert.deepEqual(
    [p.price, p.sl, p.tp, p.lots, p.setupId],
    [2009, 1998, 2022, 0.02, "pair"],
  );
  const frozen = structuredClone(s.broker);
  assert.throws(
    () => editPending(s.broker, s.tick, id, { price: 1997 }),
    /SL must/,
  );
  assert.deepEqual(s.broker, frozen);
});
test("two entries retain setup identity through fill and shared SL is counted once per entry", () => {
  const s = session();
  place(s.broker, s.tick, { ...order, planId: "drawing" });
  place(s.broker, s.tick, { ...order, price: 2005, tp: 2030 });
  s.drawings.push({
    id: "drawing",
    kind: "long",
    a: { time: base / 1000, price: 2010 },
    b: { time: base / 1000 + 900, price: 2000 },
    target: 2020,
    lots: 0.01,
    color: "#fff",
    locked: false,
    label: "",
    levels: [],
    createdCursor: 0,
  });
  let e = planEvidence(s);
  assert.equal(e.entries.length, 2);
  assert.equal(e.combinedRisk, 15);
  processTick(s.broker, { t: s.tick.t + 1, bid: 2004.5, ask: 2005 });
  assert.equal(s.broker.positions.length, 2);
  assert.ok(s.broker.positions.every((p) => p.setupId === "pair"));
  e = planEvidence(s);
  assert.equal(e.entries.length, 2);
  assert.equal(e.combinedRisk, 10);
});
test("a proposed drawing is not counted a second time when copied to the order ticket", () => {
  const s = session();
  s.drawings.push({
    id: "drawing",
    kind: "long",
    a: { time: base / 1000, price: 2010 },
    b: { time: base / 1000 + 900, price: 2000 },
    target: 2020,
    lots: 0.01,
    color: "#fff",
    locked: false,
    label: "",
    levels: [],
    createdCursor: 0,
  });
  const e = planEvidence(s, { ...order, entry: 2010, planId: "drawing" });
  assert.equal(e.entries.length, 1);
  assert.equal(e.combinedRisk, 10);
});
test("EURAUD and NAS CFD have distinct data symbols, native units, margins and independently calculated P&L", () => {
  assert.match(urlFor(base, "EURAUD"), /EURAUD\/2026\/00\/13/);
  assert.match(urlFor(base, "NAS100"), /USATECHIDXUSD/);
  assert.equal(
    pnl("buy", 1.7, 1.701, 0.01, INSTRUMENTS.EURAUD.specs.contract),
    1,
  );
  assert.equal(
    pnl("sell", 25000, 24990, 2, INSTRUMENTS.NAS100.specs.contract),
    20,
  );
  assert.equal(INSTRUMENTS.EURAUD.specs.currency, "AUD");
  assert.equal(INSTRUMENTS.NQ.available, false);
  assert.notEqual(INSTRUMENTS.NQ.dataset, INSTRUMENTS.NAS100.dataset);
  assert.ok(
    draftIssues(
      { ...order, entry: 25000, lots: 0.01 },
      INSTRUMENTS.NAS100.specs,
    ).length,
  );
});
test("each instrument respects its own New York break and DST; forex has no invented weekday gold break", () => {
  const winter = Date.UTC(2026, 0, 13, 22, 30),
    summer = Date.UTC(2026, 6, 13, 21, 30);
  assert.equal(marketClosed(winter, "XAUUSD"), true);
  assert.equal(marketClosed(summer, "XAUUSD"), true);
  assert.equal(marketClosed(winter, "EURAUD"), false);
  assert.equal(marketClosed(Date.UTC(2026, 0, 13, 21, 20), "NAS100"), true);
  assert.equal(marketClosed(Date.UTC(2026, 0, 13, 21, 10), "NAS100"), false);
  assert.equal(openGapMillis(winter, winter + 1800000, "XAUUSD"), 0);
  assert.equal(openGapMillis(winter, winter + 1800000, "EURAUD"), 1800000);
});
test("HTF display distinguishes forming and completed and countdown uses replay time only", () => {
  const b = [
    bar(base - 14400000, 2000, 2010, 1990, 2005),
    bar(base, 2005, 2015, 2001, 2013),
  ];
  const view = htfCandles(b, base + 3600000, "4H", 3);
  assert.deepEqual(
    view.map((x) => x.closed),
    [true, false],
  );
  assert.equal(view[1].remaining, 10800);
  assert.equal(countdown(view[1].remaining), "03:00:00");
  assert.equal(view[1].high, 2015);
});
test("both reported fabricated universal coach rules are rejected; supported price references use sub-dollar precision too", () => {
  assert.ok(
    coachRuleIssue(
      "No. Your stop and target must be outside that candle range.",
    ),
  );
  assert.ok(
    coachRuleIssue("Use that same 4H candle's close as your stop loss level."),
  );
  const s = session();
  s.dataset = "dukascopy:EURAUD";
  s.broker.specs = INSTRUMENTS.EURAUD.specs;
  const c = buildContext(s, [], [], {
    entry: 1.7,
    sl: 1.695,
    tp: 1.71,
    lots: 0.01,
    side: "buy",
  });
  assert.throws(() => validateGrounding("SL at 1.69321", c));
  assert.equal(validateGrounding("SL at 1.695", c), "SL at 1.695");
});
test("fallback explains ambiguous C1/C2 and both actual plans in Norwegian without fabricating candles", () => {
  const s = session();
  place(s.broker, s.tick, order);
  place(s.broker, s.tick, { ...order, price: 2005, tp: 2030 });
  const c = buildContext(s, [], []),
    answer = coachEvidenceReply(c, "Vurder oppsettet mitt med to innganger.");
  assert.match(answer, /Uklart/);
  assert.match(answer, /Marker C1/);
  assert.match(answer, /Inngang 1.*2010.*Inngang 2.*2005/);
  assert.match(answer, /15.00/);
  assert.match(answer, /ikke automatisk/);
  assert.ok(answer.split(/\s+/).length >= 100);
});
test("challenge locks actual evidence and answer before future reveal; later profit cannot change feedback", () => {
  const s = session(),
    htf = [
      bar(base - 28800000, 2000, 2010, 1990, 2005),
      bar(base - 14400000, 2005, 2015, 2001, 2013),
      bar(base, 2013, 2016, 2011, 2015),
    ],
    c = beginChallenge(s, [], htf, "candles");
  assert.equal(c.answer, undefined);
  commitChallenge(
    c,
    { reason: "Candlen er ferdig før replay-tiden.", value: 2015 },
    s,
  );
  assert.ok(c.checks?.every((x) => x.pass));
  const frozen = JSON.stringify(c);
  s.broker.balance = 100000;
  s.tick.t += 100000;
  assert.equal(JSON.stringify(c), frozen);
  assert.throws(
    () =>
      commitChallenge(
        c,
        { reason: "Omskriver et gammelt svar", value: 2016 },
        s,
      ),
    /already locked/,
  );
});
test("challenge does not call missing or non-adjacent candles a confirmed break", () => {
  const s = session(),
    c = beginChallenge(
      s,
      [],
      [
        bar(base - 43200000, 2000, 2010, 1990, 2005),
        bar(base - 14400000, 2005, 2015, 2001, 2013),
      ],
      "pair",
    );
  assert.equal(pairClass(c), "missing");
  assert.equal(
    checkChallenge(c, {
      reason: "Historikken har en pause mellom dem",
      classification: "missing",
    })[1].pass,
    true,
  );
});
test("challenge budget checks both entries and cannot pass an invalid or oversized two-entry risk plan", () => {
  const s = session(),
    c = beginChallenge(s, [], [], "two");
  let feedback = checkChallenge(c, {
    reason: "To innganger med felles ugyldiggjøring",
    decision: "buy",
    entry: 2010,
    entry2: 2005,
    sl: 2000,
    tp: 2020,
    tp2: 2030,
    lots: 0.01,
  });
  assert.equal(feedback.find((x) => x.label === "Samlet risiko")?.pass, false);
  feedback = checkChallenge(c, {
    reason: "To små innganger innenfor budsjettet",
    decision: "buy",
    entry: 2004,
    entry2: 2003,
    sl: 2000,
    tp: 2010,
    tp2: 2020,
    lots: 0.01,
  });
  assert.ok(feedback.every((x) => x.pass));
});

test("public IPC exposes the completed instrument and challenge actions", () => {
  const main = readFileSync(
    new URL("../electron/main.ts", import.meta.url),
    "utf8",
  );
  const allowed = main.slice(
    main.indexOf("const allowed = new Set(["),
    main.indexOf('ipcMain.handle("replay:call"'),
  );
  for (const command of [
    "instrument",
    "challenge.language",
    "challenge.commit",
    "challenge.reveal",
    "challenge.next",
    "drawing.patch",
    "drawing.remove",
    "pending.snapshot",
  ])
    assert.ok(allowed.includes(JSON.stringify(command)), command);
});
