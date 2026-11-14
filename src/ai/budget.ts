import type { buildContext } from "./context";
export function fitContext(
  input: ReturnType<typeof buildContext>,
  contextTokens: number,
  generationTokens: number,
  vision: boolean,
) {
  const value = structuredClone(input);
  const limit = Math.max(
    2200,
    Math.floor(
      (contextTokens - generationTokens - (vision ? 1300 : 0) - 700) * 1.5,
    ),
  );
  value.tradeHistory = value.tradeHistory.slice(0, 8);
  if (value.reviewAtDecision) {
    value.reviewAtDecision.candles = value.reviewAtDecision.candles.slice(-32);
    value.reviewAtDecision.secondCandles = value.reviewAtDecision.secondCandles.slice(-12);
    if (value.reviewAtDecision.strategy?.text) value.reviewAtDecision.strategy.text = value.reviewAtDecision.strategy.text.slice(0, 1000);
  }
  value.candles = value.candles.slice(-32);
  value.secondCandles = value.secondCandles.slice(-16);
  value.conversation = value.conversation
    .slice(-6)
    .map((m) => ({ ...m, content: m.content.slice(-600) }));
  value.notes = value.notes
    .slice(-6)
    .map((n) => ({ ...n, text: n.text.slice(-500) }));
  if ("rules" in value.strategy)
    value.strategy.rules = value.strategy.rules
      .slice(0, 12)
      .map((r) => ({ ...r, text: r.text.slice(0, 300) }));
  value.strategy.text = value.strategy.text.slice(0, 2000);
  while (JSON.stringify(value).length > limit) {
    if (value.conversation.length > 2) value.conversation.shift();
    else if (value.tradeHistory.length > 3) value.tradeHistory.pop();
    else if (value.notes.length) value.notes.shift();
    else if (value.strategy.text.length > 200)
      value.strategy.text = value.strategy.text.slice(
        0,
        Math.floor(value.strategy.text.length / 2),
      );
    else if (value.candles.length > 8) value.candles.shift();
    else if (value.secondCandles.length > 4) value.secondCandles.shift();
    else if (value.drawings.length > 4) value.drawings.shift();
    else break;
  }
  return {
    ...value,
    contextLimits: {
      characterBudget: limit,
      visibleCandlesIncluded: value.candles.length,
      secondCandlesIncluded: value.secondCandles.length,
      totalDrawings: input.drawings.length,
      includedDrawings: value.drawings.length,
      historyIsRetrievedNotRetraining: true,
    },
  };
}
