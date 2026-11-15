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
  if (lesson === "po3" && index === 0)
    return "https://www.youtube.com/watch?v=jWxR9OZDDR4&t=251s";
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0)
    throw Error("Unknown lesson source.");
  const source = RR_LESSONS.find((l) => l.id === lesson)?.sources[index];
  if (!source) throw Error("Unknown lesson source.");
  return source.url;
}
