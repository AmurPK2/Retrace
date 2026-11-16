import { useState } from "react";
import { BookOpen, Flag, CheckCircle2 } from "lucide-react";
import type { AppState } from "../types";
import { CHALLENGES } from "../core/challenges";
import { ChallengePanel } from "./ChallengePanel";
import { VideoGuides } from "./VideoGuides";
import { WorkspaceHelp } from "./WorkspaceHelp";

export function LearningHub({
  state,
  initial = "4h",
  call,
  showChart,
}: {
  state: AppState;
  initial?: "4h" | "challenges" | "help";
  call: (command: any) => Promise<any>;
  showChart: (timeframe: "4H" | "15m") => void;
}) {
  const [section, setSection] = useState(initial),
    [issue, setIssue] = useState(""),
    [busy, setBusy] = useState(false);
  const learning = state.session?.learning;
  const attempts = learning ? [...learning.history, learning.active] : [];
  const completed = new Set(
    attempts.filter((a) => a.revealedAt).map((a) => a.stage),
  );
  const start = async (stage: string) => {
    setBusy(true);
    try {
      await call({ type: "challenge.start", stage });
      setIssue("");
    } catch (e) {
      setIssue(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="learning-hub">
      <nav className="learning-tabs" aria-label="Læring">
        <button
          className={section === "4h" ? "active" : ""}
          onClick={() => setSection("4h")}
        >
          <BookOpen size={17} />
          Lær 4H
        </button>
        <button
          className={section === "challenges" ? "active" : ""}
          onClick={() => setSection("challenges")}
        >
          <Flag size={17} />
          Utfordringer
        </button>
        <button
          className={section === "help" ? "active" : ""}
          onClick={() => setSection("help")}
        >
          Hva gjør knappene?
        </button>
      </nav>
      {section === "4h" && (
        <>
          <div className="learning-intro">
            <span className="learning-eyebrow">
              START HER · 4H PÅ EN ENKEL MÅTE
            </span>
            <h3>Én stor candle. Fire timer med prisbevegelse.</h3>
            <p>
              Side-candlen samler den pågående 4H-perioden ved siden av dine
              vanlige candles. Den deler chartets prisskala: samme pris ligger
              på samme høyde. Bredden kan du endre; høyden følger prisene når du
              zoomer.
            </p>
          </div>
          <div className="learning-first-actions">
            <VideoGuides norwegian initial={2} label="Se 4H-videoen" />
            <button
              className="primary"
              onClick={() => {
                setSection("challenges");
                void start("frames");
              }}
            >
              Prøv en 4H-utfordring
            </button>
          </div>
          <ol className="learning-steps">
            <li>
              <b>Les kroppen og vekene.</b>
              <p>
                O er åpningen. C er prisen nå, helt til perioden er ferdig. H og
                L er høyeste og laveste observerte pris. Kroppen går fra O til
                C; vekene viser resten.
              </p>
            </li>
            <li>
              <b>Se den samme perioden på 15 minutter.</b>
              <p>
                En hel 4H-periode rommer 16 perioder på 15 minutter. De små
                candlene viser hvordan den store utvikler seg. Markedspauser og
                datagap kan gi færre faktiske candles.
              </p>
              <button onClick={() => showChart("15m")}>
                Vis 15m og side-candlen
              </button>
            </li>
            <li>
              <b>Skill pågående fra ferdig.</b>
              <p>
                «Pågående» betyr at high, low og close fortsatt kan endres.
                Nedtellingen følger replay-tiden. Space går én candle frem på
                tidsrammen du har valgt.
              </p>
            </li>
            <li>
              <b>Forstå videoens PO3-eksempel.</b>
              <p>
                Videoen viser bevegelse rundt 4H-åpningen, et utslag under
                åpningen og en retur over, fulgt av en lokal bekreftelse. Et
                tidligere 4H-high brukes som mål i eksemplet. Dette er
                observasjoner fra eksemplet, ikke en automatisk regel om SL ved
                en 4H-close.
              </p>
              <button
                className="source-link"
                onClick={() =>
                  void call({ type: "study.source", lesson: "po3", index: 0 })
                }
              >
                Kilde: JackTrades · 4:11–5:21 og 5:46–7:09
              </button>
            </li>
            <li>
              <b>C1 og C2 er en egen øvelse.</b>
              <p>
                C1 er den første candlen du peker ut, C2 den neste ferdige. «Mer
                → Velg C1/C2» lar deg markere paret. Veke utenfor et område og
                sluttpris utenfor er ulike observasjoner. Beskriv regelen du vil
                teste før du avslører neste candle.
              </p>
            </li>
          </ol>
          <aside className="learning-note">
            <b>Hvorfor kan toppen være utenfor bildet?</b>
            <p>
              Du kan ha zoomet inn på en liten del av 4H-området. Trykk «Vis
              hele 4H-candlen» under indikatoren for å utvide chartets
              prisskala. Vanlige ordre- og panelhandlinger endrer ikke
              utsnittet.
            </p>
          </aside>
          <VideoGuides norwegian label="Alle seks videoguidene" />
        </>
      )}
      {section === "challenges" && (
        <>
          <div className="learning-intro">
            <span className="learning-eyebrow">
              ØV MED PRISENE I DENNE ØKTEN
            </span>
            <h3>Utfordringer som bygger på hverandre</h3>
            <p>
              Start i din vanlige økt. Svaret og candledataene låses før neste
              candle vises. Du får en faktasjekk og AI-veiledning om
              begrunnelsen din.
            </p>
          </div>
          <div className="learning-progress">
            <span>
              {completed.size} av {CHALLENGES.length} oppgavetyper gjennomført
            </span>
            <progress value={completed.size} max={CHALLENGES.length} />
            <small>
              {attempts.filter((a) => a.answer).length} lagrede svar · vurdering
              og resultat holdes adskilt
            </small>
          </div>
          {learning && !learning.active.endedAt && (
            <section className="learning-active">
              <ChallengePanel
                key={learning.active.id}
                learning={learning}
                call={call}
                aiEnabled={
                  state.settings.enabled && state.settings.profile !== "gaming"
                }
              />
            </section>
          )}
          <details
            className="challenge-catalog"
            open={!learning || !!learning.active.endedAt}
          >
            <summary>
              {learning
                ? "Velg en annen oppgave"
                : "Velg din første utfordring"}
            </summary>
            <p>Et tidligere forsøk bevares når du bytter oppgave.</p>
            <div className="challenge-cards">
              {CHALLENGES.map(([id, title, , description], i) => (
                <button
                  key={id}
                  disabled={busy || !state.session}
                  onClick={() => void start(id)}
                  aria-label={"Start utfordring: " + title}
                >
                  <span>
                    {completed.has(id) ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>
                  <b>{title}</b>
                  <small>{description}</small>
                </button>
              ))}
            </div>
          </details>
          {learning && learning.history.some((a) => a.answer) && (
            <details className="challenge-catalog">
              <summary>Se tidligere svar og veiledning</summary>
              {learning.history
                .filter((a) => a.answer)
                .slice()
                .reverse()
                .map((a) => (
                  <details className="learning-active" key={a.id}>
                    <summary>
                      {CHALLENGES.find((c) => c[0] === a.stage)?.[1]} ·{" "}
                      {new Date(a.cutoff).toLocaleString("nb-NO", {
                        timeZone: "Europe/Oslo",
                      })}
                    </summary>
                    <blockquote>{a.answer?.reason}</blockquote>
                    {a.feedback && (
                      <>
                        <b>Dette var bra</b>
                        <p>{a.feedback.good}</p>
                        <b>Dette kan forbedres</b>
                        <p>{a.feedback.improve}</p>
                        <b>Neste steg</b>
                        <p>{a.feedback.next}</p>
                      </>
                    )}
                    {a.checks
                      ?.filter((c) => c.pass !== null)
                      .map((c, i) => (
                        <p key={i}>
                          {c.pass ? "Oppfylt" : "Prøv igjen"}: {c.detail}
                        </p>
                      ))}
                  </details>
                ))}
            </details>
          )}
          {!state.session && (
            <p>Åpne en økt først, så kan oppgavene bruke ekte candledata.</p>
          )}
          {issue && <p role="alert">{issue}</p>}
        </>
      )}
      {section === "help" && <WorkspaceHelp />}
    </div>
  );
}
