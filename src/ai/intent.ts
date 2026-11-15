import type { Session } from "../types";
import { sessionTrades } from "../core/trade-evidence";
export function userQuestion(prompt: string) {
  return prompt
    .replace(
      /^(?:Check setup|Give a hint|Review trade|Open chat|Sjekk oppsett|Gi et hint|Gjennomgå handelen|Fri samtale):\s*/i,
      "",
    )
    .trim();
}
export function replyLanguage(prompt: string) {
  return /[æøå]|\b(?:gi meg|gi et|kan du|var den|er den|ikke|traden|handelen|tidligere|forrige|hva|hvordan|hvorfor|oppsett|vurder|tidsramme|innganger|hintet|se på|kjøp|selg)\b/i.test(
    userQuestion(prompt),
  )
    ? "Norwegian"
    : "English";
}
export function currentChartHint(prompt: string) {
  const q = userQuestion(prompt);
  return (
    /\b(?:hint|tips|ledetråd)\b/i.test(q) &&
    !/\b(?:trade|traden|handelen|entry|inngang)\b/i.test(q)
  );
}
export function selectTradeReference<
  T extends { id: string; side: "buy" | "sell"; entry: number },
>(trades: T[], prompt: string, previousId?: string) {
  const q = userQuestion(prompt);
  let choices = trades;
  const buy = /\b(?:buy|long|kjøp|kjøpte)\b/i.test(q),
    sell = /\b(?:sell|short|selg|solgte)\b/i.test(q);
  if (buy !== sell)
    choices = choices.filter((t) => t.side === (buy ? "buy" : "sell"));
  const price = q.match(
    /(?:entry|inngang|trade|traden|handel|bought|sold)\s*(?:at|på|ved|:|@)?\s*(\d{3,6}(?:[.,]\d{1,6})?)/i,
  );
  if (price) {
    const value = +price[1].replace(",", ".");
    const exact = choices.filter((t) => Math.abs(t.entry - value) <= 0.0011);
    if (exact.length === 1) return exact[0];
  }
  if (/\b(?:first|oldest|første|eldste)\b/i.test(q))
    return choices.at(-1) ?? null;
  if (
    /\b(?:before that|one before|før den|før denne)\b/i.test(q) &&
    previousId
  ) {
    const i = choices.findIndex((t) => t.id === previousId);
    return i >= 0 ? (choices[i + 1] ?? null) : null;
  }
  return choices[0] ?? null;
}

export function savedHistoryAnswer(session: Session, prompt: string) {
  const q = userQuestion(prompt);
  if (
    !/trades|history|historikk|handler|handlene|tidligere|forrige/i.test(q) ||
    !/can you see|do you see|show|list|how many|kan du se|ser du|vis meg|hvor mange/i.test(
      q,
    ) ||
    /valid|setup|good|bad|gyldig|ugyldig/i.test(q)
  )
    return null;
  const trades = sessionTrades(session),
    no = replyLanguage(prompt) === "Norwegian";
  if (!trades.length)
    return no
      ? "Denne økten har ingen utførte trades ennå. Ventende ordre teller ikke som en utført trade."
      : "This session has no executed trades yet. Pending orders do not count as executed trades.";
  const latest = trades
    .slice(0, 2)
    .map(
      (t) =>
        t.side.toUpperCase() +
        " @ " +
        t.entry.toFixed(session.broker.specs.precision) +
        " (" +
        (t.status === "open"
          ? no
            ? "åpen"
            : "open"
          : (t.net >= 0 ? "+" : "") +
            t.net.toFixed(2) +
            " " +
            (session.broker.specs.currency ?? "USD")) +
        ")",
    )
    .join("; ");
  return no
    ? "Ja, jeg ser " +
        trades.length +
        " utførte trades i denne økten. Siste: " +
        latest +
        ". Velg en trade i feltet over for å vurdere det opprinnelige beslutningsbildet."
    : "Yes, I can see " +
        trades.length +
        " executed trades in this session. Latest: " +
        latest +
        ". Choose one in the selector above to review its original decision chart.";
}
