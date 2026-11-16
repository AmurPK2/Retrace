import { FRAMES, type Bar, type Session } from "../types";
import { draftIssues, combinedPlanRisk } from "./order-validation";
export const CHALLENGE_VERSION = "retrace-foundations-v2";
export const CHALLENGES = [
  [
    "candles",
    "Les en candle",
    "Read a candle",
    "Finn høyeste pris i siste ferdige 4H-candle. En kropp viser open–close; vekene viser high–low. Skriv hvorfor den er ferdig.",
    "Find the high of the last completed 4H candle. Body means open–close; wicks show high–low. Explain why it is completed.",
  ],
  [
    "pair",
    "Veke eller sluttbrudd?",
    "Wick or close break?",
    "Sammenlign de to siste ferdige 4H-candlene (C1 og C2). Velg hva C2 faktisk gjorde. En veke er ikke et bekreftet sluttbrudd.",
    "Compare the last two completed 4H candles (C1 and C2). Classify what C2 actually did. A wick is not a confirmed close break.",
  ],
  [
    "frames",
    "Koble tidsrammer",
    "Connect timeframes",
    "Hvor mange hele 15m-perioder finnes i én 4H-periode? Forklar hva den lavere tidsrammen viser; ikke bruk den som fasit for fremtiden.",
    "How many 15m periods fit inside one 4H period? Explain what the lower timeframe reveals without predicting the future.",
  ],
  [
    "level",
    "Ett viktig nivå",
    "One meaningful level",
    "Tegn eller skriv ett nivå innenfor den viste 4H-historikken. Forklar hvilken candle eller veke du bruker.",
    "Draw or enter one level within the shown 4H history. Explain which candle or wick supports it.",
  ],
  [
    "wait",
    "Gå inn eller vente?",
    "Enter or wait?",
    "Velg kjøp, salg eller vent. Skriv en observasjon og bekreftelsen du vil kreve. Begrunnet venting er et fullverdig svar.",
    "Choose buy, sell or wait. State an observation and the confirmation you require. Reasoned waiting is a complete answer.",
  ],
  [
    "invalidation",
    "Når er ideen feil?",
    "When is the idea invalid?",
    "Skriv en retning, entry og SL på tapssiden før du ser neste candle. Forklar hvorfor nivået gjør ideen feil.",
    "State a direction, entry and a loss-side SL before seeing the next candle. Explain why that level invalidates the idea.",
  ],
  [
    "risk",
    "Lag en risikoplan",
    "Build a risk plan",
    "Planlegg entry, SL, TP og størrelse. Budsjett: 10 i kontoens valuta inkludert innstilte kostnader. Dette er et øvingsbudsjett, ikke et avkastningsmål.",
    "Plan entry, SL, TP and size. Budget: 10 account-currency units including configured costs. This is a practice budget, not a return target.",
  ],
  [
    "compare",
    "Sammenlign planer",
    "Compare plans",
    "Med samme entry og SL: plan A har mål 1R unna, plan B 2R. Hvilken har høyest planlagt R:R? Forklar hvorfor det ikke alene gir størst vinnersjanse.",
    "For the same entry and SL, plan A targets 1R and plan B 2R. Which has the higher planned R:R? Explain why that alone does not imply a higher win chance.",
  ],
  [
    "two",
    "To innganger, én idé",
    "Two entries, one idea",
    "Planlegg to ulike innganger, felles SL og ulike TP-er. Samlet budsjett er 10 i kontoens valuta. Skriv en begrunnelse før avsløring.",
    "Plan two distinct entries, shared SL and distinct targets. Combined budget is 10 account-currency units. Explain before revealing.",
  ],
  [
    "reflect",
    "Én forbedring",
    "One improvement",
    "Se på din lagrede beslutning og utførelse. Skriv én konkret forbedring for neste forsøk. Skill regeloppfyllelse og risiko fra gevinst eller tap.",
    "Review your saved decision and execution. State one concrete improvement. Separate rule compliance and risk from profit or loss.",
  ],
] as const;
export type ChallengeId = (typeof CHALLENGES)[number][0];
export type ChallengeAnswer = {
  reason: string;
  value?: number;
  classification?: string;
  decision?: "buy" | "sell" | "wait";
  confirmation?: string;
  entry?: number;
  entry2?: number;
  sl?: number;
  tp?: number;
  tp2?: number;
  lots?: number;
};
export type ChallengeCheck = {
  label: string;
  pass: boolean | null;
  detail: string;
};
export type ChallengeFeedback = {
  status: "generating" | "complete";
  source: "model" | "checks";
  at: number;
  assessment: "checked" | "needs-practice" | "unclear";
  good: string;
  improve: string;
  next: string;
  evidence?: string[];
  note?: string;
};
export type Challenge = {
  id: string;
  version: string;
  stage: ChallengeId;
  cutoff: number;
  seq: number;
  timeframe: Session["layout"]["timeframe"];
  dataset: string;
  quote: Session["tick"];
  bars: Bar[];
  htf: Bar[];
  specs: Session["broker"]["specs"];
  drawings: Session["drawings"];
  orders: Session["broker"]["pending"];
  strategy?: Session["notebook"];
  feedback?: ChallengeFeedback;
  answer?: ChallengeAnswer;
  committedAt?: number;
  committedSeq?: number;
  checks?: ChallengeCheck[];
  endedAt?: number;
  revealedAt?: number;
  outcome?: { from: number; to: number; status: string; balance: number };
};
export type Learning = {
  active: Challenge;
  history: Challenge[];
  language: "nb" | "en";
};
export function beginChallenge(
  s: Session,
  bars: Bar[],
  htf: Bar[],
  stage: ChallengeId,
): Challenge {
  if (!CHALLENGES.some((c) => c[0] === stage))
    throw Error("Unknown challenge.");
  return {
    id: s.id + ":" + s.broker.seq + ":" + stage + ":" + Date.now(),
    version: CHALLENGE_VERSION,
    stage,
    cutoff: s.tick.t,
    seq: s.broker.seq,
    timeframe: s.layout.timeframe,
    dataset: s.dataset,
    quote: { ...s.tick },
    bars: structuredClone(
      bars.filter((b) => b.time * 1000 <= s.tick.t).slice(-64),
    ),
    htf: structuredClone(
      htf.filter((b) => b.time * 1000 <= s.tick.t).slice(-12),
    ),
    specs: { ...s.broker.specs },
    drawings: structuredClone(s.drawings),
    orders: structuredClone(s.broker.pending),
    strategy: structuredClone(s.notebook),
  };
}
export function pairClass(c: Challenge) {
  const closed = c.htf.filter(
      (b) => (b.time + FRAMES["4H"]) * 1000 <= c.cutoff,
    ),
    a = closed.at(-2),
    b = closed.at(-1);
  if (!a || !b || b.gapBefore || b.time - a.time !== FRAMES["4H"])
    return "missing";
  if (b.close > a.high) return "close-above";
  if (b.close < a.low) return "close-below";
  if (b.high > a.high || b.low < a.low) return "wick";
  return "inside";
}
export function checkChallenge(
  c: Challenge,
  a: ChallengeAnswer,
  nb = true,
): ChallengeCheck[] {
  const text = (n: string, e: string) => (nb ? n : e);
  const checks: ChallengeCheck[] = [];
  const add = (label: string, pass: boolean | null, detail: string) =>
    checks.push({ label, pass, detail });
  const closed = c.htf.filter(
      (b) => (b.time + FRAMES["4H"]) * 1000 <= c.cutoff,
    ),
    last = closed.at(-1),
    precision = c.specs.precision;
  const reason = a.reason.trim().length >= 12;
  add(
    text("Begrunnelse lagret", "Reason recorded"),
    reason,
    text(
      "Svar og synlig informasjon lagres før avsløring. Tekstlengde beviser ikke strategi-forståelse.",
      "The answer and visible evidence are saved before revealing. Text length does not prove understanding.",
    ),
  );
  if (c.stage === "candles")
    add(
      text("Høyeste pris i ferdig candle", "Completed candle high"),
      last
        ? Math.abs((a.value ?? NaN) - last.high) < 10 ** -precision / 2
        : false,
      last
        ? text("Siste ferdige 4H high: ", "Last completed 4H high: ") +
            last.high +
            text(". Ferdig ved ", ". Completed at ") +
            new Date((last.time + 14400) * 1000).toISOString()
        : text(
            "Historikken mangler en ferdig 4H-candle.",
            "No verified completed 4H candle is available.",
          ),
    );
  if (c.stage === "pair")
    add(
      text("C2-observasjon", "C2 observation"),
      a.classification === pairClass(c),
      text("Observerbar klasse: ", "Observable class: ") +
        pairClass(c) +
        text(
          ". Ufullstendig historikk bekrefter ikke et brudd.",
          ". Incomplete history cannot confirm a break.",
        ),
    );
  if (c.stage === "frames")
    add(
      text("Perioder, ikke vinnersjanse", "Periods, not win probability"),
      a.value === 16,
      text(
        "4 timer / 15 minutter = 16 perioder. Markedspauser kan gi færre faktiske candles.",
        "4 hours / 15 minutes = 16 periods. Market closures may leave fewer actual candles.",
      ),
    );
  if (c.stage === "level") {
    const low = Math.min(...c.htf.map((b) => b.low)),
      high = Math.max(...c.htf.map((b) => b.high));
    add(
      text("Nivå i synlig historikk", "Level within visible history"),
      Number.isFinite(a.value) && a.value! >= low && a.value! <= high,
      text("Synlig område: ", "Visible range: ") +
        low +
        "–" +
        high +
        text(
          ". Betydningen av nivået må begrunnes; plassering alene godkjenner ikke et oppsett.",
          ". Explain its significance; location alone does not validate a setup.",
        ),
    );
  }
  if (c.stage === "wait")
    add(
      text("Beslutning og betingelse", "Decision and condition"),
      !!a.decision && (a.confirmation ?? "").trim().length >= 8,
      text(
        "Vent er like gyldig som en planlagt inngang. Sammenlign bekreftelsen med de lagrede candlene.",
        "Waiting is as valid as planning an entry. Compare your confirmation with the saved candles.",
      ),
    );
  if (["invalidation", "risk", "two"].includes(c.stage)) {
    const entries = [
      {
        id: "one",
        entry: a.entry ?? NaN,
        sl: a.sl,
        tp: a.tp,
        lots: a.lots ?? c.specs.minLot,
        side: a.decision === "sell" ? ("sell" as const) : ("buy" as const),
        kind: "limit" as const,
      },
      ...(c.stage === "two"
        ? [
            {
              id: "two",
              entry: a.entry2 ?? NaN,
              sl: a.sl,
              tp: a.tp2,
              lots: a.lots ?? c.specs.minLot,
              side:
                a.decision === "sell" ? ("sell" as const) : ("buy" as const),
              kind: "limit" as const,
            },
          ]
        : []),
    ];
    const errors = entries.flatMap((p) => draftIssues(p, c.specs));
    if (a.sl === undefined) errors.push(text("SL mangler.", "SL missing."));
    if (a.decision !== "buy" && a.decision !== "sell")
      errors.push(text("Velg retning.", "Choose a direction."));
    if (
      c.stage !== "invalidation" &&
      (a.tp === undefined || (c.stage === "two" && a.tp2 === undefined))
    )
      errors.push(text("TP mangler.", "TP missing."));
    add(
      text("Geometri og størrelse", "Geometry and size"),
      !errors.length,
      errors.join(" ") ||
        text(
          "SL på tapssiden og TP på gevinstsiden. Dette bekrefter geometri, ikke strategi.",
          "SL is on the loss side and TP on the gain side. This verifies geometry, not strategy.",
        ),
    );
    if (c.stage !== "invalidation") {
      const risk = combinedPlanRisk(entries, c.specs);
      add(
        text("Samlet risiko", "Combined risk"),
        risk !== null && Number.isFinite(risk) && risk > 0 && risk <= 10,
        (risk !== null && Number.isFinite(risk) ? risk.toFixed(2) : "—") +
          " " +
          (c.specs.currency ?? "USD") +
          text(
            " av budsjett 10. Hver inngang telles én gang.",
            " of budget 10. Each entry is counted once.",
          ),
      );
    }
    if (c.stage === "two")
      add(
        text("To innganger og ulike mål", "Two entries and distinct targets"),
        a.entry !== a.entry2 && a.tp !== a.tp2,
        text(
          "Felles SL er ett prisnivå; begge innganger bidrar til risiko.",
          "Shared SL is one price level; both entries contribute risk.",
        ),
      );
  }
  if (c.stage === "compare")
    add(
      text("Planlagt R:R", "Planned R:R"),
      a.classification === "B",
      text(
        "B har 2R mot A sin 1R. Det fjernere målet kan være vanskeligere å nå; gevinstsannsynlighet er ikke målt.",
        "B has 2R versus A at 1R. The farther target may be harder to reach; win probability has not been measured.",
      ),
    );
  if (["wait", "reflect", "level"].includes(c.stage))
    add(
      text("Faglig begrunnelse", "Reasoning quality"),
      null,
      text(
        "Registrert for egen gjennomgang og AI-coach. Appen gir ingen automatisk fasit på fritekstens faglige kvalitet.",
        "Saved for reflection and the AI coach. The app does not automatically certify the reasoning quality of free text.",
      ),
    );
  return checks;
}
export function commitChallenge(
  c: Challenge,
  a: ChallengeAnswer,
  s: Session,
  nb = true,
) {
  if (c.endedAt)
    throw Error("Start a fresh challenge after returning to free practice.");
  if (c.answer)
    throw Error("This answer is already locked. Start the next attempt.");
  if (
    s.tick.t !== c.cutoff ||
    s.broker.seq !== c.seq ||
    s.dataset !== c.dataset
  )
    throw Error("Replay changed; start a fresh challenge.");
  if (a.reason.trim().length < 12)
    throw Error(
      "Explain your observation in a short sentence before revealing.",
    );
  c.answer = structuredClone(a);
  c.committedAt = s.tick.t;
  c.committedSeq = s.broker.seq;
  c.drawings = structuredClone(s.drawings);
  c.orders = structuredClone(s.broker.pending);
  c.strategy = structuredClone(s.notebook);
  c.checks = checkChallenge(c, a, nb);
}
