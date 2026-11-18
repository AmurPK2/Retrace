import { RRSourceCourse } from "./RRSourceCourse";
import { VisualRRCourse } from "./VisualRRCourse";
import { useEffect, useState } from "react";
import type { AppState } from "../types";
import {
  CHALLENGES,
  challengeProgress,
  learningProgress,
  type ChallengeId,
} from "../core/challenges";
import { FOUNDATION_LESSONS } from "../core/rr-lessons";
import { ChallengePanel } from "./ChallengePanel";
import { VideoGuides } from "./VideoGuides";
import { WorkspaceHelp } from "./WorkspaceHelp";

function WrittenLearningHub({
  state,
  initial,
  call,
  showChart,
}: {
  state: AppState;
  initial?: "4h" | "challenges" | "help";
  call: (command: any) => Promise<any>;
  showChart: (timeframe: "4H" | "15m") => void;
}) {
  const learning = state.session?.learning;
  const [language, setLanguage] = useState<"nb" | "en">(
    () =>
      learning?.language ??
      (localStorage.getItem("retrace.learning-language") === "en"
        ? "en"
        : "nb"),
  );
  const nb = language === "nb",
    t = (n: string, e: string) => (nb ? n : e);
  const [selected, setSelected] = useState<ChallengeId>(
    initial === "4h" ? "frames" : (learning?.active.stage ?? "candles"),
  );
  useEffect(() => {
    if (learning && !learning.active.endedAt)
      setSelected(learning.active.stage);
  }, [learning?.active.id]);
  const [help, setHelp] = useState(initial === "help");
  const [issue, setIssue] = useState(""),
    [busy, setBusy] = useState(false);
  const progress = learningProgress(learning),
    mastered = progress.filter((x) => x.mastered).length;
  const lesson = FOUNDATION_LESSONS.find((x) => x.stage === selected)!;
  const index = FOUNDATION_LESSONS.findIndex((x) => x.stage === selected);
  const attempts = learning ? [...learning.history, learning.active] : [];
  const start = async (stage: ChallengeId) => {
    setBusy(true);
    setIssue("");
    try {
      await call({ type: "challenge.start", stage });
      await call({ type: "challenge.language", value: language });
      setSelected(stage);
      setHelp(false);
    } catch (e) {
      setIssue(String(e));
    } finally {
      setBusy(false);
    }
  };
  const status = (p: ReturnType<typeof challengeProgress>) =>
    p.mastered
      ? t("Demonstrert mestring", "Demonstrated mastery")
      : p.factual
        ? t(
            "Fakta/form riktig · begrunnelse gjenstår",
            "Facts/form correct · reasoning pending",
          )
        : p.completed
          ? t("Svar gjennomført · prøv igjen", "Answer completed · revisit")
          : t("Forsøkt · svar ikke låst", "Attempted · answer not locked");
  return (
    <div className="learning-hub">
      <header className="learning-intro">
        <span className="learning-eyebrow">
          RETRACE · {t("LÆR OG ØV", "LEARN AND PRACTISE")}
        </span>
        <h3>
          {t(
            "Fra første candle til din egen plan",
            "From your first candle to your own plan",
          )}
        </h3>
        <p>
          {t(
            "Les ett trinn, se guiden og prøv på øktens historiske priser. Svaret låses før avsløring. Fri trening er alltid tilgjengelig.",
            "Read a step, watch its guide and practise on the session's historical prices. Lock your answer before revealing. Free practice is always available.",
          )}
        </p>
        <label>
          {t("Språk", "Language")}{" "}
          <select
            aria-label="Learning language"
            value={language}
            onChange={(e) => {
              const value = e.target.value as "nb" | "en";
              setLanguage(value);
              localStorage.setItem(
                "retrace.learning-language",
                value === "nb" ? "no" : "en",
              );
              if (learning)
                void call({ type: "challenge.language", value }).catch((e) =>
                  setIssue(String(e)),
                );
            }}
          >
            <option value="nb">Norsk</option>
            <option value="en">English</option>
          </select>
        </label>
      </header>
      <div
        className="learning-progress"
        aria-label={t("Læringsprogresjon", "Learning progress")}
      >
        <b>
          {mastered} / 10{" "}
          {t(
            "trinn med demonstrert mestring",
            "steps with demonstrated mastery",
          )}
        </b>
        <progress value={mastered} max={10} />
        <p>
          {progress.filter((x) => x.attempted).length}{" "}
          {t("forsøkt", "attempted")} ·{" "}
          {progress.filter((x) => x.completed).length}{" "}
          {t("svar gjennomført", "answers completed")} ·{" "}
          {progress.filter((x) => x.factual).length}{" "}
          {t("fakta/form riktig", "facts/form correct")}
        </p>
        <small>
          {t(
            "Forsøkt = startet. Gjennomført = svar låst. Fakta/form = kontrollerbare krav oppfylt. Mestring krever også støtte for alle begrunnelseskriterier. Avsløring, lest-markering og gevinst gir ingen mestring. AI-tolkningen kan ta feil; dette er øvingsprogresjon.",
            "Attempted = started. Completed = answer locked. Facts/form = verifiable requirements met. Mastery also requires support for every reasoning criterion. Revealing, read markers and profit earn no mastery. AI interpretation can be wrong; this is practice progress.",
          )}
        </small>
      </div>
      <nav
        className="challenge-catalog"
        aria-label={t("Ti læringstrinn", "Ten learning steps")}
      >
        <label>
          {t("Velg trinn", "Choose step")}{" "}
          <select
            aria-label="Learning step"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value as ChallengeId);
              setHelp(false);
            }}
          >
            {FOUNDATION_LESSONS.map((l, i) => (
              <option key={l.stage} value={l.stage}>
                {i + 1}. {l.title[nb ? 0 : 1]}
                {progress[i].mastered ? t(" · mestret", " · mastered") : ""}
              </option>
            ))}
          </select>
        </label>
      </nav>
      {!help && (
        <section
          className="learning-active"
          aria-label={t("Leksjon", "Lesson")}
        >
          <h3>
            {index + 1}. {lesson.title[nb ? 0 : 1]}
          </h3>
          {lesson.paragraphs.map((p, i) => (
            <p key={i}>{p[nb ? 0 : 1]}</p>
          ))}
          {selected === "frames" && (
            <>
              <button onClick={() => showChart("15m")}>
                {t(
                  "Se 15m og 4H-side-candlen",
                  "View 15m and the 4H side candle",
                )}
              </button>
              <button
                onClick={() =>
                  void call({
                    type: "study.source",
                    lesson: "po3",
                    index: 0,
                  }).catch((e) => setIssue(String(e)))
                }
              >
                {t(
                  "Kilde: PO3-eksemplet · 4:11–7:09",
                  "Source: PO3 example · 4:11–7:09",
                )}
              </button>
            </>
          )}
          <VideoGuides
            norwegian={nb}
            initial={lesson.guide}
            label={t(
              "Se guiden til dette trinnet",
              "Watch this step's guide · Norwegian",
            )}
          />
          {selected === "candles" && (
            <VideoGuides
              norwegian={nb}
              initial={0}
              label={t(
                "Ny i appen? Se arbeidsflyten først",
                "New to the app? Watch the workflow first",
              )}
            />
          )}
          <details>
            <summary>
              {t(
                "Hva skal jeg vise at jeg forstår?",
                "What understanding should I demonstrate?",
              )}
            </summary>
            <ul>
              {(nb ? lesson.criteria : lesson.criteriaEn).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </details>
          <p>{CHALLENGES[index][nb ? 3 : 4]}</p>
          <button
            className="primary"
            disabled={busy || !state.session}
            onClick={() => void start(selected)}
          >
            {t("Start oppgaven / prøv igjen", "Start exercise / try again")}
          </button>
          {!state.session && (
            <p>
              {t(
                "Åpne en økt med historiske priser først. Velg fri trening eller en utfordring når du lager økten.",
                "Open a session with historical prices first. Choose free practice or a challenge when creating it.",
              )}
            </p>
          )}
          {learning &&
            learning.active.stage === selected &&
            !learning.active.endedAt && (
              <ChallengePanel
                key={learning.active.id}
                learning={{ ...learning, language }}
                call={call}
                aiEnabled={
                  state.settings.enabled && state.settings.profile !== "gaming"
                }
              />
            )}
          <div className="learning-first-actions">
            <button
              disabled={!index}
              onClick={() => setSelected(FOUNDATION_LESSONS[index - 1].stage)}
            >
              {t("Forrige trinn", "Previous step")}
            </button>
            <button
              disabled={index === 9}
              onClick={() => setSelected(FOUNDATION_LESSONS[index + 1].stage)}
            >
              {t("Les neste trinn", "Read next step")}
            </button>
            {learning && !learning.active.endedAt && (
              <button
                onClick={() =>
                  void call({ type: "challenge.end" }).catch((e) =>
                    setIssue(String(e)),
                  )
                }
              >
                {t(
                  "Fri trening · behold historikk",
                  "Free practice · keep history",
                )}
              </button>
            )}
          </div>
        </section>
      )}
      <details className="challenge-catalog">
        <summary>
          {t("Alle forsøk og vurderinger", "All attempts and assessments")} (
          {attempts.length})
        </summary>
        {attempts
          .slice()
          .reverse()
          .map((a) => (
            <details className="learning-active" key={a.id}>
              <summary>
                {CHALLENGES.find((c) => c[0] === a.stage)?.[nb ? 1 : 2]} ·{" "}
                {status(challengeProgress(a))}
              </summary>
              <p>
                {new Date(a.cutoff).toISOString()} · {a.version}
              </p>
              <blockquote>
                {a.answer?.reason ??
                  t("Ingen låst begrunnelse", "No locked reasoning")}
              </blockquote>
              {a.checks?.map((c, i) => (
                <p key={i}>
                  {c.pass === null
                    ? t("Uklart", "Unclear")
                    : c.pass
                      ? t("Oppfylt", "Met")
                      : t("Prøv igjen", "Revisit")}
                  : {c.detail}
                </p>
              ))}
              {a.feedback && (
                <>
                  <b>{t("Støtte", "Support")}</b>
                  <p>{a.feedback.good}</p>
                  <b>{t("Feil eller mangler", "Errors or omissions")}</b>
                  <p>{a.feedback.improve}</p>
                  <b>{t("Neste steg", "Next step")}</b>
                  <p>{a.feedback.next}</p>
                </>
              )}
              <button disabled={busy} onClick={() => void start(a.stage)}>
                {t("Nytt forsøk · behold dette", "Retry · preserve this")}
              </button>
            </details>
          ))}
      </details>
      {!!state.session?.study?.attempts.length && (
        <details className="challenge-catalog">
          <summary>
            {t(
              "Tidligere C1/C2-studier · bevart historikk",
              "Earlier C1/C2 studies · preserved history",
            )}
          </summary>
          <p>
            {t(
              "Gamle lese- og studiemarkeringer er bevart. De teller ikke som demonstrert mestring i den nye stien.",
              "Earlier read and study markers are preserved. They do not count as demonstrated mastery in this path.",
            )}
          </p>
          {state.session.study.attempts
            .filter(
              (a) =>
                a.committedAt <= state.session!.tick.t &&
                a.committedSeq <= state.session!.broker.seq,
            )
            .map((a) => (
              <details key={a.id}>
                <summary>
                  {new Date(a.committedAt).toISOString()} · {a.range.timeframe}
                </summary>
                <p>
                  {a.plan.decision === "skip"
                    ? t("Vent", "Wait")
                    : a.plan.decision === "long"
                      ? t("Kjøpsidé", "Buy idea")
                      : t("Salgsidé", "Sell idea")}{" "}
                  · {a.plan.objective}
                </p>
                <p>{a.plan.invalidation}</p>
                <p>{a.plan.confirmation}</p>
                <p>{a.review?.reflection}</p>
              </details>
            ))}
        </details>
      )}
      <VideoGuides
        norwegian={nb}
        label={t(
          "Bibliotek: alle seks offline-guider",
          "Library: all six offline guides · Norwegian",
        )}
      />
      <button onClick={() => setHelp(!help)}>
        {t("Hjelp med appens knapper", "App controls · Norwegian reference")}
      </button>
      {help && <WorkspaceHelp />}
      {issue && <p role="alert">{issue}</p>}
    </div>
  );
}

export function LearningHub(props: Parameters<typeof WrittenLearningHub>[0]) {
  const [route, setRoute] = useState<"source" | "visual" | "written">(
    props.initial === "help" ? "written" : "source",
  );
  return (
    <div className="learning-shell">
      <nav className="learning-route" aria-label="Velg læringsvisning">
        <button
          aria-pressed={route === "source"}
          onClick={() => setRoute("source")}
        >
          RR fra originalkildene
        </button>
        <button
          aria-pressed={route === "visual"}
          onClick={() => setRoute("visual")}
        >
          Egen historikk · fri øving
        </button>
        <button
          aria-pressed={route === "written"}
          onClick={() => setRoute("written")}
        >
          Tekst, videoer og tidligere kurs
        </button>
      </nav>
      {route === "source" ? (
        <RRSourceCourse call={props.call} />
      ) : route === "visual" ? (
        <VisualRRCourse state={props.state} call={props.call} />
      ) : (
        <WrittenLearningHub {...props} />
      )}
    </div>
  );
}
