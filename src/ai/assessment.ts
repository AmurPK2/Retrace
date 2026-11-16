import type { Bar, Drawing, TF } from "../types";
import { FRAMES } from "../types";
import type { RRRange } from "../core/rr-study";
import type { planEvidence } from "../core/order-validation";
type Input = {
  cutoff: number;
  timeframe: TF;
  candles: Bar[];
  selectedRange: RRRange | null;
  planFacts: ReturnType<typeof planEvidence>;
  drawings: Drawing[];
  strategy: { text: string };
  pending: { id: string }[];
  openPositions: { id: string }[];
};
export function assessmentFacts(c: Input) {
  const pair = c.selectedRange;
  const candle = (b: Bar, tf: TF) => ({
    ...b,
    completed: (b.time + FRAMES[tf]) * 1000 <= c.cutoff,
  });
  const named = pair
    ? Object.entries({
        "C1 low": pair.c1.low,
        "C1 high": pair.c1.high,
        "C2 low": pair.c2.low,
        "C2 high": pair.c2.high,
      })
    : [];
  const entries = c.planFacts.entries.map((p) => ({
    ...p,
    // Geometry alone permits missing optional stops. Assessment must expose that distinction.
    protection:
      p.sl === undefined
        ? "missing SL"
        : p.tp === undefined
          ? "missing TP"
          : "SL and TP supplied",
    levelReferences: Object.fromEntries(
      (["entry", "sl", "tp"] as const).map((k) => [
        k,
        named
          .filter(([, price]) => Math.abs(Number(price) - Number(p[k])) < 1e-8)
          .map(([name]) => name),
      ]),
    ),
  }));
  return {
    ruleVerification: c.strategy.text.trim()
      ? "Written rules supplied; freely written conditions need evidence-by-evidence review, not automatic approval"
      : "No written entry rule: strategy compliance is unclear",
    geometry: entries.some((p) => p.issues.length)
      ? "invalid"
      : entries.some((p) => p.sl === undefined || p.tp === undefined)
        ? "incomplete"
        : entries.length
          ? "valid"
          : "no plan",
    entries,
    combinedRisk:
      c.planFacts.combinedRisk === null
        ? null
        : Math.round(c.planFacts.combinedRisk * 100) / 100,
    currency: c.planFacts.currency,
    writtenRuleNumbers: [
      ...c.strategy.text.matchAll(/(?<![\w.,])\d+(?:[.,]\d+)?(?!\w)/g),
    ].map((m) => Number(m[0].replace(",", "."))),
    writtenRuleNumberNote:
      "Literal numbers from the supplied written rule, not verified chart observations or a rule parser.",
    pair: pair
      ? {
          timeframe: pair.timeframe,
          c1: candle(pair.c1, pair.timeframe),
          c2: candle(pair.c2, pair.timeframe),
          closeComparison:
            pair.c2.close > pair.c1.high
              ? "above C1 high"
              : pair.c2.close < pair.c1.low
                ? "below C1 low"
                : "inside or on C1 range",
        }
      : null,
    entryTimeframe: {
      timeframe: c.timeframe,
      candles: c.candles.slice(-3).map((b) => candle(b, c.timeframe)),
    },
    drawings: c.drawings
      .filter((d) => !d.hidden)
      .map((d) => ({
        id: d.id,
        kind: d.kind,
        label: d.label,
        anchors: [d.a, d.b],
        fibLevels:
          d.kind === "fib"
            ? d.levels.map((r) => ({
                ratio: r,
                price: d.a.price + (d.b.price - d.a.price) * r,
              }))
            : undefined,
      })),
    execution: {
      drafts: entries.filter(
        (p) => p.source === "drawing plan" || p.source === "unplaced draft",
      ).length,
      pending: c.pending.length,
      open: c.openPositions.length,
      note: "Drawings and drafts are unplaced; pending orders are not fills. No recommendation to execute to validate a decision.",
    },
    outcome:
      "Later profit/loss is excluded from entry-rule verification. An outcome cannot establish a good decision.",
  };
}
export function assessmentReply(c: Input, nb: boolean) {
  const f = assessmentFacts(c),
    p = f.pair;
  const lead = nb
    ? f.geometry === "invalid"
      ? "Ordregeometrien er ikke oppfylt; strategien må vurderes separat."
      : "Uklart om hele strategien er oppfylt; " +
        (f.geometry === "valid"
          ? "ordregeometrien er gyldig."
          : "ordrenivåene er ufullstendige.")
    : f.geometry === "invalid"
      ? "Order geometry fails; strategy compliance is a separate question."
      : "Full strategy compliance is unclear; " +
        (f.geometry === "valid"
          ? "order geometry is valid."
          : "order levels are incomplete.");
  const pair = p
    ? (nb
        ? `Markerte ${p.timeframe}-candles er ferdige. C1 høy/lav er ${p.c1.high}/${p.c1.low}; C2 slutt er ${p.c2.close}, `
        : `The marked ${p.timeframe} candles are completed. C1 high/low is ${p.c1.high}/${p.c1.low}; C2 close is ${p.c2.close}, `) +
      (p.closeComparison === "above C1 high"
        ? nb
          ? "over C1-toppen."
          : "above C1 high."
        : p.closeComparison === "below C1 low"
          ? nb
            ? "under C1-bunnen."
            : "below C1 low."
          : nb
            ? "innenfor eller på C1-området."
            : "inside or on the C1 range.")
    : nb
      ? "C1/C2 er ikke entydig valgt. Marker C1 én gang før du vurderer candleparet."
      : "No unique C1/C2 pair is selected. Mark C1 once before assessing that pair.";
  const plans = f.entries
    .map(
      (e, i) =>
        (nb ? `Inngang ${i + 1}` : `Entry ${i + 1}`) +
        `: ${e.side.toUpperCase()} ${e.entry}, SL ${e.sl ?? "—"}, TP ${e.tp ?? "—"}; ` +
        (nb ? "risiko " : "risk ") +
        (e.risk === null ? "—" : e.risk.toFixed(2)) +
        ` ${f.currency}, R:R ${e.rr ?? "—"}.`,
    )
    .join(" ");
  const risk =
    f.combinedRisk === null
      ? nb
        ? "Samlet risiko kan ikke beregnes uten SL på hver inngang."
        : "Combined risk cannot be calculated without a stop on each entry."
      : nb
        ? `Samlet beregnet risiko er ${f.combinedRisk.toFixed(2)} ${f.currency}, med innstilte kostnader. Felles SL summeres per inngang.`
        : `Combined estimated risk is ${f.combinedRisk.toFixed(2)} ${f.currency}, with configured costs. A shared stop still adds risk per entry.`;
  const latest = f.entryTimeframe.candles.filter((b) => b.completed).at(-1);
  const ltf = latest
    ? nb
      ? `Siste medfølgende ferdige ${c.timeframe}-candle sluttet på ${latest.close}.`
      : `The last supplied completed ${c.timeframe} candle closed at ${latest.close}.`
    : nb
      ? "Ingen ferdig candle på inngangstidsrammen følger med."
      : "No completed entry-timeframe candle is supplied.";
  const next = nb
    ? f.geometry === "invalid"
      ? "Neste steg: korriger SL/TP-rekkefølgen for hver inngang."
      : f.geometry === "incomplete"
        ? "Neste steg: definer manglende SL/TP og kontroller samlet risiko."
        : !c.strategy.text.trim()
          ? "Neste steg: skriv én konkret inngangsbekreftelse og et risikobudsjett."
          : "Neste steg: sammenhold den siste ferdige inngangscandlen med din skrevne bekreftelsesregel."
    : f.geometry === "invalid"
      ? "Next: correct each entry's SL/TP ordering."
      : f.geometry === "incomplete"
        ? "Next: define missing SL/TP and check combined risk."
        : !c.strategy.text.trim()
          ? "Next: write one precise entry condition and a risk budget."
          : "Next: compare the last completed entry candle with your written confirmation rule.";
  return [
    lead,
    pair,
    plans,
    risk,
    ltf,
    nb
      ? "Det er bra å planlegge nivåer før utførelse. Tegninger og utkast er ikke fyllinger; fri regeltekst er ikke automatisk kontrollert. Et mål inne i C1 er ikke automatisk feil, og 4H-sluttprisen er ikke automatisk SL. Et senere resultat godkjenner ikke beslutningen."
      : "Planning levels before execution is useful. Drawings and drafts are not fills; free-text rules are not automatically verified. A target inside C1 is not automatically wrong, and a 4H close is not automatically SL. Later outcomes cannot approve the decision.",
    next,
  ]
    .filter(Boolean)
    .join(" ");
}
