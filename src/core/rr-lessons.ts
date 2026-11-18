import { RR_SOURCE_TASKS, rrSourceUrl } from "./rr-source-course";
export const RR_COURSE_VERSION = "rr-study-20261113-v1";
export const RR_LESSON_IDS = [
  "context",
  "candles",
  "confirmation",
  "risk",
  "management",
  "review",
] as const;
export type RRLessonId = (typeof RR_LESSON_IDS)[number];
export type RRLesson = {
  id: RRLessonId;
  title: string;
  summary: string;
  steps: string[];
  exercise: string;
  boundary: string;
  sources: { title: string; url: string }[];
};
export const RR_LESSONS: RRLesson[] = [
  {
    id: "context",
    title: "Context before entry",
    summary:
      "Start with a larger range and a plausible objective. A local candle pattern needs a place in that story.",
    steps: [
      "Use H4 / H1 to mark a relevant larger high, low or internal area.",
      "Write where price might travel, and what would contradict that idea.",
      "Move to H1 / M15 to inspect the local range. Ambiguity is a valid reason to wait.",
    ],
    exercise:
      "Mark one objective and one invalidation before refining an entry.",
    boundary:
      "Jake demonstrates several range and zone choices. The recordings do not establish one universal anchor-selection rule.",
    sources: [
      {
        title: "CRT foundations · session 2, 7:08",
        url: "https://www.youtube.com/watch?v=fTmCa0tC1h4&t=428s",
      },
      {
        title: "Range-to-range narrative · session 11, 2:04",
        url: "https://www.youtube.com/watch?v=I79TFdSMu5Q&t=124s",
      },
    ],
  },
  {
    id: "candles",
    title: "Read C1, C2 and C3",
    summary:
      "C1 supplies a reference range. Read how C2 closes relative to it before forming a conditional idea for C3.",
    steps: [
      "A completed C2 close beyond a C1 extreme is the basic body-break / continuation example.",
      "A wick beyond an extreme with a close back inside is the basic sweep / rejection example.",
      "A sweep can fail. Keep larger context, two-sided sweeps and boundary closes visible instead of forcing a direction.",
    ],
    exercise:
      "Use the last two closed candles, classify C2, then save your C3 idea before advancing.",
    boundary:
      "These are conditional candle descriptions. The overlay classifies geometry; it does not identify a complete RR entry or predict C3.",
    sources: [
      {
        title: "Body break · session 10, 3:34",
        url: "https://www.youtube.com/watch?v=8-iZA5x-Vmg&t=214s",
      },
      {
        title: "Wick sweep · session 10, 5:32",
        url: "https://www.youtube.com/watch?v=8-iZA5x-Vmg&t=332s",
      },
      {
        title: "Failed manipulation · session 11, 5:45",
        url: "https://www.youtube.com/watch?v=I79TFdSMu5Q&t=345s",
      },
    ],
  },
  {
    id: "confirmation",
    title: "Wait for your confirmation",
    summary:
      "Separate a location you like from evidence that price is actually changing its local delivery.",
    steps: [
      "Mark the relevant local opposing area or level before the move.",
      "Write the price / completed-close behavior that would confirm or reject your working idea.",
      "Jake distinguishes local CISD, a larger structure shift and continuation BOS. His different entry models do not all share one trigger.",
    ],
    exercise:
      "Use a horizontal line for your chosen confirmation. Save exactly what you need to see, or choose Skip.",
    boundary:
      "The universal CISD threshold and all SMT comparison rules remain incomplete. No automatic CISD or SMT signal is inferred here.",
    sources: [
      {
        title: "CISD versus structure · session 8, 20:06",
        url: "https://www.youtube.com/watch?v=7ZA_PDnyPGs&t=1206s",
      },
      {
        title: "Why he waits before NOW · session 11, 40:18",
        url: "https://www.youtube.com/watch?v=I79TFdSMu5Q&t=2418s",
      },
    ],
  },
  {
    id: "risk",
    title: "Understand initial risk",
    summary:
      "R describes a result relative to the initial risk. A tighter stop changes position sizing; a larger lot does not improve the reward-to-risk geometry.",
    steps: [
      "Define the actual entry and invalidation before sizing. Include every layer of the idea.",
      "Use the simulator's contract size, lot grid, spread and fees. Leverage changes margin, not profit per price unit.",
      "Keep the initial risk denominator when protection moves or part of the position closes.",
    ],
    exercise:
      "Use the R example below, then compare a real draft's Cash risk and Risk / reward without placing it.",
    boundary:
      "The arithmetic example is before costs. Use the order ticket for this simulator's executable bid/ask and fee assumptions.",
    sources: [
      {
        title: "R and equal cash risk · session 5, 17:51",
        url: "https://www.youtube.com/watch?v=TUSHqSZycrM&t=1071s",
      },
      {
        title: "Sizing board · session 5, 36:18",
        url: "https://www.youtube.com/watch?v=TUSHqSZycrM&t=2178s",
      },
    ],
  },
  {
    id: "management",
    title: "Partials, BE and runners",
    summary:
      "Choose one management version before the trade. The R of a distant target is different from the weighted result of all the pieces.",
    steps: [
      "State the portion closing at TP1 and the plan for the remainder.",
      "Entry-price BE protects gross price risk; costs can still produce a net loss.",
      "For a sell, close below / hold above refers to closing lower fills and retaining higher fills from the matching setup.",
    ],
    exercise:
      "Change the TP1 portion and compare the full-target result with the runner returning to entry.",
    boundary:
      "The recordings describe TP1-only and several partial/BE alternatives. They do not establish one permanent percentage or BE trigger for all RR calls.",
    sources: [
      {
        title: "Flexible exits · session 11, 21:11",
        url: "https://www.youtube.com/watch?v=I79TFdSMu5Q&t=1271s",
      },
      {
        title: "Changed BE practice · session 11, 25:03",
        url: "https://www.youtube.com/watch?v=I79TFdSMu5Q&t=1503s",
      },
      {
        title: "Close below / hold above · session 11, 34:09",
        url: "https://www.youtube.com/watch?v=I79TFdSMu5Q&t=2049s",
      },
    ],
  },
  {
    id: "review",
    title: "Review the decision",
    summary:
      "Judge whether the decision followed the saved evidence and plan. A win can violate a plan; a loss can follow it.",
    steps: [
      "Save your objective, invalidation and confirmation before showing more price data.",
      "Keep Skip decisions, failed sweeps and missing confirmations in the record.",
      "After C3 closes, compare what happened with the original idea. Record what was already visible when you committed.",
    ],
    exercise:
      "Complete one Practice card, reveal C3 and save a short reflection. Reopen it from Review later.",
    boundary:
      "One candle is an observation, not a trade backtest or proof of an edge. This exercise does not score profit or submit orders.",
    sources: [
      {
        title: "Context changes the pattern · session 10, 7:34",
        url: "https://www.youtube.com/watch?v=8-iZA5x-Vmg&t=454s",
      },
      {
        title: "Failed manipulation · session 11, 5:45",
        url: "https://www.youtube.com/watch?v=I79TFdSMu5Q&t=345s",
      },
    ],
  },
];
export type RRProgress = {
  version: string;
  selected: RRLessonId;
  completed: RRLessonId[];
};
export const DEFAULT_RR_PROGRESS: RRProgress = {
  version: RR_COURSE_VERSION,
  selected: "context",
  completed: [],
};
export function lessonSource(lesson: unknown, index: unknown) {
  if (
    typeof lesson === "string" &&
    lesson.startsWith("rr-source:") &&
    typeof index === "number" &&
    Number.isInteger(index) &&
    index >= 0
  ) {
    const source = RR_SOURCE_TASKS.find((t) => t.id === lesson.slice(10))?.refs[
      index
    ];
    if (!source) throw Error("Unknown RR source.");
    return rrSourceUrl(source);
  }
  if (lesson === "fvg" && index === 0)
    return "https://www.youtube.com/watch?v=Bkt8B3kLATQ";
  if (lesson === "po3" && index === 0)
    return "https://www.youtube.com/watch?v=jWxR9OZDDR4&t=251s";
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0)
    throw Error("Unknown lesson source.");
  const source = RR_LESSONS.find((l) => l.id === lesson)?.sources[index];
  if (!source) throw Error("Unknown lesson source.");
  return source.url;
}

// One beginner path. Existing RR lesson IDs/progress/source links remain intact for old saves.
export const FOUNDATION_LESSONS = [
  {
    stage: "candles",
    guide: 1,
    title: ["Les prisene: kropp og veke", "Read prices: body and wick"],
    paragraphs: [
      [
        "En candle er én periode på charten. O (open) er første pris, H (high) er høyeste, L (low) er laveste og C (close) er siste pris. Kroppen går fra O til C; vekene viser resten av H–L. Fargen alene er ingen kjøpsregel.",
        "A candle is one chart period. O is the opening price, H the high, L the low and C the close. The body joins O to C; wicks show the rest of H–L. Colour alone is not a buy rule.",
      ],
      [
        "En pågående candle har bare foreløpig C, H og L. En ferdig 4H-periode slutter fire timer etter starten. RETRACE bruker 00, 04, 08, 12, 16 og 20 UTC; lokal sommertid endrer etiketten, ikke perioden. Manglende priser er ikke en bekreftelse.",
        "A forming candle has provisional C, H and L. A completed 4H period ends four hours after its start. RETRACE uses 00, 04, 08, 12, 16 and 20 UTC; local DST changes labels, not buckets. Missing prices are not confirmation.",
      ],
    ],
    criteria: [
      "Forklar kroppen og vekens high med egne ord; knytt svaret til den ferdige candlen.",
      "Forklar at perioden må være slutt før close er endelig.",
    ],
    criteriaEn: [
      "Explain the body and wick high in your own words using the completed candle.",
      "Explain that the period must end before its close is final.",
    ],
  },
  {
    stage: "pair",
    guide: 1,
    title: ["C1, C2 og den ukjente C3", "C1, C2 and the unknown C3"],
    paragraphs: [
      [
        "C1 er referansecandlen, C2 den neste og C3 den etter. Her bruker vi de to siste ferdige 4H-candlene. Sammenlign C2-close med C1-high og C1-low. En veke utenfor med close tilbake innenfor er ulik en ferdig close utenfor. To-sidige utslag kan være blandede.",
        "C1 is the reference candle, C2 follows it, then C3. Here we use the last two completed 4H candles. Compare C2 close with C1 high and low. A wick outside with a close back inside differs from a completed close outside. Two-sided sweeps can be mixed.",
      ],
      [
        "Dette beskriver observasjoner, ikke en full strategi eller en sikker C3-retning. Skriv en betinget idé og hva du må se videre. En senere vinner gjør ikke en dårlig begrunnelse riktig.",
        "These are observations, not a complete strategy or a certain C3 direction. Write a conditional idea and what you still need to see. A later win cannot repair poor reasoning.",
      ],
    ],
    criteria: [
      "Sammenlign C2-close med det konkrete C1-området i de låste dataene.",
      "Skill veke fra ferdig sluttbrudd uten å love C3-retning.",
    ],
    criteriaEn: [
      "Compare C2 close with the actual C1 range in the frozen evidence.",
      "Distinguish a wick from a completed close break without promising C3 direction.",
    ],
  },
  {
    stage: "frames",
    guide: 2,
    title: ["Fra 4H til 15m, 5m og 1m", "From 4H to 15m, 5m and 1m"],
    paragraphs: [
      [
        "4H gir oversikt. 15m, 5m og 1m viser rekkefølgen på mindre bevegelser inne i perioden. Fire timer er 240 minutter: 16 perioder på 15m, 48 på 5m eller 240 på 1m. Pauser og datagap kan gi færre faktiske candles. Alle visninger må stoppe ved samme replay-tid.",
        "4H provides context. 15m, 5m and 1m show the sequence of smaller moves within it. Four hours is 240 minutes: 16 periods of 15m, 48 of 5m or 240 of 1m. Closures and gaps can mean fewer actual candles. Every view must stop at the same replay time.",
      ],
      [
        "Side-candlen deler chartets prisskala og viser den pågående 4H-perioden. Videoens PO3-eksempel viser retur over 4H-open, lokal bekreftelse og lokal stopplassering (4:11–5:21); et tidligere 4H-high er mål (5:46–7:09). Dette er en egen variant, ikke fasit for C1/C2/C3 eller SL ved 4H-close.",
        "The side candle shares the chart price scale and shows the developing 4H period. The video's PO3 example returns above the 4H open, with local confirmation and a local stop (4:11–5:21); a prior 4H high is the objective (5:46–7:09). This is a separate variant, not a C1/C2/C3 answer key or a universal stop at the 4H close.",
      ],
    ],
    criteria: [
      "Forklar 240 delt på 15, ikke bare skriv et antall.",
      "Forklar hvordan lavere tidsramme viser detaljer i samme periode uten fremtidskunnskap.",
    ],
    criteriaEn: [
      "Explain 240 divided by 15, rather than only giving a count.",
      "Explain how the lower timeframe reveals detail in the same period without future knowledge.",
    ],
  },
  {
    stage: "level",
    guide: 4,
    title: [
      "Velg et nivå og mål med Fibonacci",
      "Choose a level and measure with Fibonacci",
    ],
    paragraphs: [
      [
        "Velg én synlig topp, bunn eller tydelig tegning. Skriv hvilken candle nivået kommer fra og hvorfor du vil følge det. Et tall innenfor chartet er ikke alene et viktig nivå.",
        "Choose a visible high, low or clear drawing. State which candle supplies the level and why you will watch it. A price within the chart is not automatically meaningful.",
      ],
      [
        "Fibonacci måler mellom to valgte ankere. Endrer du ankere, retning eller nivåverdier, endres nivåprisene. Navn, farger og presets er hjelp til visning, ikke en lønnsomhetsregel. Prøv å reversere ankrene og les prisene før du bruker nivået i en plan.",
        "Fibonacci measures between two selected anchors. Changing anchors, direction or level values changes the prices. Labels, colours and presets aid display, not profitability. Reverse the anchors and read the prices before using a level in a plan.",
      ],
    ],
    criteria: [
      "Knytt det valgte nivået til en bestemt synlig candle eller et lagret anker.",
      "Forklar betydningen og en konkret begrensning; ikke påstå at Fibonacci garanterer en reaksjon.",
    ],
    criteriaEn: [
      "Tie the chosen level to a specific visible candle or saved anchor.",
      "Explain its meaning and a concrete limit; do not claim Fibonacci guarantees a reaction.",
    ],
  },
  {
    stage: "wait",
    guide: 5,
    title: [
      "Velg inngang eller begrunnet venting",
      "Choose entry or reasoned waiting",
    ],
    paragraphs: [
      [
        "Skill observasjon fra tolkning: «C2 sluttet innenfor C1» er observerbart. «Prisen vil opp» er en idé. Skriv hvilken tidsramme, hvilket nivå og om candlen må være ferdig før du handler. En grønn candle alene er ikke en full bekreftelse.",
        "Separate observation from interpretation: ‘C2 closed inside C1’ is observable. ‘Price will rise’ is an idea. Specify the timeframe, level and whether a completed candle is required. A green candle alone is not complete confirmation.",
      ],
      [
        "Vent er et fullverdig svar når bekreftelsen mangler. AI-en vurderer teksten mot låste data og oppgitte regler. Den kan vise støtte, feil og mangler, men skal si uklart når grunnlaget mangler. Sikker tone gir ingen ekstra mestring.",
        "Waiting is a complete answer when confirmation is missing. AI reviews your text against frozen facts and stated rules. It can show support, errors and omissions, but must say unclear when evidence is missing. Confident tone earns no extra mastery.",
      ],
    ],
    criteria: [
      "Knytt beslutningen til en konkret observasjon i låst historikk.",
      "Beskriv en etterprøvbar bekreftelse (nivå, tidsramme og ferdigstatus) og skill ønsket signal fra noe som allerede har skjedd.",
    ],
    criteriaEn: [
      "Tie the decision to a specific observation in the frozen history.",
      "Give a testable confirmation (level, timeframe and completion) and separate a desired signal from an observed one.",
    ],
  },
  {
    stage: "invalidation",
    guide: 3,
    title: [
      "Entry og nivået som gjør ideen feil",
      "Entry and the level that invalidates the idea",
    ],
    paragraphs: [
      [
        "Entry er planlagt inngangspris. SL er stop loss, prisen der en tapende posisjon skal avsluttes i simuleringen. Ved kjøp ligger SL under entry; ved salg over. Velg ideens ugyldiggjøring først. En 4H-close er ikke automatisk riktig stopnivå.",
        "Entry is the planned entry price. SL is stop loss, where a losing position should close in the simulator. For buys SL is below entry; for sells above. Define invalidation first. A 4H close is not automatically a suitable stop.",
      ],
      [
        "Forklar hva som ville motsagt ideen på beslutningstidspunktet. Prisgap og kostnader kan gi større tap enn planlagt; gyldig geometri beviser ingen fordel.",
        "Explain what would contradict the idea at decision time. Gaps and costs can increase the planned loss; valid geometry does not prove an edge.",
      ],
    ],
    criteria: [
      "Knytt valgt retning og entry til en konkret observasjon.",
      "Forklar hvorfor akkurat SL-nivået motsier ideen; ikke bruk en oppfunnet universell stopregel.",
    ],
    criteriaEn: [
      "Tie direction and entry to a specific observation.",
      "Explain why this SL invalidates the idea; do not invent a universal stop rule.",
    ],
  },
  {
    stage: "risk",
    guide: 3,
    title: ["TP, størrelse og et budsjett", "TP, size and a budget"],
    paragraphs: [
      [
        "TP er take profit, et planlagt gevinstmål. For kjøp ligger det over entry, for salg under. Størrelsen bestemmer hvor mye prisbevegelsen betyr i penger. Simulatoren bruker instrumentets kontrakt, minste størrelse, trinn og kostnader. Mer gearing reduserer marginkravet, ikke tapet per prisbevegelse.",
        "TP is take profit, a planned profit objective. For buys it is above entry; for sells below. Size determines cash exposure to price movement. The simulator uses the instrument contract, minimum size, step and costs. More leverage reduces margin, not loss per price move.",
      ],
      [
        "I denne øvelsen er samlet beregnet risiko høyst 10 i kontovaluta inkludert innstilte kostnader. Dette er et øvingsbudsjett. Skriv både hvorfor SL passer ideen og hvorfor størrelsen passer budsjettet.",
        "This exercise permits at most 10 account-currency units of computed total risk including configured costs. This is a practice budget. Explain both why the stop fits the idea and why size fits the budget.",
      ],
    ],
    criteria: [
      "Forklar hvorfor valgt SL og TP passer ideen i de låste dataene.",
      "Forklar hvordan størrelse, stopavstand og kostnader påvirker budsjettet.",
    ],
    criteriaEn: [
      "Explain how SL and TP fit the idea in the frozen evidence.",
      "Explain how size, stop distance and costs affect the budget.",
    ],
  },
  {
    stage: "compare",
    guide: 3,
    title: [
      "Sammenlign risiko og mulig gevinst",
      "Compare risk and potential reward",
    ],
    paragraphs: [
      [
        "1R er opprinnelig risiko. Med samme entry, SL og størrelse har plan A et mål på 1R og plan B på 2R før kostnader. B har høyere planlagt R:R, men et fjernere mål kan nås sjeldnere. Vi har ingen målt gevinstsannsynlighet for disse planene.",
        "1R is initial risk. With equal entry, SL and size, plan A targets 1R and B 2R before costs. B has higher planned reward/risk, but a farther target may be reached less often. No win probability has been measured for these plans.",
      ],
    ],
    criteria: [
      "Forklar hvorfor B gir høyere planlagt R:R ved samme risiko.",
      "Forklar hvorfor dette alene ikke beviser høyere vinnersjanse eller et bedre oppsett.",
    ],
    criteriaEn: [
      "Explain why B gives higher planned reward/risk at equal risk.",
      "Explain why this alone proves neither higher win probability nor a better setup.",
    ],
  },
  {
    stage: "two",
    guide: 3,
    title: [
      "Et komplett oppsett med to innganger",
      "A complete setup with two entries",
    ],
    paragraphs: [
      [
        "Skriv to forskjellige entry-priser, ett felles SL og to forskjellige TP-priser. Størrelsen gjelder hver inngang. Begge innganger bidrar til samlet risiko selv om de deler stopnivå; budsjettet er fortsatt 10 inkludert kostnader.",
        "Write two distinct entries, one shared SL and two distinct TPs. Size applies to each entry. Both entries add to total risk even with a shared stop; the budget remains 10 including costs.",
      ],
      [
        "Knytt hver inngang og hvert mål til din idé, og si hvilken bekreftelse du trenger. Oppgaven lagrer planen; den sender ikke ordrene for deg. To teknisk gyldige innganger er ikke automatisk en god strategi.",
        "Tie each entry and target to your idea and state the confirmation you need. The exercise saves a plan; it does not submit the orders. Two technically valid entries are not automatically a sound strategy.",
      ],
    ],
    criteria: [
      "Begrunn hver inngang og hvert mål fra konkrete observasjoner, med en etterprøvbar bekreftelse.",
      "Forklar hvorfor felles SL fortsatt gir to risikobidrag innenfor samlet budsjett.",
    ],
    criteriaEn: [
      "Justify each entry and target with concrete observations and testable confirmation.",
      "Explain why a shared SL still gives two risk contributions within the total budget.",
    ],
  },
  {
    stage: "reflect",
    guide: 5,
    title: ["Se tilbake og prøv igjen", "Review and try again"],
    paragraphs: [
      [
        "Les et tidligere lagret svar og dets faktasjekk først. Beskriv én ting du konkret vil gjenta eller endre. Skill regeloppfyllelse, risiko, utførelse og resultat. Et tap kan følge en god plan; en vinner kan bryte den.",
        "Read an earlier saved answer and its factual checks first. Describe one concrete action to repeat or change. Separate rules, risk, execution and outcome. A loss can follow a sound plan; a winner can violate it.",
      ],
      [
        "Vurderingen bruker bare beslutningsgrunnlaget som låses nå. Hvis du vil sammenligne et tidligere forsøk, vis til det i teksten; uten et lagret tidligere beslutningsgrunnlag blir en påstand om utførelsen stående som uklar. Nytt forsøk bevarer historikken.",
        "Assessment uses only the decision evidence frozen now. Reference an earlier attempt in your text; without its saved decision evidence, a claim about execution remains unclear. Retrying preserves history.",
      ],
    ],
    criteria: [
      "Beskriv én konkret gjentakbar forbedring knyttet til det lagrede beslutningsgrunnlaget.",
      "Skill beslutningskvalitet fra gevinst/tap; oppgi hva som ikke kan kontrolleres.",
    ],
    criteriaEn: [
      "Describe one repeatable improvement tied to saved decision evidence.",
      "Separate decision quality from profit/loss and state what cannot be verified.",
    ],
  },
] as const;
