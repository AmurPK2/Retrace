import { FRAMES, type Bar, type Session, type TF } from "../types";
import { classifyC2, RR_PATTERN_LABELS } from "./rr-study";

export function sessionTrades(s: Session) {
  const ids = new Set([
    ...s.broker.positions.filter((p) => p.opened <= s.tick.t).map((p) => p.id),
    ...s.broker.fills
      .filter((f) => f.opened <= s.tick.t && f.closed <= s.tick.t)
      .map((f) => f.positionId),
  ]);
  return [...ids]
    .map((id) => {
      const position = s.broker.positions.find(
        (p) => p.id === id && p.opened <= s.tick.t,
      );
      const exits = s.broker.fills
        .filter((f) => f.positionId === id && f.closed <= s.tick.t)
        .sort((a, b) => a.closed - b.closed);
      const first = position ?? exits[0];
      const lots =
        position?.initialLots ?? exits.reduce((n, f) => n + f.lots, 0);
      const sl = first.initialSl ?? null,
        tp = first.initialTp ?? null;
      const risk =
        sl === null
          ? null
          : Math.abs(first.entry - sl) * lots * s.broker.specs.contract;
      const rr =
        sl === null || tp === null || sl === first.entry
          ? null
          : Math.abs(tp - first.entry) / Math.abs(first.entry - sl);
      return {
        id,
        side: first.side,
        entry: first.entry,
        opened: first.opened,
        lots,
        sl,
        tp,
        cashRisk: risk,
        plannedRR: rr,
        status: position ? "open" : "closed",
        closed: position ? null : (exits.at(-1)?.closed ?? null),
        exit: position ? null : (exits.at(-1)?.exit ?? null),
        net: exits.reduce((n, f) => n + f.net, 0),
        reason: position ? "Open" : (exits.at(-1)?.reason ?? ""),
        thesis: first.thesis,
        strategy: first.strategy,
        screenshot:
          first.screenshot ?? exits.find((f) => f.screenshot)?.screenshot,
        partialExits: exits.length,
      };
    })
    .sort((a, b) => b.opened - a.opened || a.id.localeCompare(b.id));
}
export type TradeEvidence = ReturnType<typeof sessionTrades>[number];

export function asksAboutTrade(text: string) {
  return /review trade:|(?:my|this|last|previous|took|taken|took this|entered|closed|earlier).{0,35}\btrade\b|\btrade.{0,35}(?:valid|setup|good|bad|mistake|right|wrong)|\b(?:valid|invalid|gyldig|ugyldig)\b|forrige.{0,25}(?:trade|handel)|(?:denne|min|tok|tidligere).{0,25}(?:traden|handelen|handel)/i.test(
    text,
  );
}
export function wantsChartAnalysis(text: string) {
  return (
    asksAboutTrade(text) ||
    /check setup:|give a hint:|\b(?:chart|candles?|structure|setup|hint|hints|trend|graf|oppsett)\b/i.test(
      text,
    )
  );
}

// These are reproducible observations, never a prediction or a strategy score.
// Swing confirmation uses two already-closed neighbours on either side.
export function scanChart(bars: Bar[], cutoff: number, timeframe: TF) {
  const available = bars.filter((b) => b.time * 1000 <= cutoff);
  const lastGap = available.findLastIndex((b) => !!b.gapBefore);
  const continuous = available.slice(Math.max(0, lastGap));
  const closed = continuous.filter(
    (b) => (b.time + FRAMES[timeframe]) * 1000 <= cutoff,
  );
  const last = closed.at(-1),
    prior = closed.at(-2);
  const highs: Bar[] = [],
    lows: Bar[] = [];
  for (let i = 2; i < closed.length - 2; i++) {
    const candidate = closed[i],
      neighbours = [closed[i - 2], closed[i - 1], closed[i + 1], closed[i + 2]];
    if (neighbours.every((b) => candidate.high > b.high)) highs.push(candidate);
    if (neighbours.every((b) => candidate.low < b.low)) lows.push(candidate);
  }
  return {
    timeframe,
    cutoff,
    closedCandles: closed.length,
    historyGapBeforeSegment: lastGap >= 0,
    latestClosed: last ?? null,
    lastClosedPair:
      last && prior
        ? {
            reference: prior,
            next: last,
            observation: RR_PATTERN_LABELS[classifyC2(prior, last)],
          }
        : null,
    confirmedSwingHigh: highs.length
      ? { time: highs.at(-1)!.time, price: highs.at(-1)!.high }
      : null,
    confirmedSwingLow: lows.length
      ? { time: lows.at(-1)!.time, price: lows.at(-1)!.low }
      : null,
    formingCandle:
      available.at(-1) &&
      (available.at(-1)!.time + FRAMES[timeframe]) * 1000 > cutoff
        ? available.at(-1)
        : null,
    limit:
      "Geometry only. A forming candle is not a confirmed break. No observations span a history gap.",
  };
}

export function reviewDecision(
  raw: any,
  trade: TradeEvidence | null,
  cutoff: number,
  seq: number,
) {
  if (!raw || raw.cutoff > cutoff || raw.cursor?.event > seq) return null;
  const timeframe = raw.timeframe as TF;
  if (!(timeframe in FRAMES)) return null;
  const candles = (raw.candles ?? [])
    .filter((b: Bar) => b.time * 1000 <= raw.cutoff)
    .slice(-48);
  const secondCandles = (raw.secondCandles ?? [])
    .filter((b: Bar) => b.time * 1000 <= raw.cutoff)
    .slice(-24);
  return {
    cutoff: raw.cutoff,
    timeframe,
    secondTimeframe: raw.secondTimeframe,
    evidenceTime:
      "Original order decision / placement; pending execution can occur later.",
    proposal: raw.proposal ?? null,
    quote: raw.quote,
    candles,
    secondCandles,
    chartScan: scanChart(candles, raw.cutoff, timeframe),
    indicators: raw.indicators ?? [],
    drawings: raw.drawings?.slice(-8) ?? [],
    thesis: raw.thesis ?? trade?.thesis ?? "",
    checklist: raw.checklist ?? {},
    strategy: raw.strategy ?? null,
  };
}

export function tradeWithDecision(
  trade: TradeEvidence,
  decision: ReturnType<typeof reviewDecision>,
) {
  const sl = trade.sl ?? decision?.proposal?.sl ?? null;
  const tp = trade.tp ?? decision?.proposal?.tp ?? null;
  return {
    ...trade,
    sl,
    tp,
    plannedRR:
      sl && tp && sl !== trade.entry
        ? Math.abs(tp - trade.entry) / Math.abs(trade.entry - sl)
        : null,
    riskInputs: sl
      ? "Saved initial stop is present. Do not claim a stop is missing."
      : "No saved initial stop; say exactly that.",
    decisionChartAvailable: !!trade.screenshot,
  };
}

export function contradictsSavedStop(text: string, sl: unknown) {
  if (typeof sl !== "number" || !Number.isFinite(sl) || sl <= 0) return false;
  if (
    /(?:mangler|uten|ingen(?: tydelig| lagret)?|må (?:definere|legge til))[^.!?;]{0,45}(?:stop.?loss|stopp|\bSL\b|invalidering)|(?:stop.?loss|\bSL\b|invalidering)[^.!?;]{0,35}(?:mangler|ikke (?:lagret|definert|oppgitt))/i.test(
      text,
    )
  )
    return true;
  return text
    .split(/\bbut\b|\bhowever\b|[!?;]/i)
    .some((clause) =>
      /(?:missing|lacks?|absent|without|need to (?:define|provide|add)|not (?:defined|provided)|no (?:clear |defined )?)(?:[^.!?]{0,55})(?:stop.loss|stop|\bSL\b|invalidation)|(?:stop.loss|\bSL\b|invalidation)(?:[^.!?]{0,55})(?:missing|absent|not (?:defined|provided))/i.test(
        clause,
      ),
    );
}

export function decisionFacts(
  trade: ReturnType<typeof tradeWithDecision>,
  decision: ReturnType<typeof reviewDecision>,
) {
  const scan = decision?.chartScan,
    pair = scan?.lastClosedPair;
  const last = scan?.latestClosed;
  const below =
    !!last &&
    ((!!pair && last.close < pair.reference.low) ||
      (!!scan?.confirmedSwingLow && last.close < scan.confirmedSwingLow.price));
  const above =
    !!last &&
    ((!!pair && last.close > pair.reference.high) ||
      (!!scan?.confirmedSwingHigh &&
        last.close > scan.confirmedSwingHigh.price));
  const zones = (decision?.drawings ?? [])
    .filter((d: any) => d.kind === "zone")
    .map((d: any) => ({
      low: Math.min(d.a.price, d.b.price),
      high: Math.max(d.a.price, d.b.price),
      entryInside:
        trade.entry >= Math.min(d.a.price, d.b.price) &&
        trade.entry <= Math.max(d.a.price, d.b.price),
    }));
  const averages = (decision?.indicators ?? [])
    .filter(
      (i: any) =>
        ["EMA", "SMA"].includes(i.kind) && Number.isFinite(i.value?.value),
    )
    .map((i: any) => ({
      kind: i.kind,
      period: i.period,
      value: i.value.value,
      entryRelation:
        trade.entry > i.value.value
          ? "above"
          : trade.entry < i.value.value
            ? "below"
            : "equal",
    }));
  const entryRulesDocumented =
    !!decision?.strategy &&
    (String(decision.strategy.text ?? "").trim().length > 20 ||
      (decision.strategy.rules ?? []).some(
        (rule: any) =>
          !["risk", "invalidation", "thesis"].includes(rule.id) &&
          rule.text?.trim(),
      ));
  return {
    entryRulesDocumented,
    actualExecutedEntry: trade.entry,
    plannedOrderPrice: decision?.proposal?.entry ?? null,
    initialStop: trade.sl,
    initialTarget: trade.tp,
    plannedRR: trade.plannedRR,
    stopOnLossSide: trade.sl
      ? trade.side === "sell"
        ? trade.sl > trade.entry
        : trade.sl < trade.entry
      : false,
    lastFinishedPair: pair?.observation ?? "Insufficient finished candles",
    completedBreakBelow: below,
    completedBreakAbove: above,
    zones,
    averages,
    zoneInterpretation:
      "These are saved rectangles, not independently verified support or resistance. Say marked zone unless a role is explicitly documented.",
    entryRuleVerified: !!decision?.strategy?.verified,
    validityLimit: entryRulesDocumented
      ? "Evaluate the exact documented entry rules; distinguish the user’s rules from independently verified source rules."
      : "No precise verified entry rule is saved. A zone touch and a correctly placed stop do not prove a fully confirmed setup. Start Unclear if asked to certify validity; explain the specific chart strengths and missing confirmation, not missing stops.",
  };
}

export function reviewAnswerIssue(text: string, context: any) {
  const selected = context.selectedTrade;
  if (text.trim().split(/\s+/).length > 85)
    return "Answer in at most three short sentences and about fifty words. Include one chart observation that answers the current question.";
  if (contradictsSavedStop(text, selected?.sl))
    return "The selected trade's initial stop is already saved; do not claim it is missing.";
  if (selected) {
    for (const m of text.matchAll(
      /\bentry(?: price)?\s*(?:at|is|was|of|:|=)?\s*\$?(\d{3,6}(?:[.,]\d{1,6})?)/gi,
    )) {
      if (Math.abs(Number(m[1].replace(",", ".")) - selected.entry) > 0.0011)
        return "The actual executed entry is selectedTrade.entry. Do not substitute the original pending-order price.";
    }
    const facts = context.reviewFacts;
    if (facts) {
      if (
        facts.zones?.length &&
        /(?:hit|at|inside|touched) (?:a |the |your )?(?:support|resistance) zone/i.test(
          text,
        )
      )
        return "The saved rectangle has no verified support/resistance role. Call it the marked zone and explain its observed geometry without inventing a label.";
      if (
        !/\b(?:zone|sone|området|EMA|SMA|inside|innenfor|previous candle|last finished|siste ferdige|swing|high|low|topp|bunn)\b/i.test(
          text,
        )
      )
        return "Include one concrete observation from the original decision candles, zone or listed indicator, not only a generic missing-rule statement.";
      const claims = text
        .split(/[!?;]/)
        .filter(
          (s) =>
            !/\b(?:if|wait|watch|look for|would|need|could|until)\b/i.test(s),
        )
        .join(" ");
      if (
        !facts.completedBreakBelow &&
        /break(?:ing)?\s+below\s+(?:support|the\s+(?:low|EMA)|EMA)/i.test(
          claims,
        )
      )
        return "No completed break below support is present in the saved decision scan. Do not call one confirmed.";
      if (
        !facts.completedBreakAbove &&
        /break(?:ing)?\s+above\s+(?:resistance|the\s+(?:high|EMA)|EMA)/i.test(
          claims,
        )
      )
        return "No completed break above resistance is present in the saved decision scan.";
      if (
        !(facts.entryRulesDocumented ?? facts.entryRuleVerified) &&
        /^(?:yes|no|valid|invalid|absolutely|definitely|ja|nei|gyldig|ugyldig)\b/i.test(
          text.trim(),
        )
      )
        return "No precise verified entry rule is saved. Start Unclear, distinguish a plausible zone idea from confirmed rule validity, and give a concrete chart reason.";
      if (
        facts.zones?.some((z: any) => z.entryInside) &&
        /no (?:completed |confirmed )?zone touch|outside (?:the |your )?(?:marked |saved )?zone/i.test(
          text,
        )
      )
        return "The actual executed entry IS inside the saved marked zone. Do not say the zone was not touched; distinguish a touch from confirmation.";
    }
  }
  const indicators =
    context.reviewAtDecision?.indicators ?? context.indicators ?? [];
  for (const match of text.matchAll(
    /\b(EMA|SMA|RSI|ATR)\s*[-:]?\s*(\d{1,3})\b/gi,
  ))
    if (
      !indicators.some(
        (i: any) =>
          i.kind === match[1].toUpperCase() && i.period === Number(match[2]),
      )
    )
      return "That indicator period is not present in the supplied chart. Use only the listed indicators.";
  return null;
}

// A bounded factual answer is preferable to presenting a second hallucinated
// verdict. The rejected model drafts remain in the session for inspection.
export function factualTradeReview(context: any, language = "English") {
  const trade = context.selectedTrade,
    facts = context.reviewFacts;
  if (!trade || !facts)
    return "Unclear: the original decision evidence is unavailable. I cannot reliably judge this entry from a later chart.";
  const location = facts.zones?.some((z: any) => z.entryInside)
    ? "inside your marked zone"
    : "recorded in your trade history";
  const direction =
    trade.side === "sell"
      ? "below the previous candle’s low"
      : "above the previous candle’s high";
  const broke =
    trade.side === "sell"
      ? facts.completedBreakBelow
      : facts.completedBreakAbove;
  const observation = broke
    ? "The last finished candle had a directional break"
    : "The last finished candle did not close " + direction;
  if (language === "Norwegian") {
    const place = facts.zones?.some((z: any) => z.entryInside)
      ? "i området du markerte"
      : "på den lagrede inngangsprisen";
    return (
      "Uklart: " +
      (trade.side === "sell" ? "salget" : "kjøpet") +
      " ditt var " +
      place +
      ". " +
      (broke
        ? "Siste ferdige candle hadde et brudd i trade-retningen."
        : "Siste ferdige candle bekreftet ikke et brudd i trade-retningen.") +
      " " +
      (trade.sl
        ? facts.entryRulesDocumented
          ? "Stop loss og inngangsregelen er lagret; sammenlign regelen med denne candle."
          : "Stop loss var lagret; det som mangler er en tydelig regel for når du ville gå inn."
        : "Ingen opprinnelig stop loss eller tydelig inngangsregel er lagret.")
    );
  }
  return (
    "Unclear: your " +
    trade.side +
    " entry at " +
    trade.entry +
    " was " +
    location +
    ". " +
    observation +
    ". " +
    (trade.sl
      ? facts.entryRulesDocumented
        ? "Your initial stop and entry rule were saved; compare that rule with this candle."
        : "Your initial stop was saved; the missing part is a clear rule for what must happen before entry."
      : "No initial stop or clear entry rule was saved.")
  );
}

export function factualChartHint(context: any, language = "English") {
  const pair = context.chartScan?.lastClosedPair;
  if (!pair)
    return language === "Norwegian"
      ? "Det er for få ferdige candles i dette utsnittet til å sammenligne dem. Zoom litt ut for å se to ferdige candles."
      : "There are not two finished candles in this window to compare. Zoom out slightly to see a finished pair.";
  const above = pair.next.close > pair.reference.high,
    below = pair.next.close < pair.reference.low;
  if (language === "Norwegian")
    return above
      ? "Siste ferdige candle sluttet over toppen av den forrige. Følg med på om prisen holder seg over den toppen; en kort veke alene bekrefter ikke en ny inngang."
      : below
        ? "Siste ferdige candle sluttet under bunnen av den forrige. Følg med på om prisen holder seg under den bunnen; en kort veke alene bekrefter ikke en ny inngang."
        : "Siste ferdige candle sluttet innenfor den forrige. Bruk toppen og bunnen av den forrige som referanser, og se hvilken side en ny candle faktisk slutter på.";
  return above
    ? "The last finished candle closed above the previous high. Watch whether price holds above that high; a wick alone does not confirm a new entry."
    : below
      ? "The last finished candle closed below the previous low. Watch whether price holds below that low; a wick alone does not confirm a new entry."
      : "The last finished candle closed inside the previous candle. Watch its high and low, then see which side a new candle actually finishes on.";
}
