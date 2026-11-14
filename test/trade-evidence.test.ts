import test from "node:test";
import assert from "node:assert/strict";
import { sessionTrades, scanChart, reviewDecision, tradeWithDecision, asksAboutTrade, wantsChartAnalysis, contradictsSavedStop, decisionFacts, reviewAnswerIssue, factualTradeReview } from "../src/core/trade-evidence";
import { tradeMarkers } from "../src/core/trade-markers";
import { DEFAULT_SPECS, type Session, type Bar } from "../src/types";
const trade = { positionId: "sell-one", side: "sell", entry: 2494.335, opened: 100000, initialSl: 2500.9350000000004, initialTp: 2480.4539999999997, thesis: "Reject the upper range", strategy: "notebook-v1", screenshot: "decision-one", initialRisk: 6.6, lots: 0.01, fees: 0, swap: 0, gross: 5, net: 5, r: 1, reason: "TP" };
const fixture = () => ({ tick: { t: 240000, bid: 2480, ask: 2481 }, broker: { balance: 510, seq: 44, specs: DEFAULT_SPECS, positions: [], pending: [{ id: "unfilled" }], fills: [
  { ...trade, id: "part-one", lots: 0.004, closed: 180000, exit: 2488 },
  { ...trade, id: "part-two", lots: 0.006, closed: 210000, exit: 2480.3819999999996 },
  { ...trade, id: "future", positionId: "future", opened: 300000, closed: 360000, exit: 2400 },
] } }) as unknown as Session;
const bar = (time: number, high: number, low: number, close: number): Bar => ({ time, open: close - 1, high, low, close, count: 10 });
test("Trade history keeps initial protection and one entry per position across partial exits", () => {
  const rows = sessionTrades(fixture());
  assert.equal(rows.length, 1); assert.equal(rows[0].lots, 0.01); assert.equal(rows[0].sl, 2500.9350000000004);
  assert.equal(rows[0].tp, 2480.4539999999997); assert.equal(rows[0].partialExits, 2); assert.equal(rows[0].screenshot, "decision-one");
  assert.ok(rows[0].plannedRR! > 2);
  const markers = tradeMarkers(fixture());
  assert.equal(markers.arrows.filter(m => m.kind === "entry").length, 1);
  assert.equal(markers.arrows.filter(m => m.kind === "exit").length, 2);
  assert.equal(markers.links.length, 2); assert.equal(markers.arrows[0].price, 2494.335);
  assert.equal(markers.arrows[0].side, "sell"); assert.equal(markers.arrows.at(-1)!.side, "buy");
  assert.ok(markers.arrows.every(m => m.time <= fixture().tick.t / 1000));
});
test("Original decision has its own cutoff, timeframe, stop and chart scan and rejects future decisions", () => {
  const raw = { cutoff: 180000, cursor: { event: 22 }, timeframe: "1m", secondTimeframe: "5m", proposal: { sl: 2500.9350000000004, tp: 2480.4539999999997 }, candles: [bar(0, 2500, 2480, 2490), bar(60, 2501, 2485, 2492), bar(120, 2498, 2487, 2491), bar(240, 2600, 2500, 2580)] };
  const selected = sessionTrades(fixture())[0];
  const decision = reviewDecision(raw, selected, 240000, 44)!;
  assert.equal(decision.candles.length, 3); assert.equal(decision.chartScan.cutoff, 180000);
  assert.equal(decision.proposal.sl, 2500.9350000000004);
  assert.equal(reviewDecision(raw, selected, 120000, 44), null);
  assert.equal(reviewDecision(raw, selected, 240000, 10), null);
  const resolved = tradeWithDecision({ ...selected, sl: null, tp: null }, decision);
  assert.equal(resolved.sl, 2500.9350000000004); assert.match(resolved.riskInputs, /present/);
});
test("Chart scan uses only closed consecutive candles and never confirms a break with a forming wick", () => {
  const bars = [bar(0, 2500, 2480, 2490), bar(60, 2501, 2485, 2492), bar(120, 2600, 2487, 2590)];
  const scan = scanChart(bars, 150000, "1m");
  assert.equal(scan.closedCandles, 2); assert.equal(scan.formingCandle?.time, 120);
  assert.match(scan.lastClosedPair!.observation, /High swept/);
  const withGap = [...bars, { ...bar(180, 2500, 2480, 2490), gapBefore: { from: 150000, to: 180000 } }];
  assert.equal(scanChart(withGap, 240000, "1m").closedCandles, 1);
  assert.equal(scanChart(withGap, 240000, "1m").lastClosedPair, null);
});
test("Natural validity follow-ups retrieve trades in any chat mode and saved stops cannot be called missing", () => {
  for (const text of ["Open chat: i took this trade was it a valid setup?", "Open chat: so its not valid?", "Review trade: check this", "Var handelen gyldig?"]) assert.equal(asksAboutTrade(text), true, text);
  assert.equal(wantsChartAnalysis("Give a hint: gi meg hint"), true);
  assert.equal(contradictsSavedStop("A clear invalidation level and stop loss are currently missing.", 2500.9350000000004), true);
  assert.equal(contradictsSavedStop("The trade lacks defined stop losses.", 2500.9350000000004), true);
  assert.equal(contradictsSavedStop("Confirmation is missing, but the stop is saved.", 2500.9350000000004), false);
  assert.equal(contradictsSavedStop("A stop loss is missing.", null), false);
});

test("Review factual guard distinguishes planned order from fill, rejects unsupported break and indicator claims", () => {
  const selected = tradeWithDecision(sessionTrades(fixture())[0], null);
  const facts = { completedBreakBelow: false, completedBreakAbove: false, entryRuleVerified: false };
  const context = { selectedTrade: selected, reviewFacts: facts, reviewAtDecision: { indicators: [{ kind: "EMA", period: 20 }] } };
  assert.match(reviewAnswerIssue("Your entry at 2494.2969999999996 was valid.", context)!, /actual executed entry/);
  assert.match(reviewAnswerIssue("Unclear. There is a clear break below support.", context)!, /No completed break|concrete observation/);
  assert.match(reviewAnswerIssue("Yes, the stop makes it valid.", context)!, /verified entry rule|concrete observation/);
  assert.match(reviewAnswerIssue("Unclear. EMA 50 is above price.", context)!, /indicator period/);
  assert.equal(reviewAnswerIssue("Unclear: entry at 2494.335 had a saved stop, but wait for a finished candle to break below the previous low.", context), null);
});

test("User-defined entry rules can be assessed without falsely calling their source independently verified", () => {
  const trade = tradeWithDecision(sessionTrades(fixture())[0], null);
  const decision = reviewDecision({ cutoff: 180000, cursor: { event: 10 }, timeframe: "1m", candles: [], strategy: { verified: false, text: "Sell only after a candle returns inside my marked zone; place the stop above that candle.", rules: [] } }, trade, 240000, 44)!;
  const facts = decisionFacts(trade, decision);
  assert.equal(facts.entryRulesDocumented, true);
  assert.equal(facts.entryRuleVerified, false);
  assert.equal(reviewAnswerIssue("Yes, the entry at 2494.335 was inside your marked zone.", { selectedTrade: trade, reviewFacts: facts }), null);
});
test("Repeated model contradictions produce a labelled factual review using the actual fill and saved protection", () => {
  const selected = tradeWithDecision(sessionTrades(fixture())[0], null);
  const facts = { completedBreakBelow: false, zones: [{ entryInside: true }] };
  const result = factualTradeReview({ selectedTrade: selected, reviewFacts: facts });
  assert.match(result, /^Unclear/); assert.match(result, /2494\.335/); assert.match(result, /inside your marked zone/); assert.match(result, /initial stop was saved/);
});

import { currentChartHint, selectTradeReference, replyLanguage } from "../src/ai/intent";
test("a new hint is about the current chart even after review mode, and named earlier trades resolve precisely", () => {
  assert.equal(currentChartHint("Review trade: gi meg hint"), true);
  assert.equal(currentChartHint("Review trade: give me a hint on this trade"), false);
  assert.equal(replyLanguage("Give a hint: kan du se på denne?"), "Norwegian");
  const trades = [{id:"new",side:"sell" as const,entry:2400},{id:"older",side:"buy" as const,entry:2300}];
  assert.equal(selectTradeReference(trades,"was my buy trade valid?")?.id,"older");
  assert.equal(selectTradeReference(trades,"my first trade")?.id,"older");
  assert.equal(selectTradeReference(trades,"the one before that","new")?.id,"older");
  assert.equal(selectTradeReference(trades,"review trade at 2300")?.id,"older");
});

import {buildContext,promptSnapshot} from "../src/ai/context";
import {initialBroker} from "../src/core/broker";
test("panned-chart hints use visible candles and historical indicator values while replay cash stays current",()=>{
  const candles=[100,200,300,400].map((close,i)=>({time:i*60,open:close,high:close+1,low:close-1,close,count:1}));
  const s={id:"viewport",mode:"training",tick:{t:240000,bid:500,ask:501},broker:initialBroker(),layout:{timeframe:"1m",second:"5m",timezone:"UTC"},indicators:[{id:"avg",enabled:true,kind:"EMA",period:2}],drawings:[],notebook:{cutoff:0,version:"example",name:"Example",source:"User",text:"",rules:[],verified:false},notes:[],chat:[],thesis:"",checklist:{}} as unknown as Session;
  const context=buildContext(s,candles,[],undefined,[],{from:0,to:60});
  assert.deepEqual(context.candles.map(b=>b.close),[100,200]);assert.equal(context.chartScan.latestClosed?.close,200);assert.equal((context.indicators[0] as any).value.value,150);assert.equal(context.quote.bid,500);assert.ok(context.visibleWindow?.note.includes("panned"));assert.deepEqual((promptSnapshot(context) as any).visibleWindow.from,0);
});

import {savedHistoryAnswer} from "../src/ai/intent";
test("saved-history questions return exact current-session trades without inventing or counting partial exits twice",()=>{const result=savedHistoryAnswer(fixture(),"can you see my previous trades?");assert.match(result!,/1 executed trades/);assert.match(result!,/SELL/);assert.equal(savedHistoryAnswer(fixture(),"were my trades valid?"),null);});
