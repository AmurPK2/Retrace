// Frozen AFTER implementation, BEFORE first generation. Do not tune against these results.
// Artificial fixtures only; no claim these prices occurred in the real market.
import { holdout } from "./coach-holdout";
import { INSTRUMENTS } from "../src/core/instruments";
import { initialBroker, account } from "../src/core/broker";
import { scanChart } from "../src/core/trade-evidence";
import { planEvidence } from "../src/core/order-validation";
import { assessmentFacts } from "../src/ai/assessment";
import type { Session } from "../src/types";
export function blindHoldout() {
  const base = holdout()[0].context;
  const cases = [
    {
      id: "sell-pair-confirmed",
      instrument: "XAUUSD" as const,
      question:
        "Assess both drawn sell plans using my written rule; compare risk without choosing one for me.",
      rule: "Sell only after a completed 15m close below 2036. Combined maximum cash risk 30 USD. Both independent entries are allowed.",
      entries: [
        { entry: 2033, sl: 2040, tp: 2021, lots: 0.02 },
        { entry: 2035, sl: 2040, tp: 2010, lots: 0.02 },
      ],
      side: "sell" as const,
      pair: true,
      expected:
        "Written LTF close condition met at cutoff (2035 < 2036), both geometries valid, risks 14 and 10 USD combined 24; unplaced plans, no performance claim.",
    },
    {
      id: "euraud-without-sl",
      instrument: "EURAUD" as const,
      question:
        "Vurder dette utkastet og forklar om risikobudsjettet er kontrollert.",
      rule: "Kjøp etter ferdig 15m-slutt over 1.7020. Maks samlet risiko 10 AUD.",
      entries: [{ entry: 2005, sl: undefined, tp: 2020, lots: 0.01 }],
      side: "buy" as const,
      pair: true,
      expected:
        "SL absent: cash risk and budget compliance unknown. EURAUD prices are sub-dollar precision and account currency AUD. No execution invented.",
    },
    {
      id: "nas100-invalid-protection",
      instrument: "NAS100" as const,
      question: "Please assess the geometry and total risk for this CFD plan.",
      rule: "Geometry practice only; no entry confirmation required. Buy stop below entry and target above entry. Risk budget 40 USD.",
      entries: [{ entry: 2005, sl: 2010, tp: 2020, lots: 2 }],
      side: "buy" as const,
      pair: true,
      expected:
        "Buy SL is above entry, invalid protection despite profitable-looking target. NAS100 uses CFD units, not gold lots. No need to invent candle confirmation.",
    },
    {
      id: "ambiguous-marking",
      instrument: "XAUUSD" as const,
      question:
        "Vurder C2-bruddet over C1 og begge inngangene mine. Candleparet er ikke markert.",
      rule: "",
      entries: [
        { entry: 2008, sl: 1995, tp: 2026, lots: 0.01 },
        { entry: 2002, sl: 1995, tp: 2032, lots: 0.01 },
      ],
      side: "buy" as const,
      pair: false,
      expected:
        "Ask for one explicit C1 selection, do not guess candle references. Geometry may pass, strategy missing. Independent risks 13 and 7 USD combined 20. No winner-based approval.",
    },
  ];
  return cases.map((x) => {
    const c = structuredClone(base),
      price = (n: number) =>
        x.instrument === "EURAUD"
          ? Number((1.7 + (n - 2000) * 0.0001).toFixed(5))
          : x.instrument === "NAS100"
            ? n + 23000
            : n;
    const bar = (b: any) => ({
      ...b,
      open: price(b.open),
      high: price(b.high),
      low: price(b.low),
      close: price(b.close),
    });
    c.instrument = x.instrument;
    c.assumptions = INSTRUMENTS[x.instrument].specs;
    c.quote = { ...c.quote, bid: price(c.quote.bid), ask: price(c.quote.ask) };
    c.candles = c.candles.map(bar);
    c.secondCandles = c.secondCandles.map(bar);
    c.higherTimeframe!.candles = c.higherTimeframe!.candles.map(bar);
    c.selectedRange = x.pair
      ? {
          ...c.selectedRange!,
          c1: bar(c.selectedRange!.c1),
          c2: bar(c.selectedRange!.c2),
        }
      : null;
    c.strategy = { ...c.strategy, text: x.rule };
    c.drawings = x.entries
      .filter((e) => e.sl !== undefined)
      .map((e, i) => ({
        id: "blind-" + i,
        kind: x.side === "buy" ? "long" : "short",
        a: { time: c.cutoff / 1000 - 600, price: price(e.entry) },
        b: { time: c.cutoff / 1000 - 300, price: price(e.sl!) },
        target: price(e.tp),
        lots: e.lots,
        createdCursor: 0,
        color: "#fff",
        locked: false,
        label: "plan " + i,
        levels: [],
      }));
    const s = {
      broker: initialBroker(c.assumptions),
      drawings: c.drawings,
    } as Session;
    c.planFacts = planEvidence(
      s,
      x.entries.some((e) => e.sl === undefined)
        ? {
            side: x.side,
            kind: "limit",
            entry: price(x.entries[0].entry),
            tp: price(x.entries[0].tp),
            lots: x.entries[0].lots,
          }
        : undefined,
    );
    c.chartScan = scanChart(c.candles, c.cutoff, c.timeframe);
    c.account = account(s.broker, c.quote);
    c.proposal = x.entries.some((e) => e.sl === undefined)
      ? {
          side: x.side,
          kind: "limit",
          entry: price(x.entries[0].entry),
          tp: price(x.entries[0].tp),
          lots: x.entries[0].lots,
        }
      : null;
    c.assessment = assessmentFacts(c);
    return { id: x.id, question: x.question, context: c, expected: x.expected };
  });
}
