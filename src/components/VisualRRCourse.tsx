import { INSTRUMENTS, instrumentForDataset } from "../core/instruments";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  Hand,
  RotateCcw,
  Target,
} from "lucide-react";
import type { AppState, Bar } from "../types";
import { PALETTES } from "../core/appearance";
import { RR_LESSONS } from "../core/rr-lessons";
import {
  PATTERN_NB,
  VISUAL_STEPS,
  type VisualAnswer,
  type VisualFrame,
  type VisualStep,
  type VisualView,
} from "../core/visual-course";
import "../visual-course.css";

const LESSONS: Record<
  VisualStep,
  { title: string; question: string; show: string; source: string }
> = {
  candle: {
    title: "Les candlen",
    question:
      "Trykk på C1s high, low og close. Velg delen, deretter prisen på chartet.",
    show: "Wick-spissene er ytterpunktene. Kroppen viser open–close. På oransje candles ligger close øverst på kroppen; på grå nederst.",
    source: "candles",
  },
  range: {
    title: "Finn C1 og området",
    question:
      "Velg den ferdige 4H-candlen rett før C2. Marker så dens high og low.",
    show: "Den samme C1 beholdes i dette eksemplet. De to linjene viser hele wick-til-wick-området. Dette er en fast referanse, ikke en regel om å flytte C1 hver gang.",
    source: "context",
  },
  sweep: {
    title: "Hva gjorde C2?",
    question:
      "Sammenlign C2s wicks og sluttpris med C1. Velg observasjonen som faktisk passer.",
    show: "En veke utenfor og close tilbake innenfor er en sweep/retur. Close utenfor er et sluttbrudd. En inside candle tar ingen av sidene. Begge sider tatt vises separat.",
    source: "candles",
  },
  frames: {
    title: "Se inni 4H",
    question:
      "Bytt til 15m og trykk på én candle som tilhører den markerte C2-perioden.",
    show: "Det fargede feltet er samme fire timer i begge visninger. 16 perioder på 15m passer i fire timer. Manglende candles eller pauser erstattes aldri med oppdiktede priser.",
    source: "context",
  },
  fvg: {
    title: "Se en FVG",
    question:
      "Se på de tre nummererte 15m-candlene. Finnes et wick-gap mellom 1 og 3? Velg type og marker begge grenser hvis det finnes.",
    show: "Bullish: candle 3-low ligger over candle 1-high. Bearish: candle 3-high ligger under candle 1-low. De tre candlene må være ferdige. En FVG er et prisområde, ikke et automatisk RR-signal.",
    source: "confirmation",
  },
  confirmation: {
    title: "Finn en bekreftelse",
    question:
      "Denne automatiske øvingen er trukket tilbake. Åtte tidligere candles er ikke Jakes CISD-regel. Bruk fanen RR fra originalkildene.",
    show: "Ingen oppdiktet CISD-grense vises. Se hans skille mellom nærmeste supply/demand, MSS og BOS i kildekurset.",
    source: "confirmation",
  },
  plan: {
    title: "Dra planen på chartet",
    question:
      "Fri plan: velg en hypotese og dra ENTRY, SL og TP. Prisrekkefølgen kontrolleres. Dette godkjenner ikke en RR-inngang eller en modellspesifikk stop.",
    show: "Entry er en plan, ikke en fylling. SL skal passe den valgte ugyldiggjøringen, TP trenger en begrunnelse. Her kontrolleres bare prisgeometri. Velg en dokumentert modell i kildekurset for stopbegrunnelsen. R:R vises før spread og kostnader.",
    source: "risk",
  },
  review: {
    title: "Lås, avslør og sammenlign",
    question:
      "Hva kan en senere vinner bevise om planen? Svar før du viser C3. Du må ha låst en plan eller Vent først.",
    show: "Vis deretter den faktiske neste 4H-candlen i dette historiske eksemplet. En vinner kan bryte reglene, et tap kan følge dem. Ingen prisberøring regnes automatisk som en ordre eller fylling.",
    source: "review",
  },
};
type PriceTarget =
  | "high"
  | "low"
  | "close"
  | "gapHigh"
  | "gapLow"
  | "entry"
  | "sl"
  | "tp"
  | "candle";

function LessonChart({
  view,
  frame,
  answer,
  setAnswer,
  target,
  setTarget,
  palette,
  locked,
}: {
  view: VisualView;
  frame: VisualFrame;
  answer: VisualAnswer;
  setAnswer: (a: VisualAnswer) => void;
  target: PriceTarget;
  setTarget: (t: PriceTarget) => void;
  palette: (typeof PALETTES)[keyof typeof PALETTES];
  locked: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null),
    drag = useRef<PriceTarget | null>(null);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    price: number;
    bar: Bar;
  } | null>(null);
  const bars = view.frames[frame],
    { c1, c2 } = view.reference;
  const guided = !!view.key,
    plan = view.step === "plan";
  const values = bars.flatMap((b) => [b.high, b.low]);
  if (plan)
    for (const p of [answer.entry, answer.sl, answer.tp])
      if (p !== undefined) values.push(p);
  if (!values.length)
    return (
      <div className="visual-no-data">
        Ingen verifiserte {frame}-candles ved dette tidspunktet. Velg en annen
        tidsramme eller et nyere eksempel.
      </div>
    );
  const bottom = Math.min(...values),
    top = Math.max(...values),
    pad = Math.max((top - bottom) * 0.15, 0.1),
    lo = bottom - pad,
    hi = top + pad;
  const left = 28,
    right = 750,
    yTop = 44,
    yBottom = 402,
    spacing = (right - left) / Math.max(1, bars.length),
    width = Math.max(2, Math.min(30, spacing * 0.62));
  const x = (time: number) =>
    left +
    (Math.max(
      0,
      bars.findIndex((b) => b.time >= time),
    ) +
      0.5) *
      spacing;
  const y = (p: number) => yBottom - ((p - lo) / (hi - lo)) * (yBottom - yTop);
  const format = (p: number) => p.toFixed(view.precision);
  const coordinates = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = svg.current!.getBoundingClientRect(),
      xx = ((e.clientX - r.left) * 900) / r.width,
      yy = ((e.clientY - r.top) * 450) / r.height;
    const bar =
      bars[
        Math.max(
          0,
          Math.min(bars.length - 1, Math.floor((xx - left) / spacing)),
        )
      ];
    let price = lo + ((yBottom - yy) / (yBottom - yTop)) * (hi - lo);
    const snap = [bar.open, bar.high, bar.low, bar.close].sort(
      (a, b) => Math.abs(y(a) - yy) - Math.abs(y(b) - yy),
    )[0];
    if (Math.abs(y(snap) - yy) < 12) price = snap;
    return {
      x: xx,
      y: y(price),
      price: Number(price.toFixed(view.precision)),
      bar,
    };
  };
  const pick = (p: ReturnType<typeof coordinates>) => {
    if (locked) return;
    if (view.step === "confirmation") {
      setAnswer({ ...answer, confirmation: p.bar.time });
      return;
    }
    if (view.step === "frames" || target === "candle") {
      setAnswer({ ...answer, candle: p.bar.time });
      if (view.step === "range") setTarget("high");
      return;
    }
    setAnswer({ ...answer, [target]: p.price });
    if (target === "high") setTarget("low");
    else if (target === "low" && view.step === "candle") setTarget("close");
    else if (target === "gapHigh") setTarget("gapLow");
  };
  const referenceLines =
    ["sweep", "frames", "confirmation", "plan", "review"].includes(view.step) ||
    (guided && ["candle", "range"].includes(view.step));
  const occupiedLabels: number[] = [];
  const line = (
    price: number,
    label: string,
    color: string,
    dash = "5 5",
    handle?: PriceTarget,
  ) => {
    const actualY = y(price);
    const labelY =
      [0, 28, -28, 56, -56, 84, -84, 112, -112]
        .map((offset) => Math.max(54, Math.min(390, actualY + offset)))
        .find((value) =>
          occupiedLabels.every((previous) => Math.abs(previous - value) >= 26),
        ) ?? Math.max(54, Math.min(390, actualY));
    occupiedLabels.push(labelY);
    return (
      <g key={label}>
        <line
          x1={left}
          x2={right + 5}
          y1={y(price)}
          y2={y(price)}
          stroke={color}
          strokeDasharray={dash}
          strokeWidth={1.3}
        />
        {handle && (
          <line
            data-visual-handle={handle}
            role="button"
            aria-label={"Dra " + label}
            tabIndex={locked ? -1 : 0}
            x1={left}
            x2={right}
            y1={y(price)}
            y2={y(price)}
            stroke="transparent"
            strokeWidth={18}
            style={{ cursor: locked ? "default" : "ns-resize" }}
            onPointerDown={(e) => {
              if (locked) return;
              e.stopPropagation();
              drag.current = handle;
              svg.current?.setPointerCapture(e.pointerId);
            }}
            onKeyDown={(e) => {
              if (locked || !["ArrowUp", "ArrowDown"].includes(e.key)) return;
              e.preventDefault();
              setAnswer({
                ...answer,
                [handle]: Number(
                  (
                    price +
                    ((e.key === "ArrowUp" ? 1 : -1) * (hi - lo)) / 100
                  ).toFixed(view.precision),
                ),
              });
            }}
          />
        )}
        {Math.abs(labelY - actualY) > 2 && (
          <line
            x1={right}
            x2={right + 7}
            y1={actualY}
            y2={labelY}
            stroke={color}
          />
        )}
        <rect
          x={right + 7}
          y={labelY - 12}
          width={137}
          height={24}
          rx={4}
          fill={palette.panel}
          stroke={color}
        />
        <text x={right + 14} y={labelY + 4} fill={color} fontSize={11}>
          {label} {format(price)}
        </text>
      </g>
    );
  };
  return (
    <svg
      ref={svg}
      viewBox="0 0 900 450"
      className="visual-chart"
      aria-label={"Interaktivt " + frame + " læringschart"}
      onPointerMove={(e) => {
        const p = coordinates(e);
        setHover(p);
        if (drag.current && !locked)
          setAnswer({ ...answer, [drag.current]: p.price });
      }}
      onPointerLeave={() => setHover(null)}
      onPointerDown={(e) => {
        if (!(e.target as Element).closest("[data-visual-handle]"))
          pick(coordinates(e));
      }}
      onPointerUp={(e) => {
        if (drag.current && svg.current?.hasPointerCapture(e.pointerId))
          svg.current.releasePointerCapture(e.pointerId);
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <rect width={900} height={450} fill={palette.bg} rx={10} />
      {Array.from({ length: 6 }, (_, i) => {
        const p = lo + ((hi - lo) * i) / 5;
        return (
          <g key={i}>
            <line
              x1={left}
              x2={right}
              y1={y(p)}
              y2={y(p)}
              stroke={palette.line}
            />
            <text
              x={right + 11}
              y={y(p) + 4}
              fill={palette.muted}
              fontSize={10}
            >
              {format(p)}
            </text>
          </g>
        );
      })}
      <text x={left} y={23} fill={palette.text} fontSize={12}>
        {INSTRUMENTS[instrumentForDataset(view.dataset)].symbol} · {frame} ·
        ekte historiske bid-priser · UTC
      </text>
      {view.step === "frames" &&
        (() => {
          const first = bars.findIndex((b) => b.time >= c2.time),
            last = bars.findLastIndex((b) => b.time < c2.time + 14400);
          return first < 0 || last < 0 ? null : (
            <g>
              <rect
                x={left + first * spacing}
                y={33}
                width={(last - first + 1) * spacing}
                height={375}
                fill={palette.accent}
                opacity={0.09}
              />
              <text
                x={left + first * spacing + 5}
                y={43}
                fill={palette.accent}
                fontSize={11}
              >
                Samme C2-periode · 4 timer
              </text>
            </g>
          );
        })()}
      {bars.map((b, i) => {
        const xx = left + (i + 0.5) * spacing,
          up = b.close >= b.open,
          color = up ? palette.up : palette.down;
        const ref =
          b.time === c1.time
            ? "C1"
            : b.time === c2.time
              ? "C2"
              : view.c3?.time === b.time
                ? "C3 · avslørt"
                : "";
        const gapIndex =
          view.step === "fvg" ? (view.gap?.times.indexOf(b.time) ?? -1) : -1;
        const selected =
          answer.candle === b.time ||
          answer.confirmation === b.time ||
          (view.guided &&
            view.step === "confirmation" &&
            view.key?.confirmation === b.time);
        const focus =
          (frame === "4H" &&
            b.time === c1.time &&
            ["candle", "range"].includes(view.step)) ||
          gapIndex >= 0 ||
          selected;
        return (
          <g
            key={b.time}
            data-visual-candle={b.time}
            role="button"
            tabIndex={locked ? -1 : 0}
            aria-label={new Date(b.time * 1000).toISOString() + " candle"}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !locked) {
                e.preventDefault();
                pick({ x: xx, y: y(b.close), price: b.close, bar: b });
              }
            }}
          >
            <title>
              {new Date(b.time * 1000).toISOString()} · O {format(b.open)} H{" "}
              {format(b.high)} L {format(b.low)} C {format(b.close)}
            </title>
            {b.gapBefore && (
              <line
                x1={xx - spacing / 2}
                x2={xx - spacing / 2}
                y1={36}
                y2={410}
                stroke="#e6b05b"
                strokeDasharray="2 5"
              />
            )}
            {focus && (
              <rect
                x={xx - spacing * 0.46}
                y={36}
                width={spacing * 0.92}
                height={374}
                rx={3}
                fill={palette.accent}
                opacity={selected ? 0.19 : 0.065}
              />
            )}
            <line
              x1={xx}
              x2={xx}
              y1={y(b.high)}
              y2={y(b.low)}
              stroke={color}
              strokeWidth={1.3}
            />
            <rect
              x={xx - width / 2}
              y={Math.min(y(b.open), y(b.close))}
              width={width}
              height={Math.max(1.5, Math.abs(y(b.open) - y(b.close)))}
              fill={color}
              stroke={up ? palette.borderUp : palette.borderDown}
            />
            {ref &&
              frame === "4H" &&
              (view.step !== "range" || guided || ref !== "C1") && (
                <text
                  x={xx}
                  y={Math.max(50, y(b.high) - 15)}
                  textAnchor="middle"
                  fill={palette.accent}
                  fontSize={12}
                  fontWeight={600}
                >
                  {ref}
                </text>
              )}
            {gapIndex >= 0 && (
              <text
                x={xx}
                y={Math.max(55, y(b.high) - 13)}
                textAnchor="middle"
                fill={palette.accent}
                fontSize={15}
                fontWeight={700}
              >
                {gapIndex + 1}
              </text>
            )}
            {(i % Math.max(1, Math.ceil(bars.length / 6)) === 0 ||
              i === bars.length - 1) && (
              <text
                x={xx}
                y={430}
                textAnchor="middle"
                fill={palette.muted}
                fontSize={10}
              >
                {new Date(b.time * 1000)
                  .toISOString()
                  .slice(frame === "4H" ? 5 : 11, frame === "4H" ? 16 : 16)
                  .replace("T", " ")}
              </text>
            )}
          </g>
        );
      })}
      {referenceLines && line(c1.high, "C1-high", palette.muted)}
      {referenceLines && line(c1.low, "C1-low", palette.muted)}
      {plan && c2.low < c1.low && line(c2.low, "Parets low", "#ef6b72", "2 5")}
      {plan &&
        c2.high > c1.high &&
        line(c2.high, "Parets high", "#ef6b72", "2 5")}
      {view.step === "sweep" &&
        guided &&
        line(c2.close, "C2-close", "#66c7b5", "2 4")}
      {view.step === "fvg" &&
        guided &&
        view.gap?.high !== undefined &&
        line(view.gap.high, "FVG-topp", palette.accent)}
      {view.step === "fvg" &&
        guided &&
        view.gap?.low !== undefined &&
        line(view.gap.low, "FVG-bunn", palette.accent)}
      {guided &&
        view.step === "candle" &&
        line(c1.close, "Close", "#66c7b5", "2 4")}
      {view.step === "confirmation" &&
        view.confirmation.level !== null &&
        line(view.confirmation.level, "Øvingsnivå", "#66c7b5")}
      {view.step === "fvg" &&
        guided &&
        view.gap?.high !== undefined &&
        view.gap.low !== undefined && (
          <rect
            x={x(view.gap.times[0]) - spacing / 2}
            y={y(view.gap.high)}
            width={Math.max(spacing * 3, right - x(view.gap.times[0]))}
            height={Math.max(2, y(view.gap.low) - y(view.gap.high))}
            fill={palette.accent}
            fillOpacity={0.15}
            stroke={palette.accent}
          />
        )}
      {(["high", "low", "close", "gapHigh", "gapLow"] as const).map((key) =>
        answer[key] !== undefined
          ? line(
              answer[key]!,
              {
                high: "Din high",
                low: "Din low",
                close: "Din close",
                gapHigh: "Din FVG-topp",
                gapLow: "Din FVG-bunn",
              }[key],
              "#66c7b5",
              "2 5",
            )
          : null,
      )}
      {plan &&
        (["entry", "sl", "tp"] as const).map((key) =>
          answer[key] !== undefined
            ? line(
                answer[key]!,
                key.toUpperCase(),
                key === "sl"
                  ? "#ef6b72"
                  : key === "tp"
                    ? "#66c7b5"
                    : palette.accent,
                "",
                key,
              )
            : null,
        )}
      {hover && !locked && (
        <g pointerEvents="none">
          <line
            x1={left}
            x2={right}
            y1={hover.y}
            y2={hover.y}
            stroke={palette.muted}
            strokeDasharray="2 3"
          />
          <circle cx={hover.x} cy={hover.y} r={4} fill={palette.accent} />
          <text x={left + 7} y={393} fill={palette.text} fontSize={11}>
            {format(hover.price)} ·{" "}
            {new Date(hover.bar.time * 1000).toISOString().slice(11, 16)} UTC
          </text>
        </g>
      )}
    </svg>
  );
}

export function VisualRRCourse({
  state,
  call,
}: {
  state: AppState;
  call: (c: any) => Promise<any>;
}) {
  const [view, setView] = useState<VisualView | null>(null),
    [issue, setIssue] = useState(""),
    [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<VisualAnswer>({}),
    [frame, setFrame] = useState<VisualFrame>("4H"),
    [target, setTarget] = useState<PriceTarget>("high");
  const sessionId = state.session?.id;
  useEffect(() => {
    let active = true;
    setView(null);
    if (!sessionId) return;
    call({ type: "visual.open" })
      .then((v) => {
        if (active) {
          setView(v);
          setIssue("");
        }
      })
      .catch((e) => {
        if (active) setIssue(String(e));
      });
    return () => {
      active = false;
    };
  }, [sessionId, state.session?.dataset, call]);
  const run = async (command: Record<string, unknown>) => {
    setBusy(true);
    setIssue("");
    try {
      setView(
        await call({
          type: "visual.action",
          snapshotId: view?.snapshotId,
          ...command,
        }),
      );
    } catch (e) {
      setIssue(String(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!view) return;
    setAnswer(
      view.last?.answer ??
        (view.step === "plan" && view.key
          ? {
              decision: view.key.decision,
              entry: view.key.entry,
              sl: view.key.sl,
              tp: view.key.tp,
            }
          : {}),
    );
    setFrame(
      ["frames", "fvg", "confirmation"].includes(view.step) ? "15m" : "4H",
    );
    setTarget(
      view.step === "range"
        ? "candle"
        : view.step === "fvg"
          ? "gapHigh"
          : view.step === "plan"
            ? "entry"
            : "high",
    );
  }, [
    view?.snapshotId,
    view?.caseTime,
    view?.step,
    view?.guided,
    view?.last?.id,
  ]);
  if (!sessionId)
    return (
      <section className="visual-empty">
        <h3>RR · se og gjør</h3>
        <p>
          Åpne en økt med ekte historiske priser først. Øvingen bruker en egen,
          fryst visning av historikken.
        </p>
      </section>
    );
  if (!view)
    return (
      <section className="visual-empty">
        <h3>RR · se og gjør</h3>
        <p role="status">{issue || "Henter verifiserte candles …"}</p>
        <button
          onClick={() =>
            void call({ type: "visual.open" })
              .then(setView)
              .catch((e) => setIssue(String(e)))
          }
        >
          Prøv igjen
        </button>
      </section>
    );
  const lesson = LESSONS[view.step],
    index = VISUAL_STEPS.indexOf(view.step),
    locked = !!view.last;
  const passed = new Set(
    view.history
      .filter((a) => !a.guided && a.checks.every((c) => c.pass))
      .map((a) => a.step),
  );
  const source =
    view.step === "fvg"
      ? {
          id: "fvg",
          boundary:
            "FVG er et generelt prisbegrep. Øvingen gjør det ikke til et obligatorisk eller tilstrekkelig RR-signal.",
          sources: [
            {
              title: "ICT · Fair Value Gaps og struktur · episode 6",
              url: "https://www.youtube.com/watch?v=Bkt8B3kLATQ",
            },
          ],
        }
      : RR_LESSONS.find((l) => l.id === lesson.source)!;
  const risk =
    answer.entry !== undefined && answer.sl !== undefined
      ? Math.abs(answer.entry - answer.sl)
      : 0;
  const rr =
    risk && answer.tp !== undefined && answer.entry !== undefined
      ? Math.abs(answer.tp - answer.entry) / risk
      : null;
  const setStep = (step: VisualStep) =>
    void run({ action: "step", value: step });
  const choosePrice = (key: PriceTarget, label: string) => (
    <button
      key={key}
      aria-pressed={target === key}
      disabled={locked}
      onClick={() => setTarget(key)}
    >
      {label}
      {typeof answer[key as keyof VisualAnswer] === "number"
        ? " · " +
          Number(answer[key as keyof VisualAnswer]).toFixed(view.precision)
        : " · trykk på chartet"}
    </button>
  );
  return (
    <section className="visual-course" aria-label="Visuell RR-øving">
      <header className="visual-heading">
        <div>
          <span className="learning-eyebrow">RR · SE OG GJØR</span>
          <h3>Lær på candlene.</h3>
          <p>
            Se et eksempel. Marker selv. Få forklaringen der bevegelsen skjer.
          </p>
        </div>
        <span className="visual-progress">
          <b>{passed.size}/8</b> faktasjekket i «Prøv selv»
        </span>
      </header>
      <div className="visual-toolbar">
        <div className="visual-mode" role="group" aria-label="Øvingsmodus">
          <button
            aria-pressed={view.guided}
            disabled={busy}
            onClick={() => void run({ action: "mode", value: true })}
          >
            <Eye size={15} /> Vis meg
          </button>
          <button
            aria-pressed={!view.guided}
            disabled={busy}
            onClick={() => void run({ action: "mode", value: false })}
          >
            <Hand size={15} /> Prøv selv
          </button>
        </div>
        <label>
          Historisk eksempel{" "}
          <select
            aria-label="Visuelt eksempel"
            disabled={busy}
            value={view.caseTime}
            onChange={(e) =>
              void run({ action: "case", value: Number(e.target.value) })
            }
          >
            {view.cases.map((c, i) => (
              <option key={c.time} value={c.time}>
                {i + 1} ·{" "}
                {new Date(c.time * 1000)
                  .toISOString()
                  .slice(5, 16)
                  .replace("T", " ")}{" "}
                UTC
              </option>
            ))}
          </select>
        </label>
      </div>
      <nav className="visual-steps" aria-label="Visuelle RR-trinn">
        {VISUAL_STEPS.map((step, i) => (
          <button
            key={step}
            aria-current={step === view.step ? "step" : undefined}
            disabled={busy}
            onClick={() => setStep(step)}
          >
            <span>{passed.has(step) ? <Check size={14} /> : i + 1}</span>
            {LESSONS[step].title}
          </button>
        ))}
      </nav>
      <div className="visual-workbench">
        <div className="visual-canvas-area">
          <div className="visual-chart-toolbar">
            <div role="group" aria-label="Læringstidsramme">
              {(["4H", "15m", "1m"] as const).map((tf) => (
                <button
                  key={tf}
                  aria-pressed={frame === tf}
                  onClick={() => setFrame(tf)}
                >
                  {tf}
                </button>
              ))}
            </div>
            <span>
              {new Date(view.cutoff)
                .toISOString()
                .slice(0, 16)
                .replace("T", " ")}{" "}
              UTC · beslutningsgrense
            </span>
          </div>
          <LessonChart
            view={view}
            frame={frame}
            answer={answer}
            setAnswer={setAnswer}
            target={target}
            setTarget={setTarget}
            palette={PALETTES[state.appearance.preset]}
            locked={locked}
          />
          <div className="visual-chart-caption">
            <span>
              {view.dataset.startsWith("dukascopy")
                ? "Dukascopy"
                : "Importert historikk"}{" "}
              · {view.revealed ? "C3 er avslørt" : "C3 skjult"}
            </span>
            <span>Øvingsvisning · replay og ordre flyttes ikke</span>
          </div>
        </div>
        <aside className="visual-task">
          <span className="visual-kicker">
            TRINN {index + 1} / 8 · {view.guided ? "VIS MEG" : "PRØV SELV"}
          </span>
          <h4>{lesson.title}</h4>
          <p className="visual-question">{lesson.question}</p>
          {view.guided && (
            <div className="visual-explanation">
              <Eye size={15} />
              <p>
                {lesson.show}
                {view.step === "sweep" && view.key?.classification
                  ? " Dette paret: " +
                    PATTERN_NB[
                      view.key.classification as keyof typeof PATTERN_NB
                    ] +
                    "."
                  : ""}
              </p>
            </div>
          )}
          <div className="visual-controls">
            {view.step === "candle" &&
              (["high", "low", "close"] as const).map((k) =>
                choosePrice(k, k.toUpperCase()),
              )}
            {view.step === "range" && (
              <>
                {choosePrice(
                  "candle",
                  answer.candle === undefined ? "Velg C1" : "C1 valgt",
                )}
                {choosePrice("high", "C1-high")}
                {choosePrice("low", "C1-low")}
              </>
            )}
            {view.step === "sweep" &&
              Object.entries(PATTERN_NB).map(([value, label]) => (
                <button
                  key={value}
                  disabled={locked}
                  aria-pressed={answer.classification === value}
                  onClick={() => setAnswer({ classification: value })}
                >
                  {label}
                </button>
              ))}
            {view.step === "frames" && (
              <p className="visual-tip">
                {frame !== "15m"
                  ? "Bytt til 15m over chartet."
                  : answer.candle
                    ? "Valgt candle: " +
                      new Date(answer.candle * 1000)
                        .toISOString()
                        .slice(11, 16) +
                      " UTC"
                    : "Trykk i den markerte firetimersperioden."}
              </p>
            )}
            {view.step === "fvg" && (
              <>
                {[
                  ["bullish", "Bullish gap"],
                  ["bearish", "Bearish gap"],
                  ["none", "Ingen FVG"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    disabled={locked}
                    aria-pressed={answer.gap === value}
                    onClick={() => setAnswer({ ...answer, gap: value })}
                  >
                    {label}
                  </button>
                ))}
                {answer.gap !== "none" && (
                  <>
                    {choosePrice("gapHigh", "Øvre grense")}
                    {choosePrice("gapLow", "Nedre grense")}
                  </>
                )}
              </>
            )}
            {view.step === "confirmation" && (
              <>
                <p className="visual-tip">
                  {view.confirmation.level === null
                    ? "Ingen entydig retning i dette paret. Ingen universell bekreftelse antas."
                    : "Vent på en ferdig 15m-close " +
                      (view.confirmation.direction === "buy"
                        ? "over "
                        : "under ") +
                      view.confirmation.level.toFixed(view.precision)}
                  {typeof answer.confirmation === "number"
                    ? " · valgt " +
                      new Date(answer.confirmation * 1000)
                        .toISOString()
                        .slice(11, 16) +
                      " UTC"
                    : ""}
                </p>
                <button
                  disabled={locked}
                  aria-pressed={answer.confirmation === "none"}
                  onClick={() => setAnswer({ confirmation: "none" })}
                >
                  Ingen slik stenging
                </button>
              </>
            )}
            {view.step === "plan" && (
              <>
                <div className="visual-mode">
                  {(
                    [
                      ["buy", "Kjøpshypotese"],
                      ["sell", "Salgshypotese"],
                      ["wait", "Vent"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      disabled={locked}
                      aria-pressed={answer.decision === value}
                      onClick={() => {
                        const { c1, c2 } = view.reference,
                          span =
                            Math.max(c1.high, c2.high) -
                            Math.min(c1.low, c2.low),
                          sign = value === "sell" ? -1 : 1;
                        setAnswer({
                          decision: value,
                          entry: c2.close,
                          sl: c2.close - sign * span * 0.45,
                          tp: c2.close + sign * span * 0.9,
                        });
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {answer.decision && answer.decision !== "wait" && (
                  <>
                    <p className="visual-tip">
                      Dra de tre linjene. Forhåndsutfylte nivåer er
                      startpunkter, ikke et anbefalt oppsett.
                    </p>
                    {(["entry", "sl", "tp"] as const).map((k) => (
                      <label key={k}>
                        {k.toUpperCase()}
                        <input
                          aria-label={"Visuell " + k.toUpperCase()}
                          type="number"
                          step={10 ** -view.precision}
                          disabled={locked}
                          value={answer[k] ?? ""}
                          onChange={(e) =>
                            setAnswer({
                              ...answer,
                              [k]:
                                e.target.value === ""
                                  ? undefined
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    ))}
                    <p className="visual-tip">
                      Planlagt R:R {rr === null ? "—" : rr.toFixed(2)} · før
                      spread/kostnader. Ingen ordre legges inn.
                    </p>
                  </>
                )}
              </>
            )}
            {view.step === "review" && (
              <>
                {[
                  ["result", "En vinner beviser at inngangen var riktig"],
                  [
                    "decision",
                    "Resultat og regeloppfyllelse må vurderes hver for seg",
                  ],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    disabled={locked}
                    aria-pressed={answer.classification === value}
                    onClick={() => setAnswer({ classification: value })}
                  >
                    {label}
                  </button>
                ))}
              </>
            )}
          </div>
          {["candle", "range", "fvg"].includes(view.step) && !locked && (
            <details className="visual-source">
              <summary>Presist prisvalg (valgfritt)</summary>
              {(view.step === "fvg"
                ? (["gapHigh", "gapLow"] as const)
                : view.step === "range"
                  ? (["high", "low"] as const)
                  : (["high", "low", "close"] as const)
              ).map((key) => (
                <label key={key}>
                  {key}
                  <input
                    aria-label={"Presis " + key}
                    type="number"
                    step={10 ** -view.precision}
                    value={answer[key] ?? ""}
                    onChange={(e) =>
                      setAnswer({
                        ...answer,
                        [key]:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                  />
                </label>
              ))}
            </details>
          )}
          {!locked ? (
            <button
              className="primary visual-submit"
              disabled={busy}
              onClick={() => void run({ action: "commit", value: answer })}
            >
              <Target size={15} /> Lås og vis forklaringen
            </button>
          ) : (
            <div className="visual-feedback" role="status">
              <b>
                {view.last!.checks.every((c) => c.pass)
                  ? "Faktasjekken er oppfylt"
                  : "Se hva som må endres"}
                {view.last!.guided ? " · med veiledning" : ""}
              </b>
              {view.last!.checks.map((c, i) => (
                <p key={i} className={c.pass ? "met" : "revisit"}>
                  {c.pass ? "✓ " : "↳ "}
                  {c.text}
                </p>
              ))}
              <button
                disabled={busy}
                onClick={() => void run({ action: "retry" })}
              >
                <RotateCcw size={14} /> Prøv samme oppgave igjen
              </button>
            </div>
          )}
          {view.step === "review" && (
            <>
              <button
                className="primary"
                disabled={busy || !locked || !view.canReveal || view.revealed}
                onClick={() => void run({ action: "reveal" })}
              >
                {view.revealed ? "C3 er vist på chartet" : "Vis faktisk C3"}
              </button>
              {!view.canReveal && (
                <p className="visual-tip">
                  Lås en plan eller Vent i trinn 7 først. C3 må finnes som
                  ferdig historikk.
                </p>
              )}
              {view.c3 && (
                <p className="visual-tip">
                  C3 O {view.c3.open.toFixed(view.precision)} · H{" "}
                  {view.c3.high.toFixed(view.precision)} · L{" "}
                  {view.c3.low.toFixed(view.precision)} · C{" "}
                  {view.c3.close.toFixed(view.precision)}. Dette dokumenterer en
                  candle, ingen antatt fylling.
                </p>
              )}
            </>
          )}
          <details className="visual-source">
            <summary>RR-kilde og avgrensning</summary>
            <p>{source.boundary}</p>
            {source.sources.map((s, i) => (
              <button
                key={s.url}
                onClick={() =>
                  void call({
                    type: "study.source",
                    lesson: source.id,
                    index: i,
                  }).catch((e) => setIssue(String(e)))
                }
              >
                {s.title}
              </button>
            ))}
            <p>
              Original øving på RR-byggesteiner. PO3 er en egen variant. Dette
              er ikke en verifisert komplett kopi av alle RR-inngangsmodeller.
            </p>
          </details>
        </aside>
      </div>
      {issue && (
        <p role="alert" className="visual-error">
          {issue}
        </p>
      )}
      <footer className="visual-footer">
        <button
          disabled={busy || !index}
          onClick={() => setStep(VISUAL_STEPS[index - 1])}
        >
          <ArrowLeft size={14} /> Forrige
        </button>
        <p>
          Faktasjekket er ikke det samme som dokumentert tradingmestring. «Vis
          meg» teller separat.
        </p>
        <button
          disabled={busy || index === VISUAL_STEPS.length - 1}
          onClick={() => setStep(VISUAL_STEPS[index + 1])}
        >
          Neste trinn <ArrowRight size={14} />
        </button>
      </footer>
      <details className="visual-history">
        <summary>Dine visuelle forsøk · {view.history.length}</summary>
        {view.history
          .slice()
          .reverse()
          .map((a) => (
            <div key={a.id}>
              <b>
                {LESSONS[a.step].title} · {a.guided ? "veiledet" : "prøv selv"}
              </b>
              <p>
                {new Date(a.caseTime * 1000).toISOString()} ·{" "}
                {a.checks.every((c) => c.pass)
                  ? "faktasjekk oppfylt"
                  : "prøv igjen"}
              </p>
            </div>
          ))}
      </details>
    </section>
  );
}
