import { VideoGuides } from "./VideoGuides";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Crosshair,
  Eye,
  EyeOff,
  Lock,
  Play,
  RotateCcw,
} from "lucide-react";
import { CandleBasics, SIMPLE_NORWEGIAN } from "./CandleBasics";
import type { AppState, Command, TF } from "../types";
import { DEFAULT_RR_PROGRESS, RR_LESSONS } from "../core/rr-lessons";
import {
  EMPTY_RR_PLAN,
  RR_PATTERN_LABELS,
  RR_TIMEFRAMES,
  partialRExample,
  rrC3Description,
  type RRAttempt,
  type RRPlan,
  type RRTimeframe,
} from "../core/rr-study";

type Props = {
  state: AppState;
  call: (command: Command) => Promise<any>;
  picking: boolean;
  pick: (value: boolean) => void;
  focusRange: () => void;
  onDraft: (value: { rangeId: string; value: RRPlan } | null) => void;
};
const price = (p: number) => p.toFixed(3);
const clock = (t: number, zone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(t);
const exposureLabel = (a: RRAttempt) =>
  a.exposure === "already-closed"
    ? "Review only · C3 was already closed"
    : a.exposure === "developing"
      ? "C3 was already developing when saved"
      : "Saved before C3 was visible";

function CandleExample() {
  const [sweep, setSweep] = useState(true);
  return (
    <div className="rr-example">
      <div className="rr-example-switch">
        <button
          className={sweep ? "active" : ""}
          onClick={() => setSweep(true)}
        >
          Wick sweep
        </button>
        <button
          className={!sweep ? "active" : ""}
          onClick={() => setSweep(false)}
        >
          Body break
        </button>
      </div>
      <svg
        viewBox="0 0 250 140"
        role="img"
        aria-label={
          sweep
            ? "C2 wick above C1 high, with its close back inside"
            : "C2 closes above C1 high"
        }
      >
        <line x1="20" y1="48" x2="230" y2="48" className="rr-reference" />
        <line x1="20" y1="119" x2="230" y2="119" className="rr-reference" />
        <line x1="72" y1="48" x2="72" y2="119" className="rr-wick" />
        <rect
          x="62"
          y="65"
          width="20"
          height="36"
          className="rr-example-body"
        />
        <line x1="157" y1="19" x2="157" y2="103" className="rr-wick" />
        <rect
          x="147"
          y={sweep ? 65 : 25}
          width="20"
          height={sweep ? 25 : 65}
          className="rr-example-body accent"
        />
        <text x="57" y="136">
          C1
        </text>
        <text x="142" y="136">
          C2
        </text>
        <text x="21" y="42">
          C1 high
        </text>
        <circle
          cx="157"
          cy={sweep ? 90 : 25}
          r="3"
          className="rr-example-close"
        />
        <text x="174" y={sweep ? 94 : 29}>
          Close
        </text>
      </svg>
      <p>
        {sweep
          ? "The wick ran above the range; the close returned inside. A lower C3 is a conditional idea."
          : "C2 closed above the reference high. A higher C3 is the basic continuation idea."}
      </p>
      <small>Schematic · larger context can contradict either idea.</small>
    </div>
  );
}

function PartialExample() {
  const [values, setValues] = useState({
    entry: "4053",
    stop: "4060",
    tp1: "4045",
    tp2: "4035",
    part: 50,
  });
  const result = partialRExample(
    +values.entry,
    +values.stop,
    +values.tp1,
    +values.tp2,
    values.part,
  );
  return (
    <div className="rr-math">
      <b>Try the R arithmetic</b>
      <div className="rr-math-grid">
        {(
          [
            ["entry", "Entry"],
            ["stop", "Initial stop"],
            ["tp1", "TP1"],
            ["tp2", "Runner target"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            <span>{label}</span>
            <input
              aria-label={`R example ${label}`}
              type="number"
              step=".001"
              min="0.001"
              value={values[key]}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <label className="rr-part">
        <span>
          Close at TP1 <b>{values.part}%</b>
        </span>
        <input
          aria-label="TP1 portion"
          type="range"
          min="0"
          max="100"
          step="10"
          value={values.part}
          onChange={(e) => setValues({ ...values, part: +e.target.value })}
        />
      </label>
      {result ? (
        <dl className="rr-math-results">
          <dt>TP1 distance</dt>
          <dd>{result.r1.toFixed(2)}R</dd>
          <dt>Runner target</dt>
          <dd>{result.r2.toFixed(2)}R</dd>
          <dt>Both portions reach targets</dt>
          <dd>{result.fullR.toFixed(2)}R</dd>
          <dt>Runner returns to entry</dt>
          <dd>{result.runnerBeR.toFixed(2)}R</dd>
        </dl>
      ) : (
        <p>Use a distinct stop and targets on the profit side of entry.</p>
      )}
      <small>
        Illustrative prices · gross R before spread, fees or slippage. The
        denominator stays the original entry-to-stop risk.
      </small>
    </div>
  );
}

function SavedPlan({
  attempt,
  zone,
  norwegian = false,
}: {
  attempt: RRAttempt;
  zone: string;
  norwegian?: boolean;
}) {
  const t = (en: string, no: string) => (norwegian ? no : en);
  return (
    <div className="rr-saved-plan">
      <span className="rr-saved-time">
        <Lock size={11} /> {clock(attempt.committedAt, zone)} ·{" "}
        {attempt.plan.decision === "skip"
          ? "Skip"
          : attempt.plan.decision === "long"
            ? "Long idea"
            : "Short idea"}
      </span>
      <small>{exposureLabel(attempt)}</small>
      {attempt.plan.objective && (
        <p>
          <b>{t("Objective", "Hvor kan prisen gå?")}</b>
          {attempt.plan.objective}
        </p>
      )}
      {attempt.plan.invalidation && (
        <p>
          <b>{t("Invalidation", "Hva ville gjort ideen feil?")}</b>
          {attempt.plan.invalidation}
        </p>
      )}
      <p>
        <b>
          {attempt.plan.decision === "skip"
            ? t("Reason to skip", "Hvorfor jeg venter")
            : t("Confirmation", "Det jeg ville se før inngang")}
        </b>
        {attempt.plan.confirmation}
      </p>
    </div>
  );
}

export function RRStudyPanel({
  state,
  call,
  picking,
  pick,
  focusRange,
  onDraft,
}: Props) {
  const [language, setLanguage] = useState(
    () => localStorage.getItem("retrace.learning-language") ?? "no",
  );
  const norwegian = language === "no";
  const t = (en: string, no: string) => (norwegian ? no : en);
  const s = state.session,
    progress = state.rrProgress ?? DEFAULT_RR_PROGRESS;
  const lesson =
    RR_LESSONS.find((l) => l.id === progress.selected) ?? RR_LESSONS[0];
  const study = s?.study,
    range = state.rrView?.range ?? undefined;
  const active = study?.attempts.find(
    (a) =>
      a.id === study.activeId &&
      s &&
      a.committedAt <= s.tick.t &&
      a.committedSeq <= s.broker.seq,
  );
  const view = state.rrView;
  const [tab, setTab] = useState("learn"),
    [issue, setIssue] = useState(""),
    [busy, setBusy] = useState(false);
  const [tf, setTF] = useState<RRTimeframe>(range?.timeframe ?? "15m");
  const [plan, setPlan] = useState<RRPlan>(
    study?.draft ?? { ...EMPTY_RR_PLAN },
  );
  const [reflection, setReflection] = useState(
    active?.review?.reflection ?? "",
  );
  const [saved, setSaved] = useState(false),
    [historyId, setHistoryId] = useState("");
  const autosave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraft = useRef<{ rangeId: string; value: RRPlan } | null>(null);
  const sessionId = s?.id;
  useEffect(() => {
    setPlan(study?.draft ?? { ...EMPTY_RR_PLAN });
    setSaved(false);
    pendingDraft.current = null;
    onDraft(null);
  }, [sessionId, range?.id, active?.id]);
  useEffect(() => {
    setReflection(active?.review?.reflection ?? "");
  }, [sessionId, active?.id, active?.review?.reflection]);
  useEffect(() => {
    if (range) setTF(range.timeframe);
  }, [range?.id]);
  useEffect(
    () => () => {
      if (autosave.current) clearTimeout(autosave.current);
      if (pendingDraft.current)
        void call({ type: "study.draft", ...pendingDraft.current }).catch(
          () => {},
        );
    },
    [],
  );
  const run = async (command: Command) => {
    if (command.type === "study.context") pick(false);
    setIssue("");
    setBusy(true);
    try {
      return await call(command);
    } catch (e) {
      setIssue(String(e).replace(/^Error: /, ""));
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const changePlan = (next: RRPlan) => {
    setPlan(next);
    setSaved(false);
    if (autosave.current) clearTimeout(autosave.current);
    const id = range?.id;
    pendingDraft.current = id ? { rangeId: id, value: next } : null;
    onDraft(pendingDraft.current);
    if (id)
      autosave.current = setTimeout(() => {
        void call({ type: "study.draft", rangeId: id, value: next }).catch(
          (e) => setIssue(String(e)),
        );
      }, 400);
  };
  const chooseLatest = async () => {
    if (!s) return;
    if (autosave.current) clearTimeout(autosave.current);
    pick(false);
    await run({ type: "study.range", timeframe: tf, cursor: s.broker.seq });
    setTab("practice");
  };
  const savePlan = async () => {
    if (!s || !range) return;
    if (autosave.current) clearTimeout(autosave.current);
    await run({
      type: "study.commit",
      rangeId: range.id,
      cursor: s.broker.seq,
      lesson: lesson.id,
      value: plan,
    });
  };
  const saveReview = async () => {
    if (!active) return;
    await run({ type: "study.review", id: active.id, reflection });
    setSaved(true);
  };
  const chooseLesson = (selected: typeof progress.selected) => {
    void run({
      type: "study.progress",
      value: { selected, completed: progress.completed },
    }).catch(() => {});
  };
  const attempts =
    study?.attempts.filter(
      (a) => s && a.committedAt <= s.tick.t && a.committedSeq <= s.broker.seq,
    ) ?? [];
  const historic = attempts.find((a) => a.id === historyId) ?? attempts.at(-1);
  const reviewedC3 =
    active?.review && s && active.review.savedAt <= s.tick.t
      ? active.review.c3
      : view?.c3Closed
        ? view.c3
        : null;
  return (
    <section className="rr-study-panel" aria-label="RR Study">
      <header className="rr-study-header">
        <div>
          <BookOpen size={15} />
          <b>RR Study</b>
        </div>
        <small>
          {progress.completed.length} / {RR_LESSONS.length} read
        </small>
      </header>
      <nav className="rr-study-tabs" aria-label="Study sections">
        {(
          [
            ["learn", "Learn"],
            ["practice", "Practice"],
            ["review", "Review"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "selected" : ""}
            onClick={() => {
              setTab(key);
              pick(false);
            }}
          >
            {t(
              label,
              key === "learn"
                ? "Lær"
                : key === "practice"
                  ? "Øv"
                  : "Se tilbake",
            )}
          </button>
        ))}
      </nav>
      <div className="rr-language" aria-label="Learning language">
        <button
          className={norwegian ? "active" : ""}
          onClick={() => {
            setLanguage("no");
            localStorage.setItem("retrace.learning-language", "no");
          }}
        >
          Norsk
        </button>
        <button
          className={!norwegian ? "active" : ""}
          onClick={() => {
            setLanguage("en");
            localStorage.setItem("retrace.learning-language", "en");
          }}
        >
          English
        </button>
      </div>
      <VideoGuides norwegian={norwegian} />
      <div className="rr-study-content">
        {(tab === "learn" || tab === "practice") && (
          <CandleBasics
            bars={state.bars}
            timeframe={s?.layout.timeframe ?? "15m"}
            cutoff={s?.tick.t ?? 0}
            norwegian={norwegian}
          />
        )}
        {issue && (
          <p role="alert" className="rr-issue">
            {issue}
          </p>
        )}
        {tab === "learn" && (
          <>
            <label className="rr-lesson-select">
              <span>Lesson</span>
              <select
                aria-label="RR lesson"
                value={lesson.id}
                disabled={busy}
                onChange={(e) =>
                  chooseLesson(e.target.value as typeof lesson.id)
                }
              >
                {RR_LESSONS.map((l, i) => (
                  <option key={l.id} value={l.id}>
                    {norwegian
                      ? SIMPLE_NORWEGIAN[l.id].title
                      : i + 1 + ". " + l.title}
                    {progress.completed.includes(l.id) ? " · read" : ""}
                  </option>
                ))}
              </select>
            </label>
            <h3>
              {norwegian ? SIMPLE_NORWEGIAN[lesson.id].title : lesson.title}
            </h3>
            <p className="rr-lead">
              {norwegian ? SIMPLE_NORWEGIAN[lesson.id].summary : lesson.summary}
            </p>
            <ol className="rr-lesson-steps">
              {(norwegian
                ? SIMPLE_NORWEGIAN[lesson.id].steps
                : lesson.steps
              ).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {lesson.id === "candles" && (
              <details className="rr-evidence">
                <summary>
                  {t(
                    "More: sweep and break illustration",
                    "Mer: illustrasjon av sweep og brudd",
                  )}
                </summary>
                <CandleExample />
              </details>
            )}
            {(lesson.id === "risk" || lesson.id === "management") && (
              <PartialExample />
            )}
            <div className="rr-exercise-prompt">
              <b>{t("Try it on the chart", "Prøv på charten")}</b>
              <p>
                {norwegian
                  ? SIMPLE_NORWEGIAN[lesson.id].exercise
                  : lesson.exercise}
              </p>
              <button
                className="rr-primary"
                disabled={!s || busy}
                onClick={() => {
                  setTab("practice");
                  pick(false);
                }}
              >
                {t("Open practice", "Åpne Øv")} <ChevronRight size={13} />
              </button>
            </div>
            <details className="rr-evidence">
              <summary>Sources & limits</summary>
              <p>{lesson.boundary}</p>
              {lesson.sources.map((source, index) => (
                <button
                  key={source.url}
                  disabled={busy}
                  onClick={() =>
                    void run({
                      type: "study.source",
                      lesson: lesson.id,
                      index,
                    }).catch(() => {})
                  }
                >
                  {source.title}
                  <ArrowUpRight size={12} />
                </button>
              ))}
              <small>
                Sources open in your browser. Based on the saved review of 11 RR
                recordings; captions and selected chart frames, not an exact
                strategy clone.
              </small>
            </details>
            <div className="rr-lesson-actions">
              <button
                disabled={busy}
                className="rr-secondary"
                onClick={() =>
                  void run({
                    type: "study.progress",
                    value: {
                      selected: lesson.id,
                      completed: progress.completed.includes(lesson.id)
                        ? progress.completed.filter((id) => id !== lesson.id)
                        : [...progress.completed, lesson.id],
                    },
                  }).catch(() => {})
                }
              >
                <Check size={12} />
                {progress.completed.includes(lesson.id)
                  ? "Mark unread"
                  : "Mark read"}
              </button>
              <button
                disabled={busy || lesson.id === RR_LESSONS.at(-1)!.id}
                onClick={() => {
                  const index = RR_LESSONS.findIndex((l) => l.id === lesson.id);
                  chooseLesson(RR_LESSONS[index + 1].id);
                }}
              >
                Next lesson <ChevronRight size={12} />
              </button>
            </div>
          </>
        )}
        {tab === "practice" && (
          <>
            <details className="rr-beginner-guide" open>
              <summary>
                {t("Start here · step", "Start her · steg")}{" "}
                {range ? (active ? (reviewedC3 ? 4 : 3) : 2) : 1}{" "}
                {t("of 4", "av 4")}
              </summary>
              <p>
                {t(
                  "Practise one candle at a time. This exercise does not place a trade.",
                  "Øv på én candle av gangen. Her lager du en idé. Øvelsen plasserer ingen trade.",
                )}
              </p>
              <ol>
                <li>
                  <b>
                    {t(
                      "Pick two finished candles.",
                      "Velg to ferdige candles.",
                    )}
                  </b>{" "}
                  {t(
                    "C1 is first, C2 follows it, C3 is the candle to predict.",
                    "C1 er første candle, C2 er den etter. C3 er den neste du prøver å forutse.",
                  )}
                </li>
                <li>
                  <b>{t("Write your idea.", "Skriv ideen din.")}</b>{" "}
                  {t(
                    "Will price rise, fall, or should you wait? Say where and what would prove you wrong.",
                    "Tror du prisen vil opp eller ned, eller vil du vente? Skriv hvor den kan gå og hva som ville gjort ideen feil.",
                  )}
                </li>
                <li>
                  <b>{t("Save, then reveal.", "Lagre, så vis resultatet.")}</b>{" "}
                  {t(
                    "Save before showing the next candle.",
                    "Lagre før du viser resultatet av neste candle.",
                  )}
                </li>
                <li>
                  <b>{t("Look back.", "Se tilbake.")}</b>{" "}
                  {t(
                    "Compare your idea with what happened. A win does not automatically mean a good plan.",
                    "Sammenlign ideen med det som skjedde. Gevinst betyr ikke automatisk at planen var god.",
                  )}
                </li>
              </ol>
            </details>
            <details className="rr-glossary">
              <summary>
                {t("What do these words mean?", "Flere ord forklart")}
              </summary>
              <dl>
                <dt>Candle</dt>
                <dd>
                  One bar on the chart. Its body shows where price started and
                  finished. Thin lines (wicks) show the highest and lowest
                  prices.
                </dd>
                <dt>Timeframe</dt>
                <dd>
                  How much time one candle covers. M15 = 15 minutes; H1 = one
                  hour; H4 = four hours.
                </dd>
                <dt>Sweep / rejection</dt>
                <dd>
                  Price briefly goes past an earlier high or low, then finishes
                  back inside that candle's range.
                </dd>
                <dt>Break</dt>
                <dd>
                  A finished candle closes outside an earlier high or low. A
                  wick alone is not a confirmed break.
                </dd>
                <dt>Confirmation</dt>
                <dd>The thing you want to see before you would enter.</dd>
                <dt>Invalidation / stop loss</dt>
                <dd>
                  The price or event that proves your idea wrong / the level
                  where a trade would close to limit loss.
                </dd>
                <dt>Target / R</dt>
                <dd>
                  Your target is where you hope price will go. One R is the
                  amount you originally risk; two R is twice that amount.
                </dd>
              </dl>
            </details>
            <div className="rr-context-controls">
              <span>{t("Zoom out for direction", "Zoom ut for å se mer")}</span>
              <div>
                <button
                  disabled={!s || busy}
                  onClick={() =>
                    void run({ type: "study.context", value: "context" }).catch(
                      () => {},
                    )
                  }
                >
                  H4 / H1
                </button>
                <button
                  disabled={!s || busy}
                  onClick={() =>
                    void run({ type: "study.context", value: "entry" }).catch(
                      () => {},
                    )
                  }
                >
                  H1 / M15
                </button>
              </div>
            </div>
            <div className="rr-range-tools">
              <label>
                <span>{t("Time per candle", "Tid per candle")}</span>
                <select
                  aria-label="Study timeframe"
                  value={tf}
                  onChange={(e) => setTF(e.target.value as RRTimeframe)}
                >
                  {RR_TIMEFRAMES.map((frame) => (
                    <option key={frame}>{frame}</option>
                  ))}
                </select>
              </label>
              <button
                className="rr-primary"
                disabled={!s || busy}
                onClick={() => void chooseLatest().catch(() => {})}
              >
                <RotateCcw size={12} />
                {range
                  ? t("Choose another pair", "Velg et annet par")
                  : t(
                      "1. Pick two finished candles",
                      "1. Velg to ferdige candles",
                    )}
              </button>
            </div>
            <div className="rr-range-utilities">
              <button
                className={picking ? "active" : ""}
                disabled={!s || busy}
                onClick={() => {
                  if (!s) return;
                  setIssue("");
                  if (picking) {
                    pick(false);
                    return;
                  }
                  const ready =
                    s.layout.timeframe === tf
                      ? Promise.resolve()
                      : run({
                          type: "ui",
                          value: {
                            layout: {
                              ...s.layout,
                              timeframe: tf as TF,
                              range: undefined,
                            },
                          },
                        });
                  void ready.then(() => pick(true)).catch(() => {});
                }}
              >
                <Crosshair size={12} />
                {picking
                  ? t("Cancel pick", "Avbryt valg")
                  : t("Pick first candle (C1)", "Velg første candle (C1)")}
              </button>
              {range && (
                <>
                  <button onClick={focusRange}>
                    <Crosshair size={12} />
                    Focus range
                  </button>
                  <button
                    aria-label={
                      study?.overlay
                        ? "Hide study overlay"
                        : "Show study overlay"
                    }
                    disabled={busy}
                    onClick={() =>
                      void run({
                        type: "study.overlay",
                        value: !study?.overlay,
                      }).catch(() => {})
                    }
                  >
                    {study?.overlay ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                </>
              )}
            </div>
            {picking && (
              <p className="rr-pick-hint">
                Click a finished candle on the chart. It becomes C1 (first). The
                next finished candle becomes C2 (second). Press Esc to cancel.
              </p>
            )}
            {!range ? (
              <div className="rr-start-hint">
                <h3>Read two closed candles</h3>
                <p>
                  Start with the button above. You will see two finished
                  candles, then make a prediction about the next one.
                </p>
                <small>
                  Existing drawings and the strategy notebook are kept.
                </small>
              </div>
            ) : (
              <>
                <div className="rr-range-summary">
                  <span>
                    {range.timeframe} ·{" "}
                    {s && clock(range.c1.time * 1000, s.layout.timezone)}
                  </span>
                  <b title={RR_PATTERN_LABELS[range.pattern]}>
                    {norwegian
                      ? {
                          "break-up": "C2 sluttet over toppen av C1",
                          "break-down": "C2 sluttet under bunnen av C1",
                          "sweep-high":
                            "Prisen gikk over toppen av C1, men sluttet innenfor",
                          "sweep-low":
                            "Prisen gikk under bunnen av C1, men sluttet innenfor",
                          "two-sided":
                            "Prisen gikk utenfor begge sider av C1 · uklart bilde",
                          boundary: "C2 sluttet nøyaktig på kanten av C1",
                          inside: "C2 holdt seg innenfor C1",
                        }[range.pattern]
                      : {
                          "break-up":
                            "Second candle finished above the first candle's high",
                          "break-down":
                            "Second candle finished below the first candle's low",
                          "sweep-high":
                            "Price pushed above the first candle, then finished back inside",
                          "sweep-low":
                            "Price pushed below the first candle, then finished back inside",
                          "two-sided":
                            "Price crossed both sides of the first candle · mixed picture",
                          boundary:
                            "Second candle finished exactly on the first candle's edge",
                          inside:
                            "Second candle stayed inside the first candle's range",
                        }[range.pattern]}
                  </b>
                  <dl>
                    <dt>
                      {t("First candle · highest price", "C1 · høyeste pris")}
                    </dt>
                    <dd>{price(range.c1.high)}</dd>
                    <dt>
                      {t("First candle · lowest price", "C1 · laveste pris")}
                    </dt>
                    <dd>{price(range.c1.low)}</dd>
                    <dt>
                      {t("Second candle · finished at", "C2 · sluttpris")}
                    </dt>
                    <dd>{price(range.c2.close)}</dd>
                  </dl>
                  <small>
                    {t(
                      "This describes the two candles. It is not a buy or sell signal by itself.",
                      "Dette beskriver bare to candles. Det er ingen kjøps- eller salgssignal alene.",
                    )}
                  </small>
                </div>
                {!active ? (
                  <div className="rr-plan-form">
                    <h3>
                      {t(
                        "2. What could the next candle do?",
                        "2. Hva tror du neste candle vil gjøre?",
                      )}
                    </h3>
                    <label>
                      <span>{t("My prediction", "Min idé")}</span>
                      <select
                        aria-label="Study decision"
                        value={plan.decision}
                        onChange={(e) =>
                          changePlan({
                            ...plan,
                            decision: e.target.value as RRPlan["decision"],
                          })
                        }
                      >
                        <option value="skip">
                          {t("Skip / wait", "Vent / stå over")}
                        </option>
                        <option value="long">
                          {t(
                            "Buy idea · price rises",
                            "Kjøpsidé · prisen går opp",
                          )}
                        </option>
                        <option value="short">
                          {t(
                            "Sell idea · price falls",
                            "Salgsidé · prisen går ned",
                          )}
                        </option>
                      </select>
                    </label>
                    <label>
                      <span>
                        {t("Where could price go?", "Hvor kan prisen gå?")}{" "}
                        {plan.decision === "skip"
                          ? t("· optional", "· valgfritt")
                          : ""}
                      </span>
                      <input
                        aria-label="Study objective"
                        value={plan.objective}
                        maxLength={2000}
                        placeholder={t(
                          "For example: back to the first candle’s low",
                          "For eksempel: tilbake til bunnen av C1",
                        )}
                        onChange={(e) =>
                          changePlan({ ...plan, objective: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>
                        {t(
                          "What would prove me wrong?",
                          "Hva ville gjort ideen feil?",
                        )}{" "}
                        {plan.decision === "skip" ? "· optional" : ""}
                      </span>
                      <input
                        aria-label="Study invalidation"
                        value={plan.invalidation}
                        maxLength={2000}
                        placeholder={t(
                          "For example: a candle finishes above the first candle’s high",
                          "For eksempel: en ferdig candle slutter over toppen av C1",
                        )}
                        onChange={(e) =>
                          changePlan({ ...plan, invalidation: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>
                        {plan.decision === "skip"
                          ? t("Why am I waiting?", "Hvorfor vil jeg vente?")
                          : t(
                              "What must happen before I would enter?",
                              "Hva vil jeg se før jeg går inn?",
                            )}
                      </span>
                      <textarea
                        aria-label="Study confirmation"
                        rows={3}
                        maxLength={4000}
                        value={plan.confirmation}
                        placeholder={t(
                          "For example: price returns inside the range and a candle closes lower",
                          "For eksempel: prisen kommer tilbake innenfor C1 og en candle slutter lavere",
                        )}
                        onChange={(e) =>
                          changePlan({ ...plan, confirmation: e.target.value })
                        }
                      />
                    </label>
                    <button
                      className="rr-primary"
                      disabled={
                        busy ||
                        !plan.confirmation.trim() ||
                        (plan.decision !== "skip" &&
                          (!plan.objective.trim() || !plan.invalidation.trim()))
                      }
                      onClick={() => void savePlan().catch(() => {})}
                    >
                      <Lock size={12} />
                      Save my prediction
                    </button>
                    <small>
                      Saves an exercise. Use the order ticket separately to
                      place a paper trade.
                    </small>
                    {view?.c3Closed ? (
                      <small className="rr-exposure">
                        C3 is already closed: this will be labeled Review only.
                      </small>
                    ) : view?.c3 ? (
                      <small className="rr-exposure">
                        C3 is developing. Its already-visible prices will be
                        recorded with your plan.
                      </small>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <SavedPlan
                      attempt={active}
                      zone={s!.layout.timezone}
                      norwegian={norwegian}
                    />
                    {!reviewedC3 ? (
                      <div className="rr-reveal">
                        <p>
                          Your prediction is saved. Show the next candle’s
                          result, then compare it with your idea.
                        </p>
                        <button
                          className="rr-primary"
                          disabled={busy}
                          onClick={() =>
                            void run({
                              type: "study.reveal",
                              id: active.id,
                              cursor: s!.broker.seq,
                            }).catch(() => {})
                          }
                        >
                          <Play size={12} />
                          {busy
                            ? t("Revealing…", "Viser…")
                            : t(
                                "3. Show next candle’s result (C3)",
                                "3. Vis resultatet av neste candle (C3)",
                              )}
                        </button>
                        {s!.broker.pending.length + s!.broker.positions.length >
                          0 && (
                          <small>
                            Advances replay; your existing paper orders remain
                            active.
                          </small>
                        )}
                        {view?.coverage === "missing" && (
                          <small>
                            Complete C3 data is unavailable at this cursor. An
                            unknown gap cannot be filled in.
                          </small>
                        )}
                      </div>
                    ) : (
                      <div className="rr-review-form">
                        <h3>
                          {t(
                            "4. What actually happened?",
                            "4. Hva skjedde egentlig?",
                          )}
                        </h3>
                        <p>{rrC3Description(reviewedC3, range.c1)}</p>
                        <small>
                          Open {price(reviewedC3.open)} · Close{" "}
                          {price(reviewedC3.close)}
                        </small>
                        <label>
                          <span>
                            {t("What did you learn?", "Hva lærte du?")}
                          </span>
                          <textarea
                            aria-label="Study reflection"
                            rows={4}
                            maxLength={6000}
                            placeholder="Did the evidence support the original plan?"
                            value={reflection}
                            onChange={(e) => {
                              setReflection(e.target.value);
                              setSaved(false);
                            }}
                          />
                        </label>
                        <button
                          className="rr-primary"
                          disabled={busy || !reflection.trim()}
                          onClick={() => void saveReview().catch(() => {})}
                        >
                          <Check size={12} />
                          {saved
                            ? t("Review saved", "Tilbakeblikk lagret")
                            : t("Save review", "Lagre tilbakeblikk")}
                        </button>
                        <small>
                          One candle is an observation, not a profit score.
                        </small>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
        {tab === "review" && (
          <>
            <h3>Saved exercises</h3>
            <p className="rr-lead">
              Your original idea and what was visible when it was saved stay
              attached to each exercise.
            </p>
            {!attempts.length ? (
              <p>
                Save your first plan in Practice. It will appear here, including
                Skip decisions.
              </p>
            ) : (
              <>
                <label className="rr-lesson-select">
                  <span>Exercise · {attempts.length} saved</span>
                  <select
                    aria-label="Saved study exercise"
                    value={historic?.id}
                    onChange={(e) => setHistoryId(e.target.value)}
                  >
                    {[...attempts].reverse().map((a, i) => (
                      <option key={a.id} value={a.id}>
                        {attempts.length - i}.{" "}
                        {clock(a.committedAt, s!.layout.timezone)} ·{" "}
                        {a.plan.decision}
                        {a.review ? " · reviewed" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {historic && (
                  <>
                    <div className="rr-range-summary">
                      <b>{RR_PATTERN_LABELS[historic.range.pattern]}</b>
                      <span>
                        {historic.range.timeframe} ·{" "}
                        {
                          RR_LESSONS.find((l) => l.id === historic.lesson)
                            ?.title
                        }
                      </span>
                    </div>
                    <SavedPlan attempt={historic} zone={s!.layout.timezone} />
                    {historic.review && historic.review.savedAt <= s!.tick.t ? (
                      <div className="rr-saved-reflection">
                        <h3>Your reflection</h3>
                        <p>{historic.review.reflection}</p>
                        <small>
                          {rrC3Description(
                            historic.review.c3,
                            historic.range.c1,
                          )}
                        </small>
                      </div>
                    ) : (
                      <p>This exercise has no saved review yet.</p>
                    )}
                    <button
                      className="rr-secondary"
                      disabled={busy}
                      onClick={() =>
                        void run({ type: "study.attempt", id: historic.id })
                          .then(() => setTab("practice"))
                          .catch(() => {})
                      }
                    >
                      Open on chart <ChevronRight size={12} />
                    </button>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
      <footer>Source-linked lessons · your own practice rules</footer>
    </section>
  );
}
