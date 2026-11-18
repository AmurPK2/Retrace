import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  Hand,
  Play,
  RotateCcw,
} from "lucide-react";
import {
  RR_MODULES,
  RR_RECORDINGS,
  RR_SOURCE_TASKS,
  checkRRSource,
  sourceProgressCount,
  type RRSourceAnswer,
  type RRSourceProgress,
  type SceneId,
  type SourceTask,
} from "../core/rr-source-course";
import "../rr-source-course.css";

type Candle = [number, number, number, number]; // open, high, low, close; illustration units
const SCENES: Record<SceneId, Candle[]> = {
  range: [
    [31, 40, 24, 36],
    [36, 57, 32, 52],
    [52, 70, 49, 66],
    [66, 88, 61, 79],
    [79, 82, 59, 64],
    [64, 69, 40, 47],
    [47, 55, 23, 48],
    [48, 65, 44, 60],
  ],
  sweep: [
    [30, 48, 22, 44],
    [44, 57, 40, 51],
    [45, 70, 35, 60],
    [60, 65, 20, 50],
  ],
  break: [
    [30, 48, 22, 44],
    [44, 57, 40, 51],
    [45, 70, 35, 60],
    [60, 85, 50, 80],
  ],
  inside: [
    [48, 58, 39, 52],
    [52, 63, 42, 57],
    [57, 62, 45, 50],
    [50, 59, 44, 55],
    [55, 60, 48, 51],
    [51, 58, 45, 54],
    [54, 62, 49, 59],
  ],
  quarters: [
    [42, 50, 38, 46],
    [46, 51, 40, 43],
    [43, 50, 39, 47],
    [47, 74, 42, 70],
    [70, 83, 65, 78],
    [78, 81, 55, 60],
    [60, 72, 52, 65],
  ],
  fvg: [
    [30, 40, 25, 35],
    [36, 68, 34, 63],
    [60, 82, 55, 78],
  ],
  inverse: [
    [30, 40, 25, 35],
    [36, 68, 34, 63],
    [60, 82, 55, 78],
    [78, 80, 50, 56],
    [56, 59, 27, 30],
    [30, 46, 28, 40],
  ],
  structure: [
    [72, 80, 58, 61],
    [61, 66, 38, 43],
    [43, 55, 35, 49],
    [49, 51, 24, 30],
    [30, 45, 26, 41],
    [41, 65, 38, 63],
  ],
  smt: [
    [50, 70, 45, 64],
    [64, 68, 46, 49],
    [49, 80, 47, 74],
    [74, 76, 59, 62],
  ],
  protected: [
    [72, 85, 65, 77],
    [77, 81, 55, 61],
    [61, 68, 45, 52],
    [52, 66, 48, 62],
    [62, 75, 58, 68],
    [68, 70, 35, 42],
  ],
  risk: [
    [70, 80, 65, 74],
    [74, 77, 55, 59],
    [59, 63, 48, 53],
    [53, 57, 35, 40],
  ],
  targets: [
    [30, 41, 25, 37],
    [37, 52, 34, 48],
    [48, 65, 44, 59],
    [59, 78, 55, 73],
    [73, 90, 68, 85],
  ],
  loss: [
    [62, 78, 56, 68],
    [68, 73, 48, 53],
    [53, 64, 48, 60],
    [60, 69, 54, 57],
  ],
};
const stamp = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
function SourceChart({
  task,
  answer,
  setAnswer,
  locked,
  guided,
}: {
  task: SourceTask;
  answer: RRSourceAnswer;
  setAnswer: (a: RRSourceAnswer) => void;
  locked: boolean;
  guided: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null),
    drag = useRef<string | null>(null);
  const bars = SCENES[task.scene],
    left = 40,
    right = 600,
    top = 42,
    bottom = 355;
  const y = (p: number) => bottom - (p / 100) * (bottom - top);
  const xx = (i: number) => left + ((i + 0.5) * (right - left)) / bars.length;
  const val = (id: string) =>
    answer.values?.[id] ?? (id === "sl" ? 42 : id === "high" ? 59 : 45);
  const set = (id: string, n: number) =>
    setAnswer({ ...answer, values: { ...answer.values, [id]: n } });
  const choose = (choice: string) => {
    if (!locked) setAnswer({ ...answer, choice });
  };
  const position = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = svg.current!.getBoundingClientRect();
    return Math.max(
      0,
      Math.min(
        100,
        Math.round(
          ((bottom - ((e.clientY - r.top) * 420) / r.height) / (bottom - top)) *
            100,
        ),
      ),
    );
  };
  const zone = (
    p: number,
    q: number,
    label: string,
    id = "B",
    x = left,
    w = right - left,
  ) => (
    <g
      key={label}
      onClick={() => choose(id)}
      className="rrc-zone"
      role="button"
      tabIndex={locked ? -1 : 0}
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          choose(id);
        }
      }}
    >
      <rect
        x={x}
        y={y(q)}
        width={w}
        height={y(p) - y(q)}
        rx={3}
        fill="#e5a358"
        fillOpacity={0.12}
        stroke="#b58147"
      />
      <text x={x + 9} y={y(q) + 16} fill="#f2c589" fontSize={12}>
        {label}
      </text>
    </g>
  );
  const labelSlots: number[] = [];
  const level = (p: number, label: string, color = "#b2b6b2", id?: string) => {
    const actual = y(p),
      slot =
        [0, 25, -25, 50, -50, 75, -75]
          .map((n) => Math.max(45, Math.min(359, actual + n)))
          .find((n) => labelSlots.every((old) => Math.abs(old - n) >= 23)) ??
        actual;
    labelSlots.push(slot);
    return (
      <g key={label} onClick={() => id && choose(id)}>
        <line
          x1={left}
          x2={right + 12}
          y1={y(p)}
          y2={y(p)}
          stroke={color}
          strokeDasharray="5 5"
        />
        <text x={right + 17} y={slot + 4} fill={color} fontSize={12}>
          {label}
        </text>
        {id && (
          <rect
            data-rr-target={id}
            role="button"
            aria-label={label}
            tabIndex={locked ? -1 : 0}
            x={right + 9}
            y={slot - 17}
            width={116}
            height={31}
            rx={5}
            fill="transparent"
            stroke={
              guided && task.correct === id
                ? "#80beaa"
                : answer.choice === id
                  ? "#e5a358"
                  : "transparent"
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                choose(id);
              }
            }}
          />
        )}
        {Math.abs(slot - actual) > 2 && (
          <line
            x1={right}
            x2={right + 12}
            y1={actual}
            y2={slot}
            stroke={color}
          />
        )}
      </g>
    );
  };
  return (
    <svg
      ref={svg}
      viewBox="0 0 760 420"
      className="rrc-chart"
      aria-label={"Interaktivt RR-diagram: " + task.title}
      onPointerMove={(e) => {
        if (drag.current && !locked) set(drag.current, position(e));
      }}
      onPointerUp={(e) => {
        drag.current = null;
        if (svg.current?.hasPointerCapture(e.pointerId))
          svg.current.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          drag.current = null;
        }
      }}
    >
      <rect width={760} height={420} rx={12} fill="#0d100e" />
      {[20, 40, 60, 80].map((p) => (
        <g key={p}>
          <line x1={left} x2={right} y1={y(p)} y2={y(p)} stroke="#232823" />
          <text x={13} y={y(p) + 4} fill="#858d85" fontSize={10}>
            {p}
          </text>
        </g>
      ))}
      <text x={left} y={23} fill="#a1aaa1" fontSize={11}>
        UNDERVISNINGSDIAGRAM · indeks 0–100 · illustrerte priser
      </text>
      {task.scene === "range" && zone(52, 62, "B · intern sone")}
      {task.scene === "structure" &&
        zone(49, 55, "B · lokal supply", "B", 240, 290)}
      {["fvg", "inverse"].includes(task.scene) &&
        zone(40, 55, "B · FVG-området", "B", xx(0), right - xx(0))}
      {task.scene === "protected" &&
        zone(58, 66, "Intern sone", "B", xx(2), right - xx(2))}
      {task.scene === "quarters" &&
        [0, 1, 2, 3].map((i) => (
          <g
            key={i}
            onClick={() =>
              choose(
                i === 1 || i === 2
                  ? "q23"
                  : i === 0
                    ? "q1"
                    : task.id === "quarters"
                      ? "q4"
                      : "expand",
              )
            }
          >
            <rect
              x={left + (i * (right - left)) / 4}
              y={35}
              width={(right - left) / 4}
              height={330}
              fill={["#4a7390", "#bf8f49", "#6d9d8a", "#a088b4"][i]}
              fillOpacity={0.08}
              stroke={
                task.id === "quarters" &&
                answer.choice === "q23" &&
                (i === 1 || i === 2)
                  ? "#e5a358"
                  : "transparent"
              }
            />
            <text
              x={left + 12 + (i * (right - left)) / 4}
              y={385}
              fontSize={13}
              fill="#d3d8d3"
            >
              {task.id === "phase"
                ? ["Konsolidering", "Ekspansjon", "Retracement", "Neste fase?"][
                    i
                  ]
                : "Q" + (i + 1)}
            </text>
          </g>
        ))}
      {bars.map(([o, h, l, c], i) => (
        <g
          key={i}
          className="rrc-candle"
          onClick={() => {
            if (task.id === "fvg-location")
              choose(i === 1 ? "A" : i === 2 ? "C" : "B");
          }}
        >
          <line
            x1={xx(i)}
            x2={xx(i)}
            y1={y(h)}
            y2={y(l)}
            stroke={c >= o ? "#f4a24d" : "#9ca59c"}
            strokeWidth={2}
          />
          <rect
            x={xx(i) - Math.min(18, 160 / bars.length)}
            y={y(Math.max(o, c))}
            width={Math.min(36, 320 / bars.length)}
            height={Math.max(2, Math.abs(y(o) - y(c)))}
            fill={c >= o ? "#f4a24d" : "#9ca59c"}
          />
          <text
            x={xx(i)}
            y={405}
            textAnchor="middle"
            fill="#9da59d"
            fontSize={12}
          >
            {["sweep", "break"].includes(task.scene) && i === 2
              ? "C1"
              : ["sweep", "break"].includes(task.scene) && i === 3
                ? "C2"
                : ["fvg", "inverse"].includes(task.scene) && i < 3
                  ? String(i + 1)
                  : String(i + 1)}
          </text>
        </g>
      ))}
      {task.scene === "range" && (
        <>
          {level(88, "A · ytre topp", undefined, "A")}
          {level(24, "Ytre low · tatt")}
          {level(43, "C · lokal candle", undefined, "C")}
        </>
      )}
      {["sweep", "break"].includes(task.scene) && (
        <>
          {level(70, "C1-high")}
          {level(35, "C1-low")}
          {level(task.scene === "break" ? 80 : 50, "C2-close", "#69c1ac")}
          {task.id === "c2-stop" && level(20, "C2-low", "#c8c9c8")}
        </>
      )}
      {task.scene === "inside" && (
        <>
          {level(82, "Større mål · ikke tatt")}
          {level(61, "Lokal rangetopp")}
          {level(39, "Lokal rangebunn")}
        </>
      )}
      {task.scene === "structure" && (
        <>
          {level(80, "A · større swing", undefined, "A")}
          {level(55, "B · lokal grense", undefined, "B")}
          {level(35, "C · tidligere close", undefined, "C")}
        </>
      )}
      {task.scene === "smt" && (
        <g>
          <text x={44} y={50} fill="#e5a358" fontSize={12}>
            GOLD · ny topp
          </text>
          <rect
            x={403}
            y={260}
            width={320}
            height={110}
            fill="#161c18"
            stroke="#465449"
            rx={8}
          />
          <text x={418} y={281} fill="#8ed3c1" fontSize={12}>
            SILVER · tilsvarende topp ikke tatt
          </text>
          <path
            d="M 420 345 L 465 302 L 510 343 L 555 317 L 600 345 L 655 331 L 705 352"
            fill="none"
            stroke="#8ed3c1"
            strokeWidth={2}
          />
          <line
            x1={415}
            x2={710}
            y1={302}
            y2={302}
            stroke="#7e9a8c"
            strokeDasharray="4 4"
          />
        </g>
      )}
      {task.scene === "protected" && (
        <>
          {level(85, "A · beskyttet topp", "#e5a358", "A")}
          {task.id === "layers" && level(60, "B · lavere sell", "#e5a358", "B")}
          {level(35, "Eksternt mål", "#69c1ac")}
        </>
      )}
      {task.scene === "risk" && (
        <>
          {level(80, "Bred SL · 400/lot", "#ed8c95")}
          {level(60, "Smal SL · 200/lot", "#ed8c95")}
          {level(40, "Entry", "#e5a358")}
        </>
      )}
      {task.scene === "targets" &&
        [2, 3, 4, 5].map((r, i) =>
          level(
            44 + i * 13,
            `TP${i + 1}${task.id === "weighted-r" ? " · " + r + "R" : ""}`,
            "#69c1ac",
          ),
        )}
      {task.scene === "loss" && (
        <>
          {level(78, "SL · senere truffet", "#ed8c95")}
          {level(60, "Annonsert sell", "#e5a358")}
          {level(25, "Planlagt mål", "#69c1ac")}
        </>
      )}
      {task.targets?.map((t) => (
        <g key={t.id}>
          {guided && level(t.value, "Vis meg: " + t.label, "#80beaa")}
          <line
            x1={left}
            x2={right}
            y1={y(val(t.id))}
            y2={y(val(t.id))}
            stroke="#e5a358"
            strokeWidth={2}
          />
          <g
            role="slider"
            aria-label={"Flytt " + t.label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={val(t.id)}
            tabIndex={locked ? -1 : 0}
            data-rr-handle={t.id}
            onPointerDown={(e) => {
              if (!locked) {
                drag.current = t.id;
                svg.current?.setPointerCapture(e.pointerId);
                e.preventDefault();
              }
            }}
            onKeyDown={(e) => {
              if (!locked && ["ArrowUp", "ArrowDown"].includes(e.key)) {
                e.preventDefault();
                set(
                  t.id,
                  Math.max(
                    0,
                    Math.min(100, val(t.id) + (e.key === "ArrowUp" ? 1 : -1)),
                  ),
                );
              }
            }}
          >
            <rect
              x={right + 9}
              y={y(val(t.id)) - 12}
              width={130}
              height={24}
              rx={4}
              fill="#342718"
              stroke="#e5a358"
            />
            <text
              x={right + 15}
              y={y(val(t.id)) + 4}
              fill="#ffe4be"
              fontSize={11}
            >
              {t.label} · {val(t.id)}
            </text>
          </g>
        </g>
      ))}
    </svg>
  );
}

export function RRSourceCourse({ call }: { call: (c: any) => Promise<any> }) {
  const [progress, setProgress] = useState<RRSourceProgress | null>(null),
    [answer, setAnswer] = useState<RRSourceAnswer>({}),
    [busy, setBusy] = useState(false),
    [issue, setIssue] = useState(""),
    [lockedId, setLockedId] = useState<string | null>(null);
  useEffect(() => {
    void call({ type: "rrcourse.open" })
      .then((p) => {
        setProgress(p);
        setLockedId(p.activeAttempt ?? null);
      })
      .catch((e) => setIssue(String(e)));
  }, [call]);
  const run = async (action: string, value?: unknown) => {
    setBusy(true);
    setIssue("");
    try {
      const p = await call({ type: "rrcourse.action", action, value });
      setProgress(p);
      setLockedId(p.activeAttempt ?? null);
      if (action !== "commit") setAnswer({});
    } catch (e) {
      setIssue(String(e));
    } finally {
      setBusy(false);
    }
  };
  if (!progress)
    return (
      <section className="rrc-course">
        <h3>RR · lær fra kildene</h3>
        <p>{issue || "Åpner kurset …"}</p>
      </section>
    );
  const index = RR_SOURCE_TASKS.findIndex((t) => t.id === progress.selected),
    task = RR_SOURCE_TASKS[index],
    attempt = progress.attempts.find((a) => a.id === lockedId),
    locked = !!attempt;
  const current = attempt?.answer ?? answer,
    checks = attempt ? checkRRSource(task, attempt.answer) : [],
    passed = checks.length > 0 && checks.every((c) => c.pass),
    done = sourceProgressCount(progress);
  const source = async (i: number) => {
    try {
      await call({
        type: "study.source",
        lesson: "rr-source:" + task.id,
        index: i,
      });
    } catch (e) {
      setIssue(String(e));
    }
  };
  return (
    <section className="rrc-course" aria-label="RR fra originalkildene">
      <header className="rrc-header">
        <div>
          <span className="rrc-eyebrow">
            RETRACE · RR / JAKE · KILDEBASERT KURS
          </span>
          <h2>Se regelen. Gjør oppgaven. Sjekk kilden.</h2>
          <p>
            12 tilgjengelige opptak · {RR_SOURCE_TASKS.length} oppgaver · {done}{" "}
            faktasjekket uten veiledning
          </p>
        </div>
        <div className="rrc-mode" aria-label="Veiledning">
          <button
            aria-pressed={progress.guided}
            disabled={busy}
            onClick={() => void run("mode", true)}
          >
            <Eye size={15} /> Vis meg
          </button>
          <button
            aria-pressed={!progress.guided}
            disabled={busy}
            onClick={() => void run("mode", false)}
          >
            <Hand size={15} /> Prøv selv
          </button>
        </div>
      </header>
      <progress
        value={done}
        max={RR_SOURCE_TASKS.length}
        aria-label="Faktasjekket uten veiledning"
      />
      <div className="rrc-selector">
        <label>
          Modul
          <select
            aria-label="RR-modul"
            value={task.module}
            disabled={busy}
            onChange={(e) =>
              void run(
                "select",
                RR_SOURCE_TASKS.find(
                  (t) => t.module === Number(e.target.value),
                )!.id,
              )
            }
          >
            {RR_MODULES.map((m, i) => (
              <option value={i} key={m}>
                {i + 1}. {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          Oppgave
          <select
            aria-label="RR-kildeoppgave"
            value={task.id}
            disabled={busy}
            onChange={(e) => void run("select", e.target.value)}
          >
            {RR_SOURCE_TASKS.filter((t) => t.module === task.module).map(
              (t) => (
                <option value={t.id} key={t.id}>
                  {t.title}
                </option>
              ),
            )}
          </select>
        </label>
      </div>
      <div className="rrc-layout">
        <div className="rrc-main">
          <SourceChart
            task={task}
            answer={current}
            setAnswer={setAnswer}
            locked={locked || busy}
            guided={progress.guided || locked}
          />
          <p className="rrc-caption">
            Eget undervisningsdiagram som forklarer kildens konsept. Ingen ekte
            markedspriser, tradehistorikk eller dokumentert vinner.
          </p>
          <div className="rrc-source-strip">
            <Play size={15} />
            <span>Originalforklaring</span>
            {task.refs.map((r, i) => (
              <button key={i} disabled={busy} onClick={() => void source(i)}>
                RR {r.video} · {stamp(r.at)}–{stamp(r.end)}
              </button>
            ))}
          </div>
          <details className="rrc-library">
            <summary>
              Hva kurset dekker – og hva opptakene ikke avklarer
            </summary>
            <p>
              De tilgjengelige opptakene er 1–11 og 14. Academy og Livestreams
              ble kontrollert 18. november 2026. I time 14 ved 30:18 sier Jake
              at sendingene bare viser deler av konfluensen. Kurset tilskriver
              ham ingen egne åtte-candle-, standard-SL- eller EMA-regler.
            </p>
            <p>
              Fortsatt uavklart: full rangering av soner, universelt tidsanker
              og DST, uttømmende totrinns SMT og alle terskler i hver
              inngangsvariant. «Faktasjekket» betyr at du løste den oppgitte
              oppgaven, ikke at du har bevist en lønnsom strategi eller lært
              uunderviste detaljer.
            </p>
            {RR_RECORDINGS.map((v) => (
              <p key={v[0]}>
                <b>RR {v[0]}</b> · {v[2]} ·{" "}
                {
                  RR_SOURCE_TASKS.filter((t) =>
                    t.refs.some((r) => r.video === v[0]),
                  ).length
                }{" "}
                oppgaver med kildehit
              </p>
            ))}
          </details>
        </div>
        <aside className="rrc-question">
          <span className="rrc-eyebrow">
            {index + 1} / {RR_SOURCE_TASKS.length} · {RR_MODULES[task.module]}
          </span>
          <h3>{task.title}</h3>
          <p className="rrc-question-text">{task.question}</p>
          <p className="rrc-context">{task.context}</p>
          {task.options.length > 0 && (
            <div className="rrc-options">
              {task.options.map((o) => (
                <button
                  key={o.id}
                  data-rr-choice={o.id}
                  disabled={locked || busy}
                  aria-pressed={current.choice === o.id}
                  className={
                    (progress.guided || locked) && o.id === task.correct
                      ? "rrc-hint"
                      : ""
                  }
                  onClick={() => setAnswer({ ...answer, choice: o.id })}
                >
                  {progress.guided && o.id === task.correct && (
                    <Eye size={15} />
                  )}
                  {o.label}
                </button>
              ))}
            </div>
          )}
          {task.targets && (
            <p className="rrc-context">
              Dra markørene på chartet. Du kan også fokusere en markør og bruke
              piltastene, eller skrive verdien her.
            </p>
          )}
          {(
            task.numeric ??
            task.targets?.map((t) => ({
              id: t.id,
              label: t.label,
              unit: "indeks",
              correct: t.value,
              tolerance: 2,
            }))
          )?.map((n) => (
            <label className="rrc-number" key={n.id}>
              {n.label}{" "}
              {progress.guided && (
                <small>
                  {" "}
                  · vis meg: {n.correct} {n.unit}
                </small>
              )}
              <div>
                <input
                  aria-label={n.label}
                  type="number"
                  step="any"
                  disabled={locked || busy}
                  value={current.values?.[n.id] ?? ""}
                  onChange={(e) => {
                    const values = { ...answer.values };
                    if (e.target.value === "") delete values[n.id];
                    else values[n.id] = Number(e.target.value);
                    setAnswer({ ...answer, values });
                  }}
                />
                <span>{n.unit}</span>
              </div>
            </label>
          ))}
          {!locked ? (
            <button
              className="primary rrc-submit"
              disabled={busy}
              onClick={() => void run("commit", answer)}
            >
              <Check size={16} /> Lås svar og vis begrunnelsen
            </button>
          ) : (
            <div
              className={"rrc-feedback " + (passed ? "pass" : "revisit")}
              role="status"
            >
              <b>
                {passed ? "Faktasjekken er oppfylt" : "Se hva som må endres"}
                {attempt?.guided ? " · med veiledning" : ""}
              </b>
              {checks.map((c, i) => (
                <p key={i}>
                  {c.pass ? "✓ " : "↳ "}
                  {c.text}
                </p>
              ))}
              {checks[0]?.text !== task.explanation && (
                <p>{task.explanation}</p>
              )}
              <button disabled={busy} onClick={() => void run("retry")}>
                <RotateCcw size={14} /> Prøv igjen · behold forsøket
              </button>
            </div>
          )}
          {progress.guided && !locked && (
            <div className="rrc-guide">
              <b>Vis meg</b>
              <p>{task.explanation}</p>
              <p>Bytt til Prøv selv for et forsøk uten markert svar.</p>
            </div>
          )}
          <div className="rrc-boundary">
            <b>Denne regelen gjelder her</b>
            <p>{task.limit}</p>
          </div>
        </aside>
      </div>
      {issue && (
        <p className="rrc-error" role="alert">
          {issue}
        </p>
      )}
      <footer className="rrc-footer">
        <button
          disabled={busy || index === 0}
          onClick={() => void run("select", RR_SOURCE_TASKS[index - 1].id)}
        >
          <ArrowLeft size={14} /> Forrige
        </button>
        <span>
          Forsøk lagres i profilen og følger øktbackup. Replay, ordre og
          tegninger berøres ikke.
        </span>
        <button
          disabled={busy || index === RR_SOURCE_TASKS.length - 1}
          onClick={() => void run("select", RR_SOURCE_TASKS[index + 1].id)}
        >
          Neste <ArrowRight size={14} />
        </button>
      </footer>
      <details className="rrc-library">
        <summary>
          Dine kildeoppgaver · {progress.attempts.length} forsøk
        </summary>
        {progress.attempts
          .slice()
          .reverse()
          .slice(0, 60)
          .map((a) => {
            const t = RR_SOURCE_TASKS.find((t) => t.id === a.taskId)!;
            return (
              <p key={a.id}>
                <b>{t.title}</b> · {a.guided ? "veiledet" : "prøv selv"} ·{" "}
                {checkRRSource(t, a.answer).every((c) => c.pass)
                  ? "faktasjekket"
                  : "prøv igjen"}
              </p>
            );
          })}
      </details>
    </section>
  );
}
