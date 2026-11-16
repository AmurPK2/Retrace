// Frozen before implementation. Artificial examples are tests, never market data.
import { buildContext } from "../src/ai/context";
import { initialBroker } from "../src/core/broker";
import { chooseRRRange } from "../src/core/rr-study";
import type { Session, Bar } from "../src/types";
const t = Date.UTC(2026, 1, 10, 0);
const b = (
  offset: number,
  o: number,
  h: number,
  l: number,
  c: number,
): Bar => ({
  time: (t + offset) / 1000,
  open: o,
  high: h,
  low: l,
  close: c,
  count: 80,
});
export function holdout() {
  const cases = [
    {
      id: "two-plans",
      question:
        "Vurder de to tegnede inngangene med felles SL og ulike mål. Hva er bra og hva mangler?",
      rule: "Buy after completed H4 C2 close above C1 high and completed 15m close above 2030. Risk budget 40 USD combined.",
      entry: 2005,
      sl: 1990,
      tp: 2020,
      pair: true,
    },
    {
      id: "wick-not-close",
      question: "Vurder oppsettet mitt. Er bruddregelen oppfylt?",
      rule: "Buy only after completed 4H C2 closes above C1 high. Risk budget 40 USD.",
      entry: 2005,
      sl: 1990,
      tp: 2020,
      pair: true,
      wick: true,
    },
    {
      id: "undefined-rules",
      question:
        "Please assess my idea from the drawing and candles. It looks profitable.",
      rule: "",
      entry: 2005,
      sl: 1990,
      tp: 2020,
      pair: false,
    },
    {
      id: "bad-stop",
      question: "Vurder ordrene og forklar neste steg.",
      rule: "Buy after C2 closes above C1. Risk budget 40 USD.",
      entry: 1985,
      sl: 1990,
      tp: 2020,
      pair: true,
    },
    {
      id: "geometry-practice",
      question: "Assess my practice plan using only my written rule.",
      rule: "Geometry practice only; no entry confirmation required. Buy SL below entry, TP above entry. Maximum combined risk 40 USD.",
      entry: 2005,
      sl: 1990,
      tp: 2020,
      pair: true,
    },
    {
      id: "missing-stop",
      question: "Vurder dette oppsettet før jeg bekrefter utkastet.",
      rule: "Wait for completed 15m close above 2030. Combined risk at most 40 USD.",
      entry: 2005,
      sl: undefined,
      tp: 2020,
      pair: true,
    },
  ];
  return cases.map((x) => {
    const bars = [
      b(8 * 3600000, 2024, 2034, 2020, 2032),
      b(8 * 3600000 + 900000, 2032, 2038, 2028, 2035),
    ];
    const s = {
      id: "holdout-" + x.id,
      dataset: "dukascopy",
      mode: "training",
      tick: { t: t + 8.5 * 3600000, bid: 2035, ask: 2035.5 },
      cursor: { hour: t + 8 * 3600000, index: 1 },
      broker: initialBroker(),
      layout: { timeframe: "15m", second: "4H", timezone: "Europe/Oslo" },
      indicators: [],
      drawings: [],
      notes: [],
      chat: [],
      thesis: "",
      checklist: {},
      notebook: {
        name: "holdout",
        version: "holdout-1",
        source: "test author's explicit rule",
        verified: false,
        cutoff: t,
        text: x.rule,
        rules: [],
      },
    } as unknown as Session;
    if (x.sl !== undefined)
      s.drawings.push({
        id: "plan-a",
        kind: "long",
        a: { time: t / 1000, price: x.entry },
        b: { time: t / 1000 + 1, price: x.sl },
        target: x.tp,
        lots: 0.01,
        createdCursor: 0,
        color: "#fff",
        locked: false,
        label: "entry A",
        levels: [],
      });
    if (x.id === "two-plans")
      s.drawings.push({
        ...s.drawings[0],
        id: "plan-b",
        a: { time: t / 1000, price: 1998 },
        target: 2035,
        label: "entry B",
      });
    const higher = [
      b(0, 2000, 2020, 1990, 2010),
      b(4 * 3600000, 2010, 2035, 2005, x.wick ? 2018 : 2025),
    ];
    if (x.pair)
      s.study = {
        range: chooseRRRange(higher, s.tick.t, 0, "4H", "holdout"),
        overlay: true,
        draft: {
          decision: "skip",
          objective: "",
          invalidation: "",
          confirmation: "",
        },
        attempts: [],
      };
    const c = buildContext(
      s,
      bars,
      higher,
      x.sl === undefined
        ? { side: "buy", kind: "limit", entry: x.entry, tp: x.tp, lots: 0.01 }
        : undefined,
    );
    c.higherTimeframe = { timeframe: "4H", cutoff: s.tick.t, candles: higher };
    return { id: x.id, question: x.question, context: c };
  });
}
