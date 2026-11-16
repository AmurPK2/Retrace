import { useState } from "react";
import {
  CHALLENGES,
  type ChallengeAnswer,
  type Learning,
} from "../core/challenges";
export function ChallengePanel({
  learning,
  call,
  aiEnabled,
}: {
  learning: Learning;
  call: (c: any) => Promise<any>;
  aiEnabled: boolean;
}) {
  const c = learning.active,
    nb = learning.language === "nb",
    def = CHALLENGES.find((x) => x[0] === c.stage)!;
  const [answer, setAnswer] = useState<ChallengeAnswer>(
      c.answer ?? { reason: "", decision: "wait" },
    ),
    [issue, setIssue] = useState(""),
    [busy, setBusy] = useState(false);
  const run = async (command: any) => {
    setBusy(true);
    try {
      await call(command);
      if (command.type === "challenge.commit" && aiEnabled)
        await call({ type: "challenge.feedback", id: c.id });
      setIssue("");
    } catch (e) {
      setIssue(String(e));
    } finally {
      setBusy(false);
    }
  };
  const text = (n: string, e: string) => (nb ? n : e);
  const number = (key: keyof ChallengeAnswer, label: string) => (
    <label className="field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        step={key === "lots" ? c.specs.lotStep : 10 ** -c.specs.precision}
        value={answer[key] ?? ""}
        onChange={(e) =>
          setAnswer({
            ...answer,
            [key]: e.target.value === "" ? undefined : +e.target.value,
          })
        }
      />
    </label>
  );
  const plans = ["invalidation", "risk", "two"].includes(c.stage);
  const last = c.htf.filter((b) => (b.time + 14400) * 1000 <= c.cutoff).at(-1);
  return (
    <div className="challenge-panel">
      <div className="challenge-heading">
        <b>
          {CHALLENGES.findIndex((x) => x[0] === c.stage) + 1} / 10 ·{" "}
          {def[nb ? 1 : 2]}
        </b>
        <select
          aria-label="Challenge language"
          value={learning.language}
          onChange={(e) =>
            run({ type: "challenge.language", value: e.target.value })
          }
        >
          <option value="nb">Norsk</option>
          <option value="en">English</option>
        </select>
      </div>
      <p>{def[nb ? 3 : 4]}</p>
      <button onClick={() => void run({ type: "challenge.end" })}>
        {text(
          "Tilbake til fri øving · behold forsøket",
          "Return to free practice · keep attempt",
        )}
      </button>
      <p className="micro">
        {text("Låst start: ", "Locked start: ")}
        {new Date(c.cutoff).toISOString()} · {c.dataset} · {c.version}
      </p>
      <details>
        <summary>
          {text("Synlige candledata", "Visible candle evidence")}
        </summary>
        <p>
          {text(
            "Candlene under er ferdige. Gjeldende 4H vises som Forming på charten.",
            "Candles below are completed. The current 4H is marked Forming on the chart.",
          )}
        </p>
        {c.htf
          .filter((b) => (b.time + 14400) * 1000 <= c.cutoff)
          .slice(-2)
          .map((b, i) => (
            <p key={b.time}>
              {i === 0 ? "C1" : "C2"} · {new Date(b.time * 1000).toISOString()}{" "}
              · O {b.open} · H {b.high} · L {b.low} · C {b.close}
            </p>
          ))}
      </details>
      {!c.answer ? (
        <>
          <div className="challenge-fields">
            {["candles", "frames", "level"].includes(c.stage) &&
              number(
                "value",
                text(
                  c.stage === "frames" ? "Antall perioder" : "Pris",
                  c.stage === "frames" ? "Number of periods" : "Price",
                ),
              )}
            {["pair", "compare"].includes(c.stage) && (
              <label className="field">
                <span>{text("Velg observasjon", "Choose observation")}</span>
                <select
                  aria-label="Challenge classification"
                  value={answer.classification ?? ""}
                  onChange={(e) =>
                    setAnswer({ ...answer, classification: e.target.value })
                  }
                >
                  <option value="">—</option>
                  {(c.stage === "compare"
                    ? ["A", "B"]
                    : [
                        "close-above",
                        "close-below",
                        "wick",
                        "inside",
                        "missing",
                      ]
                  ).map((x) => (
                    <option key={x} value={x}>
                      {(
                        {
                          "close-above": "Slutt over C1 / Close above C1",
                          "close-below": "Slutt under C1 / Close below C1",
                          wick: "Veke utenfor / Wick outside",
                          inside: "Inne i C1 / Inside C1",
                          missing: "Historikk mangler / History missing",
                        } as Record<string, string>
                      )[x] ?? x}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(plans || c.stage === "wait") && (
              <label className="field">
                <span>{text("Beslutning", "Decision")}</span>
                <select
                  aria-label="Challenge decision"
                  value={answer.decision}
                  onChange={(e) =>
                    setAnswer({ ...answer, decision: e.target.value as any })
                  }
                >
                  <option value="wait">Vent / Wait</option>
                  <option value="buy">Kjøp / Buy</option>
                  <option value="sell">Selg / Sell</option>
                </select>
              </label>
            )}
            {plans && (
              <>
                {number("entry", "Entry 1")}
                {c.stage === "two" && number("entry2", "Entry 2")}
                {number("sl", "SL")}
                {c.stage !== "invalidation" && (
                  <>
                    {number("tp", "TP 1")}
                    {c.stage === "two" && number("tp2", "TP 2")}
                    {number(
                      "lots",
                      text("Størrelse per inngang", "Size per entry"),
                    )}
                  </>
                )}
              </>
            )}
          </div>
          {c.stage === "wait" && (
            <label className="field">
              <span>
                {text(
                  "Bekreftelsen jeg venter på",
                  "Confirmation I am waiting for",
                )}
              </span>
              <input
                aria-label="Challenge confirmation"
                value={answer.confirmation ?? ""}
                onChange={(e) =>
                  setAnswer({ ...answer, confirmation: e.target.value })
                }
              />
            </label>
          )}
          <label className="field">
            <span>{text("Min begrunnelse", "My reasoning")}</span>
            <textarea
              aria-label="Challenge reasoning"
              value={answer.reason}
              onChange={(e) => setAnswer({ ...answer, reason: e.target.value })}
            />
          </label>
          <button
            className="primary"
            disabled={busy || answer.reason.trim().length < 12}
            onClick={() =>
              run({ type: "challenge.commit", id: c.id, value: answer })
            }
          >
            {text("Lås svar og kontroller", "Lock answer and check")}
          </button>
        </>
      ) : (
        <>
          <blockquote>{c.answer.reason}</blockquote>
          {c.checks?.map((check, i) => (
            <div className="challenge-check" key={i}>
              <b>
                {check.pass === null
                  ? text("Til refleksjon", "For reflection")
                  : check.pass
                    ? text("Oppfylt", "Met")
                    : text("Prøv igjen", "Revisit")}{" "}
                · {check.label}
              </b>
              <p>{check.detail}</p>
            </div>
          ))}
          <section
            className="challenge-feedback"
            aria-label="Veiledning på svaret"
          >
            <h4>
              {c.feedback?.source === "model"
                ? text(
                    "AI-veiledning på svaret ditt",
                    "AI feedback on your answer",
                  )
                : text("Tilbakemelding på svaret", "Feedback on your answer")}
            </h4>
            {c.feedback?.status === "generating" ? (
              <p role="status">
                {text(
                  "Coachen leser det låste svaret og candledataene…",
                  "The coach is reading the locked answer and candle evidence…",
                )}{" "}
                <button onClick={() => void run({ type: "ai.cancel" })}>
                  {text("Stopp AI-vurdering", "Stop AI review")}
                </button>
              </p>
            ) : (
              c.feedback && (
                <>
                  <small>
                    {c.feedback.source === "model"
                      ? text(
                          "Lokal AI · samme informasjon som ved svaret",
                          "Local AI · only evidence available at the answer",
                        )
                      : text(
                          "Beregnet faktasjekk · AI-vurdering er separat",
                          "Computed checks · AI assessment is separate",
                        )}
                  </small>
                  <h5>{text("Dette var bra", "What went well")}</h5>
                  <p>{c.feedback.good}</p>
                  <h5>{text("Dette kan forbedres", "What to improve")}</h5>
                  <p>{c.feedback.improve}</p>
                  <h5>{text("Neste steg", "Next step")}</h5>
                  <p>{c.feedback.next}</p>
                  {c.feedback.note && <small>{c.feedback.note}</small>}
                </>
              )
            )}
            {c.feedback?.status !== "generating" && (
              <button
                disabled={busy}
                onClick={() =>
                  void (async () => {
                    try {
                      if (!aiEnabled)
                        await call({ type: "ai.toggle", value: true });
                      await run({ type: "challenge.feedback", id: c.id });
                    } catch (e) {
                      setIssue(String(e));
                    }
                  })()
                }
              >
                {aiEnabled
                  ? text(
                      "Vurder begrunnelsen med AI",
                      "Review reasoning with AI",
                    )
                  : text(
                      "Slå på AI og vurder begrunnelsen",
                      "Enable AI and review reasoning",
                    )}
              </button>
            )}
          </section>
          <p>
            {text(
              "Beslutningen vurderes fra det du visste da. Neste candle endrer ikke denne vurderingen.",
              "The decision is assessed from what you knew then. The next candle does not change this assessment.",
            )}
          </p>
          {!c.revealedAt ? (
            <button
              disabled={busy}
              onClick={() => run({ type: "challenge.reveal", id: c.id })}
            >
              {text("Vis neste candle", "Reveal next candle")}
            </button>
          ) : (
            <>
              <p className="micro">
                {text("Utførelse: ", "Execution: ")}
                {c.outcome?.status}
              </p>
              <button onClick={() => run({ type: "challenge.next" })}>
                {text(
                  "Neste utfordring / nytt forsøk",
                  "Next challenge / new attempt",
                )}
              </button>
            </>
          )}
        </>
      )}
      {issue && <p className="inline-error">{issue}</p>}
      <p className="micro">
        {learning.history.length}{" "}
        {text(
          "tidligere forsøk bevart i økten. Ingen poeng gis for gevinst.",
          "earlier attempts retained in this session. Profit earns no points.",
        )}
      </p>
    </div>
  );
}
