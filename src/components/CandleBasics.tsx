import type { Bar, TF } from "../types";
import { FRAMES } from "../types";

export function CandleBasics({
  bars,
  timeframe,
  cutoff,
  norwegian,
}: {
  bars: Bar[];
  timeframe: TF;
  cutoff: number;
  norwegian: boolean;
}) {
  const pair = bars
    .filter((b) => (b.time + FRAMES[timeframe]) * 1000 <= cutoff)
    .slice(-2);
  const continuous =
    pair.length === 2 &&
    !pair[1].gapBefore &&
    pair[1].time - pair[0].time === FRAMES[timeframe];
  const low = Math.min(...pair.map((b) => b.low)),
    high = Math.max(...pair.map((b) => b.high));
  const py = (v: number) =>
    24 + ((high - v) / Math.max(high - low, 0.001)) * 82;
  const label = (t: number) =>
    new Intl.DateTimeFormat(norwegian ? "nb-NO" : "en-GB", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
    }).format(t * 1000);
  return (
    <section
      className="candle-basics"
      aria-label={
        norwegian ? "C1 C2 C3 enkelt forklart" : "C1 C2 C3 explained simply"
      }
    >
      <h3>
        {norwegian ? "Hva betyr C1, C2 og C3?" : "What do C1, C2 and C3 mean?"}
      </h3>
      <p>
        {norwegian
          ? "C betyr candle: én lysstolpe på charten. Tallene betyr bare rekkefølgen. Dette er ingen indikator."
          : "C means candle: one price bar on the chart. The numbers only show their order. This is not an indicator."}
      </p>
      <ol className="candle-order">
        <li>
          <b>C1 = {norwegian ? "første candle" : "first candle"}</b>
          <span>
            {norwegian
              ? "Den er ferdig. Bruk toppen og bunnen som to referanser."
              : "It has finished. Its high and low are your reference levels."}
          </span>
        </li>
        <li>
          <b>C2 = {norwegian ? "neste candle" : "next candle"}</b>
          <span>
            {norwegian
              ? "Den er også ferdig. Se hvor den sluttet sammenlignet med C1."
              : "It has also finished. Compare where it ended with C1."}
          </span>
        </li>
        <li>
          <b>C3 = {norwegian ? "candle etter C2" : "candle after C2"}</b>
          <span>
            {norwegian
              ? "Dette er candle du øver på å forutse. Skriv ideen før du viser resultatet."
              : "This is the candle you practise predicting. Write your idea before revealing the result."}
          </span>
        </li>
      </ol>
      {continuous ? (
        <figure className="candle-real-example">
          <svg
            viewBox="0 0 300 132"
            role="img"
            aria-label={
              norwegian
                ? "To ekte ferdige candles fra åpen chart. C3 er ukjent i eksemplet."
                : "Two real finished candles from the open chart. C3 is unknown in this example."
            }
          >
            {pair.map((b, i) => (
              <g key={b.time}>
                <line
                  x1={55 + i * 95}
                  x2={55 + i * 95}
                  y1={py(b.high)}
                  y2={py(b.low)}
                  className="candle-example-wick"
                />
                <rect
                  x={41 + i * 95}
                  width="28"
                  y={Math.min(py(b.open), py(b.close))}
                  height={Math.max(2, Math.abs(py(b.open) - py(b.close)))}
                  fill={b.close >= b.open ? "#ff8a1e" : "var(--muted)"}
                  className="candle-example-body"
                />
              </g>
            ))}
            <rect
              x="230"
              y="29"
              width="30"
              height="68"
              rx="3"
              className="candle-example-unknown"
            />
            <text
              x="245"
              y="72"
              textAnchor="middle"
              className="candle-example-question"
            >
              ?
            </text>
          </svg>
          <div
            className="candle-example-labels"
            aria-label={
              norwegian
                ? "Candles i tidsrekkefølge, tider i UTC"
                : "Candles in time order, times in UTC"
            }
          >
            {pair.map((b, i) => (
              <div key={b.time}>
                <strong>C{i + 1}</strong>
                <span>{label(b.time)} UTC</span>
              </div>
            ))}
            <div>
              <strong>C3</strong>
              <span>{norwegian ? "Ukjent ennå" : "Still unknown"}</span>
            </div>
          </div>
          <figcaption>
            {norwegian
              ? "C1 og C2 er ekte ferdige candles fra charten din. C3 er den neste — derfor vises ingen pris ennå. Én candle dekker "
              : "C1 and C2 are real finished candles from your chart. C3 comes next, so no price is shown yet. One candle covers "}
            {timeframe}.
          </figcaption>
        </figure>
      ) : (
        <p className="candle-example-unavailable">
          {norwegian
            ? "Eksemplet trenger to ferdige candles uten datagap. Flytt replay til et sted med sammenhengende priser."
            : "This example needs two finished candles without a data gap. Move replay to a continuous part of the history."}
        </p>
      )}
      <p>
        <b>{norwegian ? "Eksempel med 1H:" : "Example on 1H:"}</b>{" "}
        {norwegian
          ? "C1 er 10–11, C2 er 11–12, C3 er 12–13. Vent til C2 er ferdig kl. 12 før du vurderer den."
          : "C1 is 10–11, C2 is 11–12, C3 is 12–13. Wait until C2 finishes at 12 before judging it."}
      </p>
      <details>
        <summary>
          {norwegian ? "Fire ord du trenger nå" : "Four useful words"}
        </summary>
        <dl>
          <dt>{norwegian ? "Kropp / body" : "Body"}</dt>
          <dd>
            {norwegian
              ? "Den tykke delen: prisen da candle startet og sluttet."
              : "The thick part: where price started and finished."}
          </dd>
          <dt>{norwegian ? "Veke / wick" : "Wick"}</dt>
          <dd>
            {norwegian
              ? "Den tynne streken: høyeste og laveste pris underveis."
              : "The thin line: the highest and lowest prices reached."}
          </dd>
          <dt>{norwegian ? "Brudd / break" : "Break"}</dt>
          <dd>
            {norwegian
              ? "C2 slutter over toppen eller under bunnen av C1. At bare veken går forbi, er ikke nok."
              : "C2 finishes above C1's high or below its low. A wick crossing alone is not enough."}
          </dd>
          <dt>{norwegian ? "Kort tur utenfor / sweep" : "Sweep"}</dt>
          <dd>
            {norwegian
              ? "Prisen går forbi C1 sin topp eller bunn, men C2 slutter tilbake innenfor. Det garanterer ingen snuoperasjon."
              : "Price crosses C1's high or low, but C2 finishes back inside. This does not guarantee a reversal."}
          </dd>
        </dl>
      </details>
    </section>
  );
}

export const SIMPLE_NORWEGIAN: Record<
  string,
  { title: string; summary: string; steps: string[]; exercise: string }
> = {
  context: {
    title: "1. Se det store bildet",
    summary:
      "Zoom ut før du bestemmer deg. Hvor er prisen, og hvor kan den gå?",
    steps: [
      "På 4H dekker hver candle fire timer. På 1H dekker den én time.",
      "Finn en tidligere tydelig topp eller bunn. Skriv hvor du tror prisen kan gå.",
      "Skriv også hva som ville vist at ideen din er feil. Er du usikker, kan du vente.",
    ],
    exercise: "Marker ett mulig mål og ett nivå som ville gjort ideen feil.",
  },
  candles: {
    title: "2. Forstå de tre candles",
    summary:
      "C1, C2 og C3 er bare tre candles etter hverandre. Start med forklaringen over.",
    steps: [
      "Finn to ferdige candles. Den første er C1, den andre er C2.",
      "Sluttet C2 utenfor toppen eller bunnen til C1? Det kalles et brudd. Gikk bare veken utenfor før prisen kom tilbake? Det kalles en sweep.",
      "C3 kommer etter C2. Skriv om du forventer opp, ned eller om du vil vente. Ingen av mønstrene garanterer resultatet.",
    ],
    exercise:
      "Åpne Øv, velg to ferdige candles og skriv én kort idé for neste candle.",
  },
  confirmation: {
    title: "3. Hva vil du se før en trade?",
    summary:
      "Et interessant område alene er ingen grunn til å trykke kjøp eller selg. Bestem hva du vil se først.",
    steps: [
      "Velg ett synlig prisnivå på charten.",
      "Skriv konkret: Jeg vil se en ferdig candle slutte over eller under dette nivået.",
      "Hvis det ikke skjer, vent. Begynn med én enkel regel du kan beskrive og faktisk sjekke.",
    ],
    exercise:
      "Tegn en vannrett linje og skriv hva prisen må gjøre før du ville vurdert en trade.",
  },
  risk: {
    title: "4. Hvor mye kan du tape?",
    summary:
      "Stop loss er nivået som begrenser tapet. Bestem det før du velger størrelsen på traden.",
    steps: [
      "Entry er inngangsprisen. Stop loss er der traden skal stenges hvis ideen går feil.",
      "Se Cash risk i ordrevinduet. Det er beregnet tap fra entry til stop loss, med appens kostnader.",
      "1R betyr det opprinnelige beløpet du risikerte. Risikerer du $10, er +2R $20 før ekstra kostnader.",
    ],
    exercise:
      "Lag bare et utkast. Se hvordan Cash risk endrer seg når du flytter stop loss.",
  },
  management: {
    title: "5. Hva skjer etter inngangen?",
    summary: "Bestem på forhånd hvordan du vil avslutte traden.",
    steps: [
      "TP betyr take profit: et nivå der du planlegger å ta gevinst. TP1 er det første målet.",
      "En partial betyr å stenge bare en del av traden. En runner er delen du lar stå igjen.",
      "BE betyr å flytte stop loss til inngangsprisen. Gebyrer kan likevel gjøre sluttresultatet litt negativt.",
    ],
    exercise:
      "Prøv eksemplet under: endre hvor stor del som stenges ved første mål.",
  },
  review: {
    title: "6. Se tilbake på ideen",
    summary:
      "En god beslutning kan tape. En dårlig beslutning kan vinne. Sammenlign med planen du faktisk skrev.",
    steps: [
      "Lagre ideen før du viser neste candle.",
      "Etterpå: skjedde det du ventet på, eller tok du traden for tidlig?",
      "Skriv én ting du vil gjøre likt eller annerledes neste gang.",
    ],
    exercise:
      "Fullfør én øvelse. Vis neste candle og skriv én setning om hva du lærte.",
  },
};
