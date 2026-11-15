import { factualChartHint } from "../core/trade-evidence";
import type { buildContext } from "./context";
import { replyLanguage } from "./intent";
import { draftIssues, combinedPlanRisk } from "../core/order-validation";
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
    const valid = plans.every((p) => !p.issues.length);
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
  const issues = plans.flatMap((p) => draftIssues(p, c.assumptions));
  const range = c.selectedRange;
  const risk = c.planFacts.combinedRisk;
  const detail = plans
    .map((p, i) => {
      const rr = p.rr ?? NaN;
      return (
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
        " lot; R:R " +
        (Number.isFinite(rr) ? rr.toFixed(2) : "—") +
        "."
      );
    })
    .join(" ");
  if (nb)
    return (
      (issues.length
        ? "Reglene for ordregeometri er ikke oppfylt. "
        : plans.length
          ? c.selectedRange
            ? "Ordregeometrien er støttet; et komplett strategisignal er ikke bekreftet. "
            : "Uklart om strategien er oppfylt; ordregeometrien er støttet. "
          : "Uklart om oppsettet oppfyller strategien. ") +
      (range
        ? "Du har markert to ferdige " +
          range.timeframe +
          "-candles. C1 høy/lav er " +
          range.c1.high +
          "/" +
          range.c1.low +
          "; C2 slutt er " +
          range.c2.close +
          ". " +
          (range.c2.close > range.c1.high
            ? "C2 sluttet over C1-toppen. "
            : range.c2.close < range.c1.low
              ? "C2 sluttet under C1-bunnen. "
              : "C2 sluttet innenfor eller på C1-området; et sluttbrudd over er ikke bekreftet. ")
        : "Jeg har ikke et entydig markert C1/C2-par. Marker C1 med «Marker C1/C2»; appen velger neste ferdige candle som C2. ") +
      detail +
      (plans.length && risk !== null
        ? " Samlet beregnet risiko er " +
          risk.toFixed(2) +
          " i kontoens valuta, inkludert oppgitte kostnadsantakelser. "
        : "") +
      " Det er bra å planlegge inngang, ugyldiggjøring og mål før utførelse. Et mål inne i C1 er ikke automatisk feil, og 4H-sluttprisen er ikke automatisk SL. " +
      (issues.length
        ? "Kontroller at SL ligger på tapssiden og TP på gevinstsiden for hver inngang. "
        : "Det som mangler, er en dokumentert bekreftelse på inngangstidsrammen for den konkrete strategien. ") +
      (range
        ? "Neste steg: kontroller den skrevne inngangsbekreftelsen på lavere tidsramme. "
        : "Neste steg: marker candleparet og skriv én regel som må være oppfylt før du går inn. ") +
      "Vurder de to inngangene hver for seg; felles SL gjør dem ikke til én enkelt risiko. Resultatet etterpå avgjør ikke om beslutningen var god."
    );
  return (
    (issues.length
      ? "Order geometry rules are not met. "
      : plans.length
        ? c.selectedRange
          ? "Order geometry is supported; a complete strategy signal is not confirmed. "
          : "Strategy compliance is unclear; order geometry is supported. "
        : "Strategy compliance is unclear. ") +
    (range
      ? "The marked " +
        range.timeframe +
        " C1 and C2 are completed. C1 high/low: " +
        range.c1.high +
        "/" +
        range.c1.low +
        "; C2 close: " +
        range.c2.close +
        ". " +
        (range.c2.close > range.c1.high
          ? "C2 closed above C1. "
          : range.c2.close < range.c1.low
            ? "C2 closed below C1. "
            : "C2 closed within or on the C1 range, so a close above is not confirmed. ")
      : "No unique C1/C2 pair is marked. Use “Mark C1/C2” and select C1; the next completed candle becomes C2. ") +
    detail +
    (plans.length && risk !== null
      ? " Combined estimated risk is " +
        risk.toFixed(2) +
        " in the account currency, including configured costs. "
      : "") +
    " Planning entries, invalidation and targets before execution is useful. A target inside C1 is not automatically invalid; the 4H close is not an automatic stop. " +
    (issues.length
      ? "Correct SL to the loss side and TP to the profit side for each entry. "
      : "What is missing is a documented entry confirmation on the lower timeframe for the specific strategy. ") +
    (range
      ? "Next: check your written entry confirmation on the lower timeframe. "
      : "Next: mark the candle pair and state one confirmation you will wait for. ") +
    "Assess each entry separately; sharing a stop does not make their risks identical. Judge rule compliance, risk and execution separately from the later profit or loss."
  );
}

export function coachEvidenceIssue(
  text: string,
  c: ReturnType<typeof buildContext>,
): string | null {
  const clean = text.replace(/\*\*/g, "");
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
