import { assessmentReply } from "./assessment";
import { factualChartHint } from "../core/trade-evidence";
import type { buildContext } from "./context";
import { replyLanguage } from "./intent";
export function coachRuleIssue(text: string): string | null {
  if (
    /(?:stop|sl).{0,55}(?:must|always|use|skal|må).{0,60}(?:4h|same|samme).{0,30}(?:close|sluttpris)|(?:use|bruk).{0,30}(?:4h|same|samme).{0,30}(?:close|sluttpris).{0,35}(?:stop|sl)/i.test(
      text,
    )
  )
    return "A candle close is not an automatic SL rule.";
  if (
    /(?:stop|target|sl|tp).{0,40}(?:must|always|må).{0,25}(?:outside|utenfor).{0,30}(?:candle|range|område)/i.test(
      text,
    )
  )
    return "Targets inside a prior candle range are not universally invalid.";
  return null;
}
export function coachEvidenceReply(
  c: ReturnType<typeof buildContext>,
  prompt: string,
): string {
  const nb = replyLanguage(prompt) === "Norwegian";
  if (
    /(?:what|which).{0,30}timeframe|hvilken.{0,30}tidsram|do i mark|(?:difference|forskjell).{0,50}(?:4H|context|kontekst)|hvordan.{0,40}tidsram/i.test(
      prompt,
    )
  )
    return nb
      ? "Bruk 4H til å beskrive området du trener på, og en lavere tidsramme til å undersøke inngangen. En 4H-candle inneholder mange mindre candles; 15m viser utviklingen tydeligere, mens 5m eller 1m gir flere detaljer og mer støy. Det finnes ingen automatisk regel om at én bestemt kombinasjon er riktig. Marker først C1 og den neste ferdige C2 på 4H. Et stikk utenfor er en veke; en bekreftet slutt utenfor krever at C2 er ferdig. Bytt deretter til inngangstidsrammen og se etter bekreftelsen du faktisk har skrevet i reglene dine. SL skal uttrykke hva som gjør ideen feil, ikke automatisk settes ved 4H-sluttprisen. Neste steg: marker C1 i 4H-visningen og skriv hvilken bekreftelse du vil se før inngang."
      : "Use 4H to define the context and a lower timeframe to examine execution. A 4H candle contains many smaller candles: 15m shows its development, while 5m or 1m provides more detail and noise. No universal rule chooses a mandatory pair. Mark C1 and the next completed C2 on 4H, distinguish a wick from a completed close outside, then look for the entry confirmation in your written rules. A stop expresses invalidation; it is not automatically the 4H close. Next: mark C1 and describe the confirmation you will wait for.";
  if (
    /always true|alltid|universal|must be outside|close as.{0,20}stop/i.test(
      prompt,
    )
  )
    return nb
      ? "Nei. Verken 4H-sluttprisen som automatisk SL eller et krav om TP utenfor hele candleområdet er universelle regler. SL skal beskrive hva som gjør den konkrete ideen feil, og ligge på tapssiden av inngangen. Et mål innenfor C1 kan være et bevisst delmål. Kildeeksempelet med PO3 bruker 4H-åpningen som kontekst og en lokal bekreftelse før inngang; det gjør ikke sluttprisen til en obligatorisk stopp. Neste steg: skriv hvilken observasjon som gjør din idé feil, og velg så et konkret SL-nivå som passer den observasjonen."
      : "No. A 4H close is not an automatic stop, and targets do not universally need to sit outside the entire candle range. A stop should express what invalidates the specific idea and sit on the loss side of entry. A target inside C1 can be a deliberate partial objective. The referenced PO3 example uses the 4H open as context and a local entry confirmation; that does not make the close a mandatory stop. Next: state the observation that would invalidate your idea, then choose a concrete stop level consistent with it.";
  if (
    /describe.{0,40}observation|beskriv.{0,40}observasjon|one hint|ett hint/i.test(
      prompt,
    )
  )
    return factualChartHint(c, nb ? "Norwegian" : "English");
  const plans = c.planFacts.entries;
  const geometryOnly =
    /no entry confirmation|geometry.{0,20}(?:only|practice)/i.test(
      c.strategy.text,
    );
  if (geometryOnly && plans.length) {
    const valid = plans.every(
      (p) => !p.issues.length && p.sl !== undefined && p.tp !== undefined,
    );
    const details = plans
      .map(
        (p, i) =>
          (nb ? "Inngang " : "Entry ") +
          (i + 1) +
          ": " +
          p.side.toUpperCase() +
          " " +
          p.entry +
          ", SL " +
          p.sl +
          ", TP " +
          p.tp +
          ", " +
          p.lots +
          " " +
          (c.assumptions.unit ?? "lot") +
          ".",
      )
      .join(" ");
    const risk = c.planFacts.combinedRisk;
    return nb
      ? (valid
          ? "Ordregeometrien oppfyller den skrevne øvingsregelen. "
          : "Ordregeometrien oppfyller ikke den skrevne øvingsregelen. ") +
          details +
          " " +
          (valid
            ? "SL ligger på tapssiden og TP på gevinstsiden. "
            : "For kjøp må SL ligge under inngangen og TP over; for salg gjelder motsatt rekkefølge. ") +
          (risk === null
            ? "Risiko kan ikke beregnes uten SL. "
            : "Avstanden til valgt SL tilsvarer " +
              risk.toFixed(2) +
              " " +
              c.planFacts.currency +
              " med innstilte kostnader. ") +
          "Det er bra at du har definert nivåer og størrelse før utførelse. Denne øvelsen krever ingen bestemt candlebekreftelse, så jeg legger ikke til et brudd eller en veke som ny inngangsregel. Gyldig geometri sier ikke om prisen vil gå opp eller ned. Neste steg: sammenlign totalrisikoen med ditt skrevne budsjett, og korriger eventuelle ugyldige nivåer før du bekrefter utkastet."
      : (valid
          ? "The order geometry meets your written practice rule. "
          : "The order geometry does not meet your written practice rule. ") +
          details +
          " " +
          (valid
            ? "The stop is on the loss side and the target on the gain side. "
            : "For a buy, SL must be below entry and TP above; a sell uses the reverse order. ") +
          (risk === null
            ? "Risk cannot be calculated without a stop. "
            : "The distance to the selected SL represents " +
              risk.toFixed(2) +
              " " +
              c.planFacts.currency +
              " with configured costs. ") +
          "Defining levels and size before execution is useful. This exercise explicitly requires no candle confirmation, so a breakout or sweep is not an additional entry requirement. Valid geometry does not predict whether price will rise or fall. Next: compare the combined amount with your written budget and correct any invalid levels before confirming the draft.";
  }
  return assessmentReply(c, nb);
}

export function coachEvidenceIssue(
  text: string,
  c: ReturnType<typeof buildContext>,
): string | null {
  const clean = text.replace(/\*\*/g, "");
  if (c.dataQuality?.status === "insufficient")
    return "Historical evidence is incomplete. Do not assess setup validity as if data were complete.";
  if (
    !c.reviewMode &&
    !c.pending.length &&
    /(?:you have|your|du har|din).{0,30}(?:pending (?:buy|sell|order)|ventende ordre)|(?:you have|du har).{0,15}(?:a |en )?pending|(?:setup|oppsett).{0,15}(?:is|er) (?:a|en) pending/i.test(
      clean,
    )
  )
    return "No pending orders exist. Drawing plans and unplaced drafts are not submitted orders.";
  if (
    !c.reviewMode &&
    !c.openPositions.length &&
    /(?:you (?:have )?(?:bought|entered)|du har (?:kjøpt|gått inn))/i.test(
      clean,
    )
  )
    return "No position has been filled. Describe the drawing or draft without inventing execution.";
  if (
    !c.reviewMode &&
    c.planFacts.entries.some((p) => p.sl === undefined) &&
    /(?:risk.{0,35}(?:met|complied|safe)|risiko.{0,35}(?:overholdt|oppfylt)|ufarlig|risk is \d)/i.test(
      clean,
    )
  )
    return "At least one entry has no SL. Combined risk and risk-budget compliance are unknown, never safe or verified.";
  if (
    !c.reviewMode &&
    (!c.strategy.text.trim() ||
      (c as any).contextLimits?.strategyTextTruncated) &&
    clean
      .split(/[.!?\n]/)
      .some(
        (sentence) =>
          /(?:setup|strategy|oppsett|strategi).{0,35}(?:is valid|is supported|er gyldig|er godkjent)/i.test(
            sentence,
          ) &&
          !/cannot|can't|not (?:verified|valid|supported)|unclear|ikke|uklar/i.test(
            sentence,
          ),
      )
  )
    return "There is no complete written entry rule. Distinguish valid geometry from unknown strategy compliance.";
  if (
    /execute.{0,35}(?:validate|generate trade history)|utfør.{0,35}(?:validere|godkjenne)/i.test(
      clean,
    )
  )
    return "Executing an order is not needed to establish decision quality. Ask for rules/evidence, not a trade to validate the idea.";
  if (
    !c.selectedRange &&
    clean
      .split(/[\n!?]/)
      .some(
        (line) => /\bC[12]\b/i.test(line) && /\b\d{3,6}(?:[.,]\d+)?/.test(line),
      )
  )
    return "No C1/C2 pair is selected. Do not assign any candle or price to those names. Ask for one explicit C1 selection.";
  if (
    /(?:word count|system instruction|user prompt|let me|wait,|I need to (?:expand|draft))/i.test(
      clean,
    )
  )
    return "Return only the final explanation to the user, without drafting notes or a discussion of prompts.";
  if (c.selectedRange) {
    for (const m of clean.matchAll(
      /\bC([12])[- ]?(high|low|close|open|høyeste|laveste|topp|bunn|slutt)\s*(?:er|is|var|was|:|=|ved|at)?\s*\(?\s*(\d+(?:[.,]\d+)?)/gi,
    )) {
      const candle = m[1] === "1" ? c.selectedRange.c1 : c.selectedRange.c2;
      const field = /high|høyeste|topp/i.test(m[2])
        ? "high"
        : /low|laveste|bunn/i.test(m[2])
          ? "low"
          : /close|slutt/i.test(m[2])
            ? "close"
            : "open";
      if (Math.abs(candle[field] - Number(m[3].replace(",", "."))) > 1e-8)
        return "A named C1/C2 level does not match its exact candle field. Do not substitute close for high/low; use assessment.pair and entry levelReferences.";
    }
  }
  const claims = [
    ...clean.matchAll(
      /(?:SL|stop.loss)\s*\(?([\d.]+)\)?.{0,20}(above|below|over|under).{0,25}(?:entry|inngang)[^\d]{0,12}([\d.]+)/gi,
    ),
  ];
  for (const m of claims) {
    const stop = Number(m[1]),
      entry = Number(m[3]),
      above = /above|over/i.test(m[2]);
    if (above ? stop <= entry : stop >= entry)
      return "Your stated SL/entry comparison is arithmetically false. Use the computed slRelation and geometry fields.";
  }
  if (
    c.selectedRange &&
    /C2.{0,45}(?:not (?:finished|completed|closed)|still (?:forming|developing)|ikke (?:er )?ferdig|fortsatt (?:i gang|pågår))/i.test(
      clean,
    )
  )
    return "The explicitly selected C1 and C2 are both completed. Only the later current candle may be forming.";
  if (
    c.selectedRange &&
    /(?:must|need to|må).{0,20}(?:mark|select|marker).{0,15}C1/i.test(clean)
  )
    return "C1 and C2 are already explicitly selected; use their exact supplied timestamps.";
  if (
    !c.openPositions.length &&
    /(?:you have|plan has|du har).{0,20}(?:one|two|an|en|én|to).{0,12}(?:open position|åpen posisjon)/i.test(
      clean,
    )
  )
    return "There is no open position. A draft/drawing is an unplaced plan, and a pending order is not yet filled.";
  if (
    /no entry confirmation|geometry.{0,20}(?:only|practice)/i.test(
      c.strategy.text,
    ) &&
    /(?:wait for|must|need|require|vent på|må).{0,100}(?:break|close|sweep|brudd|slutt)/i.test(
      clean,
    )
  )
    return "This is explicitly a geometry-only practice rule. Do not add a mandatory breakout, sweep or candle-close entry condition. State that geometry and budget compliance do not predict price.";
  const entries = c.planFacts.entries;
  if (!c.reviewMode && entries.length === 2) {
    const mentioned = [
      ...clean.matchAll(/(?<![\w.,])\d+(?:[.,]\d+)?(?!\w)/g),
    ].map((m) => Number(m[0].replace(",", ".")));
    if (
      entries.some((p) => !mentioned.some((n) => Math.abs(n - p.entry) < 1e-8))
    )
      return "Two plans are supplied. Explain each exact entry with its own SL, target and computed cash risk before comparing the aggregate. Do not choose one merely from R:R.";
  }
  if (
    !c.reviewMode &&
    entries.length &&
    entries.every((p) => !p.issues.length && p.sl !== undefined) &&
    /(?:risk (?:is |remains )?(?:unknown|uncertain|undefined)|(?:unknown|uncertain|undefined) (?:cash )?risk|risiko(?:en)? (?:er |forblir )?(?:ukjent|usikker|udefinert))/i.test(
      clean,
    )
  )
    return "Cash risk is computed for every supplied plan. Distinguish known cash risk from unverified strategy quality.";
  if (
    entries.length &&
    entries.every((p) => !p.issues.length) &&
    /(?:violates? (?:your |the )?(?:geometry|SL)|geometry (?:is invalid|rules? (?:are|is) not met)|ordregeometri er ikke oppfylt)/i.test(
      clean,
    )
  )
    return "All supplied entries pass the deterministic geometry check. Do not claim that valid SL/TP ordering is invalid.";
  return null;
}
