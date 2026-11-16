import {
  challengeSnapshot,
  challengeFallback,
  challengeFeedbackSchema,
  parseChallengeFeedback,
  CHALLENGE_COACH_SYSTEM,
} from "../src/ai/challenge-feedback";
import {
  CHALLENGES,
  beginChallenge,
  commitChallenge,
  type ChallengeId,
} from "../src/core/challenges";
import {
  INSTRUMENTS,
  instrumentForDataset,
  type InstrumentId,
} from "../src/core/instruments";
import { DEFAULT_HTF } from "../src/core/htf";
import {
  coachEvidenceReply,
  coachRuleIssue,
  coachEvidenceIssue,
} from "../src/ai/coach-evidence";
import { parentPort, workerData, Worker } from "node:worker_threads";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Store, atomicWrite, sha } from "../src/data/store";
import { Replay } from "../src/core/replay";
import { dataQuality } from "../src/data/quality";
import { resolveLevelDraft } from "../src/core/order-draft";
import {
  place,
  close,
  editPosition,
  editPending,
  account,
  sizeForRisk,
  statistics,
  tradeStatistics,
} from "../src/core/broker";
import { ManagedLocalProvider } from "../src/ai/managed-provider";
import { LMStudioProvider } from "../src/ai/provider";
import {
  buildContext,
  COACH_PROFILE,
  validateCoachJSON,
  validateGrounding,
  promptSnapshot,
  groundedAnswer,
} from "../src/ai/context";
import {
  DEFAULT_AI,
  FRAMES,
  type AppState,
  type AIStatus,
  type AISettings,
  type Session,
  type Command,
  type Drawing,
  type TF,
} from "../src/types";
import { z } from "zod";
import { DEFAULT_DISCORD, discordSettings } from "../src/core/discord-presence";
import {
  currentChartHint,
  selectTradeReference,
  replyLanguage,
  savedHistoryAnswer,
} from "../src/ai/intent";
import { fitContext } from "../src/ai/budget";
import {
  sessionTrades,
  asksAboutTrade,
  wantsChartAnalysis,
  reviewDecision,
  tradeWithDecision,
  contradictsSavedStop,
  decisionFacts,
  reviewAnswerIssue,
  factualTradeReview,
  factualChartHint,
} from "../src/core/trade-evidence";
import {
  DEFAULT_APPEARANCE,
  migrateAppearance,
  type Appearance,
} from "../src/core/appearance";
import { calculateFormula } from "../src/core/formulas";
import {
  DEFAULT_RR_PROGRESS,
  RR_LESSON_IDS,
  RR_COURSE_VERSION,
  type RRProgress,
} from "../src/core/rr-lessons";
import {
  chooseRRRange,
  rrStudyView,
  emptyRRStudy,
  commitRRAttempt,
  RR_TIMEFRAMES,
  studyContextLayout,
} from "../src/core/rr-study";
import { TelegramFeed } from "./telegram-service";
import { rrPlanSchema, rrProgressSchema, rrStudySchema } from "./study-schema";
const telegramFeed = new TelegramFeed(
  workerData.project,
  workerData.root,
  (value) =>
    parentPort!.postMessage(
      value.type === "persist"
        ? { event: "telegram-save", value: value.value }
        : { event: "feed", value },
    ),
);
telegramFeed.configure(workerData.telegramConfig ?? null);
const store = new Store(workerData.root),
  replay = new Replay(store);
let settings = store.meta<AISettings>("aiSettings", DEFAULT_AI);
let discord = discordSettings(store.meta("discordSettings", DEFAULT_DISCORD));
let appearance = migrateAppearance(
  store.meta<Appearance>("appearance", DEFAULT_APPEARANCE),
);
const lessonId = z.enum(RR_LESSON_IDS);
const studyPlanSchema = rrPlanSchema;
const savedProgress = rrProgressSchema.safeParse(
  store.meta("rrProgress", DEFAULT_RR_PROGRESS),
);
let rrProgress: RRProgress = savedProgress.success
  ? {
      ...savedProgress.data,
      completed: [...new Set(savedProgress.data.completed)],
    }
  : { ...DEFAULT_RR_PROGRESS, completed: [] };
let ai: AIStatus = {
  state: "off",
  message: "AI is off. Replay and the journal remain available.",
  models: [],
  owned: false,
};
let playing = false,
  speed = 1,
  closing = false;
let errors: string[] = [],
  recovered = !store.meta("cleanExit", true),
  dataset = store.meta("activeDataset", "dukascopy");
let targetTime = 0,
  lastWall = performance.now(),
  lastSave = 0,
  lastPublish = 0;
let importer: Worker | null = null;
let importProgress: any = null;
let controller: AbortController | null = null,
  generating: Promise<void> | null = null,
  provider: LMStudioProvider | null = null,
  idle = Date.now();
let shut: Promise<void> | null = null;
store.db.exec(
  "CREATE TABLE IF NOT EXISTS images(id TEXT PRIMARY KEY, session TEXT, cutoff INTEGER, cursor INTEGER, png TEXT);",
);
store.db.exec(
  "CREATE TABLE IF NOT EXISTS decisions(session TEXT,id TEXT,cutoff INTEGER,payload TEXT,PRIMARY KEY(session,id));",
);
store.set("cleanExit", false);
function recoverChallenge(s: NonNullable<Replay["session"]>) {
  if (
    s.learning?.active.answer &&
    s.learning.active.feedback?.status === "generating"
  ) {
    s.learning.active.feedback = challengeFallback(
      s.learning.active,
      s.learning.language === "nb",
      s.learning.language === "nb"
        ? "Forrige AI-vurdering ble avbrutt. Svaret og faktasjekken er bevart; prøv AI igjen når du vil."
        : "The previous AI review was interrupted. Your answer and checks are preserved; retry when ready.",
    );
  }
}
const previous = store.meta<string>("lastSession", "");
if (previous) {
  try {
    const s = store.load(previous);
    if (s) {
      for (const m of s.chat)
        if (m.status === "generating") m.status = "interrupted";
      recoverChallenge(s);
      replay.setSession(s);
      s.status = recovered
        ? "Recovered the last transaction after an unexpected shutdown. Replay is paused."
        : "Restored your session, paused.";
      store.save(s);
    }
  } catch (e) {
    errors.push(String(e));
  }
}
const error = (e: unknown) => {
  const message = String(e);
  errors.push(message);
  errors = errors.slice(-12);
  if (replay.session) replay.session.status = message;
  parentPort!.postMessage({ event: "error", value: message });
};
function coverage() {
  const rows = store.chunks(dataset),
    ready = rows.filter((c) => c.status === "ready");
  return {
    hours: ready.length,
    tickCount: ready.reduce((s, c) => s + c.count, 0),
    bytes: ready.reduce((s, c) => s + c.bytes, 0),
    first: ready[0]?.first ?? null,
    last: ready.at(-1)?.last ?? null,
    gaps: ready.length
      ? (() => {
          const known = new Map(rows.map((c) => [c.hour, c.status]));
          let n = 0;
          for (let h = ready[0].hour; h <= ready.at(-1)!.hour; h += 3600000)
            if (!["ready", "closure"].includes(known.get(h) ?? "")) n++;
          return n;
        })()
      : 0,
    expectedClosures: rows.filter((c) => c.status === "closure").length,
    intrahourGaps: rows.reduce(
      (n, c) =>
        n + (JSON.parse(c.provenance || "{}").unexpectedGaps?.length ?? 0),
      0,
    ),
    marketDirectory: store.marketRoot,
    source: dataset.startsWith("dukascopy")
      ? "Dukascopy " +
        INSTRUMENTS[instrumentForDataset(dataset)].symbol +
        " historical bid/ask ticks"
      : "CSV XAU/USD bid/ask ticks · standard NY market breaks are assumed",
    range: dataset.startsWith("dukascopy")
      ? store.meta(
          "importRange:" + dataset,
          dataset === "dukascopy"
            ? store.meta("importRange", undefined)
            : undefined,
        )
      : undefined,
    importer:
      importProgress ??
      store.meta("importProgress", {
        running: false,
        done: 0,
        total: 0,
        bytes: 0,
        error: "",
        current: "",
        paused: false,
      }),
  };
}
function state(): AppState {
  const s = replay.session;
  const bars = s ? replay.bars(s.layout.timeframe) : [];
  const secondBars = s ? replay.bars(s.layout.second) : [];
  return {
    discord,
    rrProgress,
    rrView: s?.study?.range
      ? rrStudyView(
          s.study.range,
          s.study.range.timeframe === s.layout.timeframe
            ? bars
            : s.study.range.timeframe === s.layout.second
              ? secondBars
              : replay.bars(s.study.range.timeframe),
          s.tick.t,
          s.broker.seq,
        )
      : { range: null, c3: null, c3Closed: false, coverage: "waiting" },
    appearance,
    session: s,
    sessions: store.list() as any,
    bars,
    secondBars,
    htfBars: s ? replay.bars(s.layout.htf?.timeframe ?? "4H") : [],
    levels: replay.levels(),
    quote: s?.tick ?? null,
    coverage: coverage(),
    ai,
    settings,
    recovered,
    playing,
    speed,
    diagnostics: {
      storage: store.root,
      versions: process.versions as Record<string, string>,
      errors,
    },
  };
}
function publish() {
  parentPort!.postMessage({ event: "state", value: state() });
  lastPublish = Date.now();
}
function save() {
  if (replay.session) store.save(replay.session);
  lastSave = Date.now();
}
function getProvider() {
  if (!provider)
    provider = new (
      settings.provider === "managed" ? ManagedLocalProvider : LMStudioProvider
    )(
      settings,
      settings.provider === "managed"
        ? path.join(workerData.root, "local-ai")
        : workerData.project,
      (p) => {
        ai = { ...ai, ...p };
        parentPort!.postMessage({ event: "ai", value: ai });
      },
      (value) => {
        parentPort!.postMessage({ event: "ownership", value });
        atomicWrite(
          path.join(store.root, "runtime-ownership.json"),
          JSON.stringify({
            ...value,
            parentPid: workerData.parentPid,
            updated: Date.now(),
          }),
        );
      },
    );
  return provider;
}
async function cancel() {
  controller?.abort();
  if (generating) await generating;
  controller = null;
}
async function off() {
  await cancel();
  if (provider) await provider.unload();
  else ai = { ...ai, state: "off", message: "AI off." };
  publish();
}
function screenshot(s: Session, data: unknown, cursor: unknown) {
  if (!data) return undefined;
  if (cursor !== s.broker.seq)
    throw Error("The chart image cursor is stale. Pause and try again.");
  if (
    typeof data !== "string" ||
    !data.startsWith("data:image/png;base64,") ||
    data.length > 4000000
  )
    throw Error("Invalid chart image.");
  const id = randomUUID();
  store.db
    .prepare("INSERT INTO images VALUES(?,?,?,?,?)")
    .run(id, s.id, s.tick.t, s.broker.seq, data);
  return id;
}
function startImport(config: any) {
  if (importer) throw Error("An import is already running.");
  const existing = store.meta<any>("importLease", null);
  if (existing?.pid) {
    try {
      process.kill(existing.pid, 0);
      if (existing.pid !== process.pid)
        throw Error(
          "A command-line import is already running. Progress appears automatically.",
        );
    } catch (e) {
      if (/already running|already|allerede/.test(String(e))) throw e;
    }
  }
  if (config.starter)
    importProgress = {
      running: true,
      done: 0,
      total: 0,
      bytes: 0,
      error: "",
      current: "Finding a completed real-data period…",
      paused: false,
    };
  importer = new Worker(path.join(__dirname, "import-worker.cjs"), {
    workerData: { root: store.root, ...config },
  });
  importer.on("message", (m) => {
    if (m.type === "progress") importProgress = m.value;
    else if (m.type === "done") {
      if (
        m.value?.dataset &&
        (!config.starter || dataset === m.value.dataset)
      ) {
        dataset = m.value.dataset;
        store.set("activeDataset", dataset);
      }
      importProgress = null;
      if (
        config.starter &&
        m.value?.dataset === dataset &&
        !replay.session &&
        replay.eligible(dataset).length
      ) {
        replay.newSession(dataset);
        store.set("starterPending", false);
      }
    } else if (m.type === "error") {
      error(m.error);
      importProgress = {
        ...(importProgress ?? {}),
        running: false,
        error: m.error,
      };
    }
    publish();
  });
  importer.on("error", error);
  importer.on("exit", () => {
    importer = null;
    publish();
  });
}
async function stopImport() {
  if (!importer) return;
  const child = importer;
  child.postMessage({ type: "stop" });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          Error(
            "The import has not confirmed its checkpoint. Try exiting again.",
          ),
        ),
      45000,
    );
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
const number = z.number().finite();
const orderSchema = z.object({
  side: z.enum(["buy", "sell"]),
  kind: z.enum(["market", "limit", "stop"]),
  automaticLevel: z.boolean().optional(),
  setupId: z.string().max(100).optional(),
  planId: z.string().max(100).optional(),
  lots: number.positive().max(100),
  price: number.positive().optional(),
  sl: number.positive().optional(),
  tp: number.positive().optional(),
  thesis: z.string().max(12000),
  tags: z.array(z.string().max(80)).max(30),
  strategy: z.string().max(200),
  screenshot: z.string().optional(),
});
async function dispatch(c: Command): Promise<any> {
  if (!c || typeof c.type !== "string") throw Error("Invalid command.");
  if (
    closing &&
    ![
      "flush",
      "state",
      "shutdown",
      "freeze",
      "ai.cancel",
      "study.draft",
    ].includes(c.type)
  )
    throw Error("The app is closing. New changes are blocked.");
  const s = replay.session;
  switch (c.type) {
    case "state":
      return state();
    case "feed.configure":
      telegramFeed.configure(c.value);
      return;
    case "feed.read":
      return telegramFeed.read(
        z.string().max(100).parse(c.group),
        c.before ? z.number().int().nonnegative().parse(c.before) : 0,
      );
    case "feed.start":
      telegramFeed.start();
      return;
    case "feed.seen":
      telegramFeed.seen(z.string().max(100).parse(c.group));
      return;
    case "feed.link":
      telegramFeed.link();
      return;
    case "feed.link.cancel":
      telegramFeed.cancelLink();
      return;
    case "feed.password":
      telegramFeed.password(z.string().max(500).parse(c.password));
      return;
    case "feed.cancel":
      telegramFeed.cancel();
      return;
    case "appearance":
      appearance = z
        .object({
          preset: z.enum([
            "accurate",
            "cyber",
            "midnight",
            "phantom",
            "lavender",
            "claude",
          ]),
          panelOpacity: z.number().min(20).max(100),
          zoneOpacity: z.number().min(0).max(70),
          gridOpacity: z.number().min(0).max(100),
          labelOpacity: z.number().min(30).max(100),
          minimal: z.boolean(),
          graphOrders: z.boolean(),
          orderColors: z
            .object({
              buy: z.string().regex(/^#[0-9a-fA-F]{6}$/),
              sell: z.string().regex(/^#[0-9a-fA-F]{6}$/),
              sl: z.string().regex(/^#[0-9a-fA-F]{6}$/),
              tp: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            })
            .optional(),
          magnet: z.enum(["off", "weak", "strong"]).default("weak"),
        })
        .parse(c.value);
      store.set("appearance", appearance);
      publish();
      return;
    case "sessions.eligible":
      return replay
        .eligible(dataset)
        .map((c) => ({ hour: c.hour, first: c.first, last: c.last }));
    case "sessions.new":
      await cancel();
      playing = false;
      if (s) save();
      replay.newSession(
        dataset,
        c.timestamp === undefined ? undefined : number.parse(c.timestamp),
      );
      if (c.challenge) {
        const stage = z
          .enum(CHALLENGES.map((x) => x[0]) as [ChallengeId, ...ChallengeId[]])
          .parse(c.challenge);
        const created = replay.session!;
        created.learning = {
          active: beginChallenge(
            created,
            replay.bars(created.layout.timeframe),
            replay.bars("4H"),
            stage,
          ),
          history: [],
          language: "nb",
        };
        save();
      }
      publish();
      return;
    case "sessions.continue":
      await cancel();
      playing = false;
      if (s) save();
      {
        const next = store.load(z.string().parse(c.id));
        if (!next) throw Error("Session not found.");
        recoverChallenge(next);
        replay.setSession(next);
        dataset = next.dataset;
        store.set("activeDataset", dataset);
        store.set("lastSession", next.id);
        publish();
      }
      return;
    case "sessions.rename":
      if (!s) throw Error("Open a session first.");
      s.name = z.string().min(1).max(120).parse(c.name);
      save();
      publish();
      return;
    case "sessions.fork":
      await cancel();
      playing = false;
      if (!s) throw Error("Open a session first.");
      save();
      replay.newSession(s.dataset, number.parse(c.timestamp));
      replay.session!.mode = "review";
      replay.session!.name = "Review · " + s.name;
      save();
      publish();
      return;
    case "sessions.export":
      if (!s) throw Error("Open a session first.");
      save();
      {
        const images = store.db
          .prepare("SELECT * FROM images WHERE session=?")
          .all(s.id);
        const payload = {
          schema: "xauusd-replay-backup-v1",
          session: s,
          images,
          decisions: store.db
            .prepare("SELECT * FROM decisions WHERE session=?")
            .all(s.id),
          settings: { ...settings, enabled: false },
          rrProgress,
        };
        const json = JSON.stringify(payload);
        return { payload, sha256: sha(json) };
      }
    case "sessions.import": {
      const data = c.backup as any;
      if (
        data?.payload?.schema !== "xauusd-replay-backup-v1" ||
        sha(JSON.stringify(data.payload)) !== data.sha256
      )
        throw Error("Invalid backup or integrity hash.");
      const input = data.payload.session;
      if (
        !input?.id ||
        !input.broker ||
        !input.cursor ||
        !Array.isArray(input.drawings) ||
        !Array.isArray(input.chat) ||
        !input.layout ||
        !input.notebook
      )
        throw Error("The backup is missing session data.");
      if (input.study) rrStudySchema.parse(input.study);
      const importedProgress = data.payload.rrProgress
        ? rrProgressSchema.parse(data.payload.rrProgress)
        : null;
      await cancel();
      playing = false;
      if (s) save();
      const imported = structuredClone(input) as Session;
      imported.id = randomUUID();
      imported.name += " (importert)";
      const imageMap = new Map<string, string>();
      for (const decision of data.payload.decisions ?? [])
        store.db
          .prepare("INSERT INTO decisions VALUES(?,?,?,?)")
          .run(
            imported.id,
            String(decision.id),
            Number(decision.cutoff),
            String(decision.payload),
          );
      for (const image of data.payload.images ?? []) {
        if (typeof image.png !== "string" || image.png.length > 4000000)
          throw Error("Invalid image in backup.");
        const id = randomUUID();
        imageMap.set(image.id, id);
        store.db
          .prepare("INSERT INTO images VALUES(?,?,?,?,?)")
          .run(id, imported.id, image.cutoff, image.cursor, image.png);
      }
      for (const p of [
        ...imported.broker.positions,
        ...imported.broker.pending,
        ...imported.broker.fills,
      ])
        if (p.screenshot) p.screenshot = imageMap.get(p.screenshot);
      recoverChallenge(imported);
      replay.setSession(imported);
      if (importedProgress) {
        rrProgress = {
          version: RR_COURSE_VERSION,
          selected: importedProgress.selected,
          completed: [
            ...new Set([
              ...rrProgress.completed,
              ...importedProgress.completed,
            ]),
          ],
        };
        store.set("rrProgress", rrProgress);
      }
      save();
      publish();
      return;
    }
    case "challenge.end": {
      await cancel();
      if (s?.learning) {
        s.learning.active.endedAt = Date.now();
        save();
        publish();
      }
      return;
    }
    case "challenge.start": {
      if (!s) throw Error("Åpne en økt først.");
      const stage = z
        .enum(CHALLENGES.map((x) => x[0]) as [ChallengeId, ...ChallengeId[]])
        .parse(c.stage);
      playing = false;
      if (s.learning?.active.feedback?.status === "generating")
        throw Error("Vent til coachen er ferdig, eller stopp AI-svaret først.");
      const history = s.learning
        ? [...s.learning.history, structuredClone(s.learning.active)]
        : [];
      s.learning = {
        active: beginChallenge(
          s,
          replay.bars(s.layout.timeframe),
          replay.bars("4H"),
          stage,
        ),
        history,
        language: s.learning?.language ?? "nb",
      };
      save();
      publish();
      return;
    }
    case "challenge.feedback": {
      if (!s?.learning?.active.answer || s.learning.active.id !== c.id)
        throw Error("Lås svaret på oppgaven først.");
      if (generating)
        throw Error("Coachen jobber allerede. Vent eller stopp svaret.");
      const attempt = s.learning.active,
        nb = s.learning.language === "nb",
        evidence = challengeSnapshot(attempt, nb);
      const fallback = challengeFallback(attempt, nb);
      if (!settings.enabled || settings.profile === "gaming") {
        attempt.feedback = {
          ...fallback,
          note: nb
            ? "Slå på AI for en vurdering av begrunnelsen."
            : "Enable AI for reasoning feedback.",
        };
        save();
        publish();
        return;
      }
      playing = false;
      attempt.feedback = { ...fallback, status: "generating", source: "model" };
      controller = new AbortController();
      const signal = controller.signal,
        started = performance.now();
      ai = {
        ...ai,
        state: "generating",
        message: "Vurderer det låste oppgavesvaret.",
      };
      save();
      publish();
      generating = (async () => {
        await Promise.resolve();
        let feedback = fallback;
        try {
          const p = getProvider();
          if (p.instance && p.settings.context < 8192) await p.unload();
          p.settings = {
            ...settings,
            structured: false,
            maxTokens: 1400,
            context: Math.max(8192, settings.context),
          };
          if (!p.instance) await p.load();
          const messages = [
            { role: "system", content: CHALLENGE_COACH_SYSTEM },
            { role: "user", content: JSON.stringify(evidence) },
          ];
          let result = await p.chat(
            messages,
            () => {},
            signal,
            challengeFeedbackSchema(attempt),
          );
          try {
            feedback = parseChallengeFeedback(result, attempt, nb);
          } catch (error) {
            result = await p.chat(
              [
                ...messages,
                { role: "assistant", content: result },
                {
                  role: "user",
                  content:
                    "Correct the response using only the frozen evidence. Return the required JSON. Validation problem: " +
                    String(error),
                },
              ],
              () => {},
              signal,
              challengeFeedbackSchema(attempt),
            );
            feedback = parseChallengeFeedback(result, attempt, nb);
          }
          ai = {
            ...ai,
            state: "ready",
            message: "Veiledningen er lagret.",
            latency: performance.now() - started,
          };
        } catch (error) {
          store.set("challengeLastError", {
            at: Date.now(),
            message: String(error).slice(0, 600),
          });
          feedback = {
            ...fallback,
            note: signal.aborted
              ? nb
                ? "AI-vurderingen ble stoppet. Faktasjekken er bevart."
                : "AI review stopped. Factual checks are preserved."
              : nb
                ? "AI-svaret kunne ikke bekreftes. Den konkrete faktasjekken er vist; du kan prøve AI igjen."
                : "The AI draft could not be verified. Factual feedback is shown; you can retry AI.",
          };
          ai = { ...ai, state: "ready", message: feedback.note ?? "" };
        } finally {
          const saved = [
            ...(s.learning?.history ?? []),
            ...(s.learning ? [s.learning.active] : []),
          ].find((x) => x.id === attempt.id);
          if (saved) saved.feedback = feedback;
          store.save(s);
          idle = Date.now();
          generating = null;
          controller = null;
          publish();
        }
      })();
      return;
    }
    case "challenge.language":
      if (!s?.learning) throw Error("No challenge.");
      s.learning.language = z.enum(["nb", "en"]).parse(c.value);
      save();
      publish();
      return;
    case "challenge.commit": {
      if (!s?.learning || s.learning.active.id !== c.id)
        throw Error("Challenge changed.");
      playing = false;
      const value = z
        .object({
          reason: z.string().min(12).max(2000),
          value: number.optional(),
          classification: z.string().max(30).optional(),
          decision: z.enum(["buy", "sell", "wait"]).optional(),
          confirmation: z.string().max(500).optional(),
          entry: number.optional(),
          entry2: number.optional(),
          sl: number.optional(),
          tp: number.optional(),
          tp2: number.optional(),
          lots: number.optional(),
        })
        .strict()
        .parse(c.value);
      commitChallenge(
        s.learning.active,
        value,
        s,
        s.learning.language === "nb",
      );
      s.learning.active.feedback = challengeFallback(
        s.learning.active,
        s.learning.language === "nb",
      );
      save();
      publish();
      return;
    }
    case "challenge.reveal": {
      if (
        !s?.learning ||
        s.learning.active.id !== c.id ||
        !s.learning.active.answer
      )
        throw Error("Lock an answer before revealing.");
      const attempt = s.learning.active;
      if (attempt.revealedAt) throw Error("Already revealed.");
      playing = false;
      // The committed answer has already been flushed by Store.save before any price advances.
      try {
        replay.nextCandle(attempt.timeframe);
      } finally {
        attempt.revealedAt = s.tick.t;
        attempt.outcome = {
          from: attempt.cutoff,
          to: s.tick.t,
          status: s.status,
          balance: s.broker.balance,
        };
        save();
        publish();
      }
      return;
    }
    case "challenge.next": {
      if (!s?.learning?.active.revealedAt)
        throw Error("Reveal the saved attempt first.");
      const index = CHALLENGES.findIndex(
          (x) => x[0] === s.learning!.active.stage,
        ),
        next = CHALLENGES[(index + 1) % CHALLENGES.length][0];
      s.learning.history.push(structuredClone(s.learning.active));
      s.learning.active = beginChallenge(
        s,
        replay.bars(s.layout.timeframe),
        replay.bars("4H"),
        next,
      );
      save();
      publish();
      return;
    }
    case "study.progress": {
      const value = z
        .object({
          selected: lessonId,
          completed: z.array(lessonId).max(RR_LESSON_IDS.length),
        })
        .parse(c.value);
      rrProgress = {
        version: RR_COURSE_VERSION,
        selected: value.selected,
        completed: [...new Set(value.completed)],
      };
      store.set("rrProgress", rrProgress);
      publish();
      return;
    }
    case "study.context": {
      if (!s) throw Error("Select a session first.");
      playing = false;
      const preset = z.enum(["context", "entry"]).parse(c.value);
      s.layout = { ...s.layout, ...studyContextLayout(preset) };
      delete s.layout.range;
      delete s.layout.secondRange;
      save();
      publish();
      return;
    }
    case "study.range": {
      if (!s) throw Error("Select a session first.");
      playing = false;
      if (c.cursor !== s.broker.seq)
        throw Error("The replay cursor changed. Choose the range again.");
      const tf = z.enum(RR_TIMEFRAMES).parse(c.timeframe);
      const c1Time =
        c.c1Time === undefined
          ? undefined
          : z.number().finite().parse(c.c1Time);
      const range = chooseRRRange(
        replay.bars(tf),
        s.tick.t,
        s.broker.seq,
        tf,
        randomUUID(),
        c1Time,
      );
      s.study ??= emptyRRStudy();
      s.study.range = range;
      s.study.overlay = true;
      s.study.activeId = undefined;
      s.study.draft = {
        decision: "skip",
        objective: "",
        invalidation: "",
        confirmation: "",
      };
      if (s.layout.timeframe !== tf) {
        s.layout.timeframe = tf;
        delete s.layout.range;
      }
      save();
      publish();
      return;
    }
    case "study.overlay": {
      if (!s) throw Error("Select a session first.");
      s.study ??= emptyRRStudy();
      s.study.overlay = z.boolean().parse(c.value);
      save();
      publish();
      return;
    }
    case "study.draft": {
      if (!s?.study?.range) throw Error("Choose a candle range first.");
      // A late autosave must never rewrite a committed plan or a different range.
      if (s.study.activeId || c.rangeId !== s.study.range.id) return;
      s.study.draft = studyPlanSchema.parse(c.value);
      save();
      publish();
      return;
    }
    case "study.commit": {
      if (!s?.study?.range) throw Error("Choose a candle range first.");
      playing = false;
      if (c.cursor !== s.broker.seq || c.rangeId !== s.study.range.id)
        throw Error(
          "The replay cursor or range changed. Review the plan and save again.",
        );
      if (s.study.activeId)
        throw Error(
          "This plan is already locked. Choose a new range for another attempt.",
        );
      if (s.study.attempts.length >= 1000)
        throw Error(
          "This session has 1,000 saved exercises. Export it and continue learning in another practice session.",
        );
      const plan = studyPlanSchema.parse(c.value);
      const attempt = commitRRAttempt(
        s.study.range,
        plan,
        lessonId.parse(c.lesson),
        replay.bars(s.study.range.timeframe),
        s.tick.t,
        s.broker.seq,
        randomUUID(),
      );
      s.study.attempts.push(attempt);
      s.study.activeId = attempt.id;
      s.study.draft = { ...plan };
      save();
      publish();
      return attempt.id;
    }
    case "study.reveal": {
      if (
        s?.learning &&
        !s.learning.active.endedAt &&
        !s.learning.active.answer
      )
        throw Error("Lock your challenge answer before revealing.");
      if (!s?.study?.range || !s.study.activeId)
        throw Error("Save your plan before revealing C3.");
      playing = false;
      if (c.cursor !== s.broker.seq)
        throw Error(
          "The replay cursor changed. Check the chart before continuing.",
        );
      const attempt = s.study.attempts.find((a) => a.id === s.study!.activeId);
      if (!attempt) throw Error("This saved exercise is unavailable.");
      const view = rrStudyView(
        attempt.range,
        replay.bars(attempt.range.timeframe),
        s.tick.t,
        s.broker.seq,
      );
      if (c.id !== attempt.id)
        throw Error(
          "The selected exercise changed. Review it before continuing.",
        );
      if (attempt.review || view.c3Closed) {
        publish();
        return;
      }
      if (
        s.tick.t >=
        (attempt.range.c2.time + 2 * FRAMES[attempt.range.timeframe]) * 1000
      )
        throw Error(
          "Complete C3 data is missing. Resolve the historical gap before reviewing this exercise.",
        );
      try {
        replay.nextCandle(attempt.range.timeframe);
      } finally {
        save();
        publish();
      }
      return;
    }
    case "study.review": {
      if (!s?.study?.activeId) throw Error("Choose a saved exercise first.");
      const attempt = s.study.attempts.find((a) => a.id === s.study!.activeId);
      if (!attempt) throw Error("This saved exercise is unavailable.");
      if (c.id !== attempt.id)
        throw Error(
          "The selected exercise changed. Save the matching reflection again.",
        );
      const reflection = z
        .string()
        .trim()
        .min(1, "Write one thing you learned.")
        .max(6000)
        .parse(c.reflection);
      if (attempt.review) {
        attempt.review.reflection = reflection;
        attempt.review.savedAt = s.tick.t;
        attempt.review.savedSeq = s.broker.seq;
      } else {
        const view = rrStudyView(
          attempt.range,
          replay.bars(attempt.range.timeframe),
          s.tick.t,
          s.broker.seq,
        );
        if (!view.c3 || !view.c3Closed)
          throw Error(
            "C3 is not fully available yet. Reveal it or resolve the data gap first.",
          );
        attempt.review = {
          c3: { ...view.c3 },
          savedAt: s.tick.t,
          savedSeq: s.broker.seq,
          reflection,
        };
      }
      save();
      publish();
      return;
    }
    case "study.attempt": {
      if (!s?.study) throw Error("This session has no saved study exercises.");
      const attempt = s.study.attempts.find((a) => a.id === c.id);
      if (!attempt) throw Error("Unknown study exercise.");
      if (attempt.committedAt > s.tick.t || attempt.committedSeq > s.broker.seq)
        throw Error("This exercise belongs to a later replay point.");
      playing = false;
      s.study.activeId = attempt.id;
      s.study.range = structuredClone(attempt.range);
      s.study.overlay = true;
      s.study.draft = { ...attempt.plan };
      save();
      publish();
      return;
    }
    case "play":
      if (c.value) await cancel();
      if (
        c.value &&
        s?.learning &&
        !s.learning.active.endedAt &&
        !s.learning.active.answer
      )
        throw Error("Lås svaret i Utfordring før du viser senere priser.");
      if (!s) throw Error("Select a session first.");
      playing = Boolean(c.value);
      lastWall = performance.now();
      targetTime = s.tick.t;
      publish();
      return;
    case "speed":
      speed = z
        .union([
          z.literal(1),
          z.literal(5),
          z.literal(10),
          z.literal(30),
          z.literal(100),
        ])
        .parse(c.value);
      return;
    case "step":
      await cancel();
      if (
        s?.learning &&
        !s.learning.active.endedAt &&
        !s.learning.active.answer
      )
        throw Error("Lås svaret i Utfordring før du viser senere priser.");
      if (!s) throw Error("Select a session first.");
      playing = false;
      try {
        c.kind === "tick"
          ? replay.advanceOne()
          : replay.nextCandle(s.layout.timeframe);
      } finally {
        save();
        publish();
      }
      return;
    case "order":
      if (!s) throw Error("Select a session first.");
      playing = false;
      {
        const before = structuredClone(s);
        try {
          const o = orderSchema.parse(c.order);
          if (o.automaticLevel) {
            const level = resolveLevelDraft(
              { ...o, entry: o.price! },
              s.tick.bid,
            );
            o.side = level.side;
            o.kind = "limit";
            o.sl = level.sl;
            o.tp = level.tp;
          }
          o.screenshot = screenshot(s, c.screenshot, c.cursor);
          const orderId = place(s.broker, s.tick, o);
          store.db.prepare("INSERT INTO decisions VALUES(?,?,?,?)").run(
            s.id,
            orderId,
            s.tick.t,
            JSON.stringify(
              buildContext(
                s,
                replay.bars(s.layout.timeframe),
                replay.bars(s.layout.second),
                {
                  side: o.side,
                  kind: o.kind,
                  entry:
                    o.price ?? (o.side === "buy" ? s.tick.ask : s.tick.bid),
                  sl: o.sl,
                  tp: o.tp,
                  lots: o.lots,
                },
              ),
            ),
          );
          save();
        } catch (e) {
          replay.setSession(before);
          throw e;
        }
        publish();
      }
      return;
    case "position.close":
      if (!s) throw Error("Select a session first.");
      close(
        s.broker,
        s.tick,
        z.string().parse(c.id),
        c.lots === undefined ? undefined : number.positive().parse(c.lots),
      );
      save();
      publish();
      return;
    case "position.edit":
      if (!s) throw Error("Select a session first.");
      editPosition(
        s.broker,
        s.tick,
        z.string().parse(c.id),
        c.sl === undefined ? undefined : number.positive().parse(c.sl),
        c.tp === undefined ? undefined : number.positive().parse(c.tp),
      );
      save();
      publish();
      return;
    case "pending.cancel":
      if (!s) throw Error("Select a session first.");
      s.broker.pending = s.broker.pending.filter(
        (p) => p.id !== z.string().parse(c.id),
      );
      save();
      publish();
      return;
    case "pending.edit": {
      if (!s) throw Error("Select a session first.");
      playing = false;
      const before = structuredClone(s),
        id = z.string().parse(c.id);
      try {
        store.transaction(() => {
          editPending(
            s!.broker,
            s!.tick,
            id,
            z
              .object({
                price: number.positive().optional(),
                sl: number.positive().optional(),
                tp: number.positive().optional(),
                lots: number.positive().optional(),
              })
              .strict()
              .parse(c.changes),
          );
          const pending = s!.broker.pending.find((p) => p.id === id)!;
          const previous = store.db
            .prepare("SELECT * FROM decisions WHERE session=? AND id=?")
            .get(s!.id, id);
          if (previous)
            store.db
              .prepare("INSERT INTO decisions VALUES(?,?,?,?)")
              .run(
                s!.id,
                id + ":revision:" + randomUUID(),
                previous.cutoff,
                previous.payload,
              );
          pending.screenshot = undefined;
          const context = buildContext(
            s!,
            replay.bars(s!.layout.timeframe),
            replay.bars(s!.layout.second),
          );
          context.proposal = {
            side: pending.side,
            kind: pending.kind,
            entry: pending.price,
            sl: pending.sl,
            tp: pending.tp,
            lots: pending.lots,
          };
          context.higherTimeframe = {
            timeframe: "4H",
            cutoff: s!.tick.t,
            candles: replay.bars("4H").slice(-12),
          };
          store.db
            .prepare("INSERT OR REPLACE INTO decisions VALUES(?,?,?,?)")
            .run(s!.id, id, s!.tick.t, JSON.stringify(context));
          save();
        });
      } catch (e) {
        replay.setSession(before);
        throw e;
      }
      publish();
      return;
    }
    case "pending.snapshot": {
      if (!s) return;
      const pending = s.broker.pending.find((p) => p.id === c.id);
      if (
        !pending ||
        c.revision !== pending.revisions?.length ||
        c.cursor !== s.broker.seq
      )
        return;
      pending.screenshot = screenshot(s, c.screenshot, c.cursor);
      save();
      return;
    }
    case "specs":
      if (!s) throw Error("Select a session first.");
      if (s.broker.positions.length || s.broker.pending.length)
        throw Error(
          "Close positions and pending orders before changing the simulator profile.",
        );
      s.broker.specs = z
        .object({
          contract: number.positive().max(1000000),
          minLot: number.positive(),
          lotStep: number.positive(),
          leverage: number.positive().max(5000),
          commission: number.min(0).max(1000),
          slippage: number.min(0).max(100),
          swapLong: number.min(-1000).max(1000),
          swapShort: number.min(-1000).max(1000),
          stopOut: number.min(0).max(200),
          precision: z.number().int().min(0).max(8),
          currency: z.enum(["USD", "AUD"]).optional(),
          unit: z.string().max(30).optional(),
          tickSize: number.positive().optional(),
        })
        .parse(c.value);
      save();
      publish();
      return;
    case "viewport":
      if (!s) return;
      {
        const range = z
          .object({
            from: number,
            to: number,
            version: z.union([z.literal(2), z.literal(3)]).optional(),
            anchor: number.optional(),
            fromTime: number.optional(),
            toTime: number.optional(),
          })
          .parse(c.value);
        if (range.to <= range.from) throw Error("Invalid chart viewport.");
        if (c.secondary) s.layout.secondRange = range;
        else s.layout.range = range;
        save();
      }
      return;
    case "risk":
      if (!s) throw Error("Select a session first.");
      return sizeForRisk(
        number.parse(c.risk),
        number.parse(c.entry),
        number.parse(c.sl),
        s.broker.specs,
      );
    case "drawing.patch":
    case "drawing.remove":
    case "drawings":
      if (!s) throw Error("Select a session first.");
      {
        if (c.type === "drawing.patch") {
          const id = z.string().parse(c.id),
            patch = z.record(z.string(), z.unknown()).parse(c.patch);
          if (!s.drawings.some((d) => d.id === id))
            throw Error("Drawing no longer exists.");
          c.value = s.drawings.map((d) =>
            d.id === id
              ? { ...d, ...patch, id: d.id, createdCursor: d.createdCursor }
              : d,
          );
        } else if (c.type === "drawing.remove")
          c.value = s.drawings.filter((d) => d.id !== z.string().parse(c.id));
        const ds = z
          .array(
            z.object({
              id: z.string(),
              kind: z.enum([
                "horizontal",
                "ray",
                "trend",
                "zone",
                "fib",
                "long",
                "short",
              ]),
              a: z.object({ time: number, price: number.positive() }),
              b: z.object({ time: number, price: number.positive() }),
              color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
              locked: z.boolean(),
              hidden: z.boolean().optional(),
              fibFill: z.boolean().optional(),
              fibStyles: z
                .record(
                  z.string(),
                  z.object({
                    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
                    label: z.string().max(40),
                    visible: z.boolean(),
                    style: z.enum(["solid", "dashed", "dotted"]),
                  }),
                )
                .optional(),
              label: z.string().max(200),
              levels: z.array(number.min(-10).max(10)).max(20),
              createdCursor: number,
              target: number.positive().optional(),
              lots: number.positive().max(100).optional(),
            }),
          )
          .max(200)
          .parse(c.value);
        s.undo.push(structuredClone(s.drawings));
        s.undo = s.undo.slice(-30);
        s.redo = [];
        s.drawings = ds;
        save();
        publish();
      }
      return;
    case "drawing.undo":
    case "drawing.redo":
      if (!s) throw Error("Select a session first.");
      {
        const from = c.type === "drawing.undo" ? s.undo : s.redo,
          to = c.type === "drawing.undo" ? s.redo : s.undo;
        if (from.length) {
          to.push(structuredClone(s.drawings));
          s.drawings = from.pop()!;
          save();
          publish();
        }
      }
      return;
    case "flush":
    case "ui":
      if (!s) return;
      {
        const value = z
          .object({
            draft: z.string().max(30000).optional(),
            journalDraft: z.string().max(12000).optional(),
            thesis: z.string().max(12000).optional(),
            tags: z.string().max(1000).optional(),
            layout: z
              .object({
                timeframe: z.enum(["1m", "5m", "15m", "30m", "1H", "4H", "1D"]),
                second: z.enum(["1m", "5m", "15m", "30m", "1H", "4H", "1D"]),
                htf: z
                  .object({
                    enabled: z.boolean(),
                    timeframe: z.enum([
                      "1m",
                      "5m",
                      "15m",
                      "30m",
                      "1H",
                      "4H",
                      "1D",
                    ]),
                    count: z.number().int().min(1).max(5),
                    width: z.number().min(12).max(64),
                    gap: z.number().min(4).max(40),
                    up: z.string().regex(/^#[0-9a-fA-F]{6}$/),
                    down: z.string().regex(/^#[0-9a-fA-F]{6}$/),
                    levels: z.boolean(),
                  })
                  .optional(),
                dual: z.boolean(),
                ai: z.boolean(),
                bottom: number.min(140).max(600),
                right: number.min(240).max(500),
                blind: z.boolean(),
                timezone: z.string().max(100),
                range: z
                  .object({
                    from: number,
                    to: number,
                    version: z.union([z.literal(2), z.literal(3)]).optional(),
                    anchor: number.optional(),
                    fromTime: number.optional(),
                    toTime: number.optional(),
                  })
                  .optional(),
                secondRange: z
                  .object({
                    from: number,
                    to: number,
                    version: z.union([z.literal(2), z.literal(3)]).optional(),
                    anchor: number.optional(),
                    fromTime: number.optional(),
                    toTime: number.optional(),
                  })
                  .optional(),
              })
              .optional(),
            checklist: z.record(z.string(), z.boolean()).optional(),
          })
          .parse(c.value);
        Object.assign(s, value);
        save();
        publish();
      }
      return;
    case "indicators": {
      if (!s) throw Error("Select a session first.");
      const nextIndicators = z
        .array(
          z.object({
            id: z.string(),
            kind: z.enum([
              "SMA",
              "EMA",
              "RSI",
              "ATR",
              "sessions",
              "previous",
              "asian",
              "custom",
            ]),
            period: z.number().int().min(2).max(500),
            color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            enabled: z.boolean(),
            start: z.number().int().min(0).max(23).optional(),
            end: z.number().int().min(0).max(23).optional(),
            name: z.string().max(80).optional(),
            script: z.string().max(12000).optional(),
            pane: z.enum(["price", "separate"]).optional(),
          }),
        )
        .max(16)
        .parse(c.value);
      for (const indicator of nextIndicators.filter((i) => i.kind === "custom"))
        calculateFormula(
          indicator.script ?? "",
          replay.bars(s.layout.timeframe),
        );
      s.indicators = nextIndicators;
      save();
      publish();
      return;
    }
    case "notebook":
      if (!s) throw Error("Select a session first.");
      s.notebook = z
        .object({
          version: z.string().max(120),
          name: z.string().max(200),
          source: z.string().max(1000),
          text: z.string().max(30000),
          verified: z.boolean(),
          rules: z
            .array(
              z.object({ id: z.string().max(120), text: z.string().max(2000) }),
            )
            .max(60),
          cutoff: number,
        })
        .parse(c.value);
      s.notebook.cutoff = s.tick.t;
      save();
      publish();
      return;
    case "note":
      if (!s) throw Error("Select a session first.");
      s.notes.push({
        id: randomUUID(),
        text: z.string().max(12000).parse(c.text),
        cutoff: s.tick.t,
        cursor: s.broker.seq,
        tags: s.tags
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      });
      save();
      publish();
      return;
    case "image": {
      if (!s) throw Error("Select a session first.");
      const row = store.db
        .prepare(
          "SELECT png FROM images WHERE id=? AND session=? AND cutoff<=? AND cursor<=?",
        )
        .get(z.string().parse(c.id), s.id, s.tick.t, s.broker.seq);
      return row?.png ?? null;
    }
    case "stats": {
      const sessions = (store.list() as any[])
        .map((x) => store.load(x.id)!)
        .filter((x) => !c.mode || x.mode === c.mode);
      return sessions.map((x) => ({
        id: x.id,
        name: x.name,
        mode: x.mode,
        strategy: x.notebook.version,
        drawdown: x.broker.maxDrawdown,
        ...tradeStatistics(
          x.broker.fills.filter(
            (f) =>
              (!c.tag || f.tags.includes(String(c.tag))) &&
              (!c.strategy || f.strategy === c.strategy),
          ),
          x.broker.positions.map((p) => p.id),
        ),
      }));
    }
    case "instrument": {
      const id = z.enum(["XAUUSD", "EURAUD", "NAS100"]).parse(c.value);
      if (!INSTRUMENTS[id].available)
        throw Error("Instrumentet er ikke tilgjengelig.");
      await cancel();
      await stopImport();
      playing = false;
      if (s) save();
      const previousDataset = dataset,
        previousSession = s;
      try {
        dataset = INSTRUMENTS[id].dataset;
        const existing = store
          .list()
          .map((a) => store.load(String(a.id)))
          .find((a) => a?.dataset === dataset);
        if (existing) {
          recoverChallenge(existing);
          replay.setSession(existing);
        } else {
          replay.session = null;
          if (replay.eligible(dataset).length) replay.newSession(dataset);
          else startImport({ instrument: id, starter: true });
        }

        store.set("activeDataset", dataset);
      } catch (error) {
        dataset = previousDataset;
        replay.session = previousSession;
        if (previousSession) replay.setSession(previousSession);
        store.set("activeDataset", previousDataset);
        store.set("lastSession", previousSession?.id ?? null);
        publish();
        throw error;
      }
      publish();
      return;
    }
    case "import.start":
      startImport({
        instrument: instrumentForDataset(dataset),
        year: Boolean(c.year),
        from: c.from === undefined ? undefined : number.parse(c.from),
        to: c.to === undefined ? undefined : number.parse(c.to),
      });
      return;
    case "import.csv":
      startImport({ csv: z.string().parse(c.file), mapping: c.mapping });
      return;
    case "import.pause":
      store.set("importPause", true);
      await stopImport();
      publish();
      return;
    case "storage": {
      const directory = z.string().min(3).max(1000).parse(c.directory);
      store.set("marketDirectory", directory);
      const roots = store.meta<string[]>("marketRoots", []);
      if (!roots.includes(directory))
        store.set("marketRoots", [...roots, directory]);
      publish();
      return directory;
    }
    case "datasets":
      return store.db.prepare("SELECT DISTINCT dataset FROM chunks").all();
    case "dataset":
      dataset = z.string().parse(c.value);
      store.set("activeDataset", dataset);
      publish();
      return;
    case "discord.settings": {
      discord = discordSettings(c.value);
      store.set("discordSettings", discord);
      publish();
      return discord;
    }
    case "ai.health": {
      const p = getProvider();
      await p.start();
      ai.models = await p.models();
      if (!p.instance)
        ai = {
          ...ai,
          state: "off",
          message: "The local runtime is ready. Model files are available.",
        };
      if (!settings.model && ai.models.length) {
        settings.model =
          ai.models.find((m: { id: string }) => /qwen3.5.*4b/i.test(m.id))
            ?.id ?? ai.models[0].id;
        store.set("aiSettings", settings);
      }
      publish();
      return ai.models;
    }
    case "ai.settings": {
      await cancel();
      const previous = { ...settings };
      delete previous.previous;
      const next = z
        .object({
          provider: z.enum(["managed", "lmstudio"]),
          url: z.string(),
          model: z.string().max(500),
          enabled: z.boolean(),
          profile: z.enum(["normal", "light", "gaming"]),
          context: z.number().int().min(1024).max(32768),
          maxTokens: z.number().int().min(100).max(4096),
          vision: z.boolean(),
          structured: z.boolean(),
          lazy: z.boolean(),
          idleMinutes: z.number().int().min(1).max(120),
          runtime: z.string().max(1000),
          gpu: z.enum(["max", "off", "0.25", "0.5", "0.75"]),
        })
        .parse(c.value);
      const reload = (
        [
          "provider",
          "url",
          "model",
          "profile",
          "context",
          "runtime",
          "gpu",
        ] as const
      ).some((key) => next[key] !== settings[key]);
      if (provider && (reload || !next.enabled || next.profile === "gaming")) {
        await provider.shutdown();
        provider = null;
      }
      settings = next;
      settings.previous = previous;
      idle = Date.now();
      if (provider) provider.settings = settings;
      store.set("aiSettings", settings);
      if (settings.enabled && settings.profile !== "gaming" && !settings.lazy)
        await getProvider().load();
      publish();
      return;
    }
    case "ai.rollback":
      if (!settings.previous) throw Error("No previous AI profile.");
      return dispatch({ type: "ai.settings", value: settings.previous });
    case "ai.toggle":
      idle = Date.now();
      settings.enabled = Boolean(c.value);
      if (settings.enabled && settings.profile === "gaming")
        settings.profile = "normal";
      store.set("aiSettings", settings);
      if (!settings.enabled || settings.profile === "gaming") await off();
      else await getProvider().load();
      publish();
      return;
    case "ai.cancel":
      await cancel();
      publish();
      return;
    case "ai.ask":
      if (!s) throw Error("Select a session first.");
      if (!settings.enabled || settings.profile === "gaming")
        throw Error("Turn on the assistant first.");
      if (generating) throw Error("A response is already running.");
      playing = false;
      {
        const prompt = z.string().min(1).max(12000).parse(c.text);
        if (c.cursor !== s.broker.seq)
          throw Error("The chart changed. Pause and try again.");
        const target = z
          .string()
          .max(200)
          .parse(c.tradeId ?? "auto");
        const review =
          target !== "chart" &&
          !(target === "auto" && currentChartHint(prompt)) &&
          (target !== "auto" || asksAboutTrade(prompt));
        const trades = sessionTrades(s);
        const previousTrade = [...s.chat]
          .reverse()
          .find(
            (m) => m.role === "assistant" && (m as any).evidence?.tradeId,
          ) as any;
        const selected = review
          ? target === "auto"
            ? selectTradeReference(
                trades,
                prompt,
                previousTrade?.evidence?.tradeId,
              )
            : (trades.find((t) => t.id === target) ?? null)
          : null;
        if (review && target !== "auto" && !selected)
          throw Error(
            "That trade is not in this session at the current replay time.",
          );
        const row = selected
          ? store.db
              .prepare(
                "SELECT payload FROM decisions WHERE session=? AND id=? AND cutoff<=?",
              )
              .get(s.id, selected.id, s.tick.t)
          : null;
        const decision = row
          ? reviewDecision(
              JSON.parse(String(row.payload)),
              selected,
              s.tick.t,
              s.broker.seq,
            )
          : null;
        const visibleWindow = c.visibleWindow
          ? z
              .object({ from: z.number().finite(), to: z.number().finite() })
              .refine((v) => v.to > v.from)
              .parse(c.visibleWindow)
          : undefined;
        const fullContext = buildContext(
          s,
          replay.bars(s.layout.timeframe),
          replay.bars(s.layout.second),
          review ? undefined : (c.proposal as any),
          replay.levels(),
          visibleWindow,
        );
        fullContext.higherTimeframe = {
          timeframe: "4H",
          cutoff: selected ? (decision?.cutoff ?? selected.opened) : s.tick.t,
          candles: replay
            .barsAt(
              selected ? (decision?.cutoff ?? selected.opened) : s.tick.t,
              "4H",
            )
            .slice(-8),
        };
        fullContext.reviewMode = review;
        if (selected) {
          fullContext.selectedTrade = tradeWithDecision(selected, decision);
          fullContext.reviewFacts = decisionFacts(
            fullContext.selectedTrade,
            decision,
          );
          fullContext.proposal = {
            ...fullContext.selectedTrade,
            kind: "executed trade",
          };
          fullContext.thesis = decision?.thesis ?? selected.thesis;
          fullContext.checklist = decision?.checklist ?? {};
          if (decision?.strategy) fullContext.strategy = decision.strategy;
        }
        fullContext.reviewAtDecision = decision;
        // COACH integration: verify only the evidence window at its own decision time.
        const evidenceCutoff = selected
          ? (decision?.cutoff ?? selected.opened)
          : s.tick.t;
        const evidenceBars =
          selected && decision
            ? [
                ...decision.candles,
                ...decision.secondCandles,
                ...fullContext.higherTimeframe.candles,
              ]
            : [
                ...fullContext.candles,
                ...fullContext.secondCandles.slice(-12),
                ...fullContext.higherTimeframe.candles,
              ];
        const evidenceFrom = Math.min(
          evidenceCutoff,
          ...evidenceBars.map((b) => b.time * 1000),
          ...(selected
            ? []
            : fullContext.selectedRange
              ? [fullContext.selectedRange.c1.time * 1000]
              : []),
        );
        fullContext.dataQuality = dataQuality(
          store,
          s.dataset,
          evidenceFrom,
          evidenceCutoff,
        );
        const visual = settings.vision || review || wantsChartAnalysis(prompt);
        const currentImage =
          visual && c.screenshot ? String(c.screenshot) : null;
        const imageRow =
          visual && selected?.screenshot
            ? store.db
                .prepare(
                  "SELECT png FROM images WHERE id=? AND session=? AND cutoff<=? AND cursor<=?",
                )
                .get(selected.screenshot, s.id, s.tick.t, s.broker.seq)
            : null;
        const decisionImage = imageRow?.png ? String(imageRow.png) : null;
        for (const image of [currentImage, decisionImage])
          if (
            image &&
            (!image.startsWith("data:image/png;base64,") ||
              image.length > 4000000)
          )
            throw Error("Invalid chart image.");
        fullContext.visualEvidence = {
          requested: visual,
          originalDecisionAvailable: !!decisionImage,
          currentChartAvailable: !!currentImage,
          suppliedToModel: [],
        };
        const contextTokens =
          settings.profile === "light"
            ? Math.min(settings.context, 4096)
            : Math.max(settings.context, visual ? 8192 : 0);
        const context = fitContext(
          fullContext,
          contextTokens,
          settings.maxTokens,
          visual,
        );
        // Preserve retrievable evidence with the conversation's snapshot id. Exact trade lookup uses its order id.
        store.db
          .prepare("INSERT INTO decisions VALUES(?,?,?,?)")
          .run(s.id, context.snapshotId, s.tick.t, JSON.stringify(context));
        const model = settings.model;
        const base = {
          at: Date.now(),
          cutoff: s.tick.t,
          cursor: s.broker.seq,
          model,
          profile: COACH_PROFILE.id,
          strategy: s.notebook.version,
          snapshot: context.snapshotId,
        };
        s.chat.push({
          ...base,
          id: randomUUID(),
          role: "user",
          text: prompt,
          status: "complete",
        });
        const reply: any = {
          ...base,
          id: randomUUID(),
          role: "assistant",
          text: "",
          status: "generating",
        };
        s.chat.push(reply);
        s.draft = "";
        save();
        controller = new AbortController();
        const signal = controller.signal;
        const started = performance.now();
        ai = {
          ...ai,
          state: "generating",
          message: "Reviewing the available chart context.",
        };
        publish();
        generating = (async () => {
          await Promise.resolve(); // Assign the task before a synchronous saved-data reply finishes.
          try {
            // COACH integration: gaps are an explicit abstention, never a model-approved setup.
            if (context.dataQuality?.status === "insufficient") {
              reply.text =
                replyLanguage(prompt) === "Norwegian"
                  ? "Uklart: prisgrunnlaget ved beslutningstidspunktet er ufullstendig eller korrupt. Jeg kan ikke bekrefte oppsettet med denne historikken. Importer det manglende intervallet på nytt i Data. Vanlig markedspause er forskjellig fra ukjent datatap; jeg fyller ikke inn oppdiktede candles. Behold inngang, SL og TP som en plan til datagrunnlaget er kontrollert. Neste steg: reparer intervallet og vurder oppsettet på nytt ved samme replay-tid."
                  : "Unclear: historical prices at the decision time are incomplete or corrupt. Setup validity cannot be confirmed from this history. Reimport the missing interval in Data. A known market break differs from unknown data loss; no candles are invented. Keep entry, SL and TP as a plan until the data is checked. Next: repair that interval and assess again at the same replay time.";
              reply.savedFacts = true;
              reply.status = "complete";
              ai = {
                ...ai,
                state: "ready",
                message: "Incomplete historical evidence; assessment blocked.",
              };
              return;
            }
            const historyAnswer = savedHistoryAnswer(s, prompt);
            if (historyAnswer) {
              reply.text = historyAnswer;
              reply.historyAnswer = true;
              reply.status = "complete";
              ai = {
                ...ai,
                state: "ready",
                message: "Saved trade history retrieved.",
              };
              return;
            }
            const simpleFrames =
              /(?:timeframe|tidsram|do i mark|difference.{0,50}4H)/i.test(
                prompt,
              ) &&
              !/(?:assess|vurder|valid|gyldig|my plan|mitt oppsett)/i.test(
                prompt,
              );
            const missingPair =
              !context.selectedRange &&
              /C1|C2/i.test(prompt) &&
              /(?:setup|oppsett|valid|gyldig|vurder|assess)/i.test(prompt);
            const computedPlan =
              context.planFacts.entries.length > 0 &&
              (context.planFacts.entries.some((p) => p.issues.length) ||
                /no entry confirmation|geometry.{0,20}(?:only|practice)/i.test(
                  context.strategy.text,
                ));
            const ruleQuestion =
              /always true|alltid|must be outside|close as.{0,20}stop/i.test(
                prompt,
              );
            if (
              !review &&
              (simpleFrames || missingPair || computedPlan || ruleQuestion)
            ) {
              reply.text = coachEvidenceReply(context, prompt);
              reply.savedFacts = true;
              reply.status = "complete";
              ai = {
                ...ai,
                state: "ready",
                message: "Replay facts retrieved.",
              };
              return;
            }
            const p = getProvider();
            if (p.instance && p.settings.context < contextTokens)
              await p.unload();
            p.settings = {
              ...settings,
              maxTokens: Math.max(settings.maxTokens, 640),
              context: Math.max(contextTokens, p.settings.context),
            };
            if (!p.instance) await p.load();
            const supports =
              visual &&
              (await p.models()).find(
                (m: { id: string }) => m.id === settings.model,
              )?.vision;
            const imageParts: any[] = [];
            if (supports) {
              if (decisionImage) {
                context.visualEvidence.suppliedToModel.push(
                  "Original decision chart",
                );
                imageParts.push(
                  {
                    type: "text",
                    text: "Original decision chart for the selected trade. Judge the entry here, before later price action.",
                  },
                  { type: "image_url", image_url: { url: decisionImage } },
                );
              }
              if (currentImage) {
                context.visualEvidence.suppliedToModel.push(
                  "Current replay chart",
                );
                imageParts.push(
                  {
                    type: "text",
                    text: review
                      ? "Current replay chart. Later comparison only; do not use it to justify the earlier decision."
                      : "Current replay chart for this question.",
                  },
                  { type: "image_url", image_url: { url: currentImage } },
                );
              }
            }
            reply.evidence = {
              tradeId: selected?.id,
              label: selected
                ? selected.side.toUpperCase() + " @ " + selected.entry
                : undefined,
              decisionCutoff: decision?.cutoff,
              decisionImage: !!supports && !!decisionImage,
              currentImage: !!supports && !!currentImage,
              chartScan: true,
            };
            store.db
              .prepare(
                "UPDATE decisions SET payload=? WHERE session=? AND id=?",
              )
              .run(JSON.stringify(context), s.id, context.snapshotId);
            const content: any = [
              {
                type: "text",
                text: JSON.stringify({
                  snapshot: promptSnapshot(context, settings.structured),
                  request: prompt,
                }),
              },
            ];
            content.push(...imageParts);
            ai.state = "generating";
            const messages = [
              {
                role: "system",
                content:
                  COACH_PROFILE.system +
                  " Reply in " +
                  replyLanguage(prompt) +
                  ". Explain technical terms in simple everyday words. " +
                  (review
                    ? " This request is a trade review: obey reviewFacts.validityLimit and use actualExecutedEntry for the fill. "
                    : currentChartHint(prompt)
                      ? " This request asks for ONE HINT about the CURRENT chart. Do not answer a previous trade question. Start with the hint, not Yes or No. "
                      : ""),
              },
              // Saved references are retrieved explicitly. Old assessment prose must not override the current plan.
              { role: "user", content },
            ];
            let result = await p.chat(messages, () => {}, signal);
            const issue =
              coachRuleIssue(result) ||
              coachEvidenceIssue(result, context) ||
              reviewAnswerIssue(result, context) ||
              (!review &&
              currentChartHint(prompt) &&
              /^(?:Yes|No|Unclear),? (?:your|this|the) (?:setup|trade)/i.test(
                result,
              )
                ? "Give one hint about the current chart. Do not repeat a prior trade assessment."
                : null);
            if (!settings.structured && issue) {
              reply.rejectedDraft = result;
              result = await p.chat(
                [
                  ...messages,
                  { role: "assistant", content: result },
                  {
                    role: "user",
                    content:
                      "Correct this evidence error: " +
                      issue +
                      " Give a direct verdict, two observations, what is missing and one next action in 100–180 words. Never use a candle close as an automatic stop rule. Use only supplied facts.",
                  },
                ],
                () => {},
                signal,
              );
              const repeated =
                coachRuleIssue(result) ||
                coachEvidenceIssue(result, context) ||
                reviewAnswerIssue(result, context);
              if (repeated) {
                reply.rawText = result;
                reply.evidenceFallback = true;
                result = context.selectedTrade
                  ? factualTradeReview(context, replyLanguage(prompt))
                  : coachEvidenceReply(context, prompt);
              }
            }
            reply.rawText ??= result;
            if (settings.structured) {
              validateGrounding(result, context);
              const parsed = validateCoachJSON(JSON.parse(result), context);
              reply.text = JSON.stringify(parsed, null, 2);
            } else {
              try {
                validateGrounding(result, context);
                reply.text = result;
              } catch {
                const repair = await p.chat(
                  [
                    ...messages,
                    { role: "assistant", content: result },
                    {
                      role: "user",
                      content:
                        "Repair the unsupported numerical claims. Use only exact supplied prices and computed risk. Keep the explanation useful; give no invented values.",
                    },
                  ],
                  () => {},
                  signal,
                );
                try {
                  validateGrounding(repair, context);
                  if (
                    coachRuleIssue(repair) ||
                    coachEvidenceIssue(repair, context) ||
                    reviewAnswerIssue(repair, context)
                  )
                    throw Error("Unsupported rule");
                  reply.text = repair;
                } catch {
                  reply.evidenceFallback = true;
                  reply.text = context.selectedTrade
                    ? factualTradeReview(context, replyLanguage(prompt))
                    : coachEvidenceReply(context, prompt);
                }
              }
            }
            reply.status = "complete";
            ai = {
              ...ai,
              state: "ready",
              message: "Response saved locally.",
              latency: performance.now() - started,
            };
          } catch (e) {
            reply.status = "interrupted";
            if (signal.aborted && reply.text) {
              reply.rawText = reply.text;
              try {
                validateGrounding(reply.text, context);
              } catch {
                reply.text =
                  "The interrupted response included unverified numbers. Its original draft is preserved in the session backup.";
              }
            }
            if (String(e).includes("withheld")) reply.text = String(e);
            if (!signal.aborted) {
              reply.rawText = reply.rawText || reply.text;
              reply.text = "Response withheld: " + String(e);
            }
            reply.text = reply.text || `Response stopped: ${String(e)}`;
            ai = {
              ...ai,
              state: signal.aborted ? "ready" : "error",
              message: signal.aborted ? "Response stopped." : String(e),
            };
          } finally {
            store.save(s);
            idle = Date.now();
            generating = null;
            controller = null;
            publish();
          }
        })();
        return;
      }
    case "freeze":
      telegramFeed.stop();
      playing = false;
      await cancel();
      await aiQueue;
      closing = true;
      save();
      publish();
      return;
    case "shutdown":
      telegramFeed.stop();
      if (!shut)
        shut = (async () => {
          playing = false;
          closing = true;
          await cancel();
          save();
          await stopImport();
          if (provider) await provider.shutdown();
          store.set("cleanExit", true);
          store.checkpoint();
        })();
      try {
        await shut;
      } catch (e) {
        shut = null;
        throw e;
      }
      return;
    default:
      throw Error("Unknown or disallowed command: " + c.type);
  }
}
let queue = Promise.resolve(),
  aiQueue = Promise.resolve(),
  feedQueue = Promise.resolve();
parentPort!.on("message", (m) => {
  if (m.command.type === "ai.cancel") controller?.abort();
  if (m.command.type === "feed.cancel") telegramFeed.cancel();
  const run = async () => {
    try {
      const value = await dispatch(m.command);
      parentPort!.postMessage({ id: m.id, value });
    } catch (e) {
      if (m.command.type.startsWith("ai.")) {
        ai = { ...ai, state: "error", message: String(e) };
        publish();
      }
      if (
        ["order", "position.close", "position.edit", "pending.edit"].includes(
          m.command.type,
        )
      ) {
        playing = false;
        error(e);
        try {
          save();
        } catch (saveError) {
          error(saveError);
        }
      }
      parentPort!.postMessage({ id: m.id, error: String(e) });
    }
  };
  if (m.command.type.startsWith("ai.")) aiQueue = aiQueue.then(run);
  else if (m.command.type.startsWith("feed.")) feedQueue = feedQueue.then(run);
  else queue = queue.then(run);
});
setInterval(() => {
  const now = performance.now(),
    elapsed = Math.min(now - lastWall, 1000);
  lastWall = now;
  try {
    if (playing && replay.session && !closing) {
      targetTime += elapsed * speed;
      const next = replay.peek();
      if (next?.skipped) targetTime = Math.max(targetTime, next.tick.t);
      const before =
        replay.session.broker.fills.length +
        replay.session.broker.positions.length;
      replay.advanceTo(targetTime, 10);
      const after =
        replay.session.broker.fills.length +
        replay.session.broker.positions.length;
      if (Date.now() - lastSave > 1000 || before !== after) save();
      if (Date.now() - lastPublish > 120) publish();
    } else if (
      Date.now() - lastPublish > 2000 &&
      (importer || store.meta<any>("importLease", null)?.pid)
    )
      publish();
    if (
      settings.enabled &&
      provider?.instance &&
      ai.state === "ready" &&
      !provider.loadPromise &&
      !generating &&
      Date.now() - idle > settings.idleMinutes * 60000
    ) {
      idle = Date.now();
      off().catch(error);
    }
  } catch (e) {
    playing = false;
    error(e);
    try {
      save();
    } catch (e) {
      error(e);
    }
    publish();
  }
}, 16).unref();
if (
  workerData.autoSetup === true &&
  !replay.session &&
  (!store.chunks("dukascopy").length || store.meta("starterPending", false))
) {
  store.set("starterPending", true);
  try {
    startImport({ starter: true });
  } catch (e) {
    error(e);
  }
}
if (
  workerData.autoSetup !== false &&
  settings.enabled &&
  settings.profile !== "gaming" &&
  !settings.lazy
)
  getProvider()
    .load()
    .then(publish)
    .catch((e) => {
      ai = { ...ai, state: "error", message: String(e) };
      publish();
    });
publish();
