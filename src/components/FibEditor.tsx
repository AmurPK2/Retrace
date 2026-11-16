import { useState, useRef } from "react";
import type { Drawing } from "../types";
const colors = [
  "#e6e6e6",
  "#65b8df",
  "#5dd995",
  "#ffd080",
  "#ff9b4a",
  "#cf96f0",
  "#e6e6e6",
];
export function FibEditor({
  drawing: initial,
  change: persist,
}: {
  drawing: Drawing;
  change: (p: Partial<Drawing>) => void;
}) {
  const [drawing, setDrawing] = useState(initial);
  const latest = useRef(initial);
  const change = (patch: Partial<Drawing>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setDrawing(next);
    persist(next);
  };
  const [name, setName] = useState("Mitt retracement"),
    [presets, setPresets] = useState<Record<string, Partial<Drawing>>>(() => {
      try {
        return JSON.parse(
          localStorage.getItem("retrace:fib-presets:v1") ?? "{}",
        );
      } catch {
        return {};
      }
    });
  const styles = drawing.fibStyles ?? {};
  const style = (level: number, index: number) =>
    styles[String(level)] ?? {
      color: colors[index % colors.length],
      label: String(level),
      visible: true,
      style: "dashed" as const,
    };
  return (
    <div className="fib-editor">
      <p>
        0 er første anker, 1 er andre. Nivåene er tegnehjelp, ikke verifiserte
        strategiregler.
      </p>
      <label>
        <input
          type="checkbox"
          checked={drawing.fibFill ?? true}
          onChange={(e) => change({ fibFill: e.target.checked })}
        />
        Fyll sonene mellom synlige nivåer
      </label>
      <div className="fib-column-labels" aria-hidden="true">
        <span>Nivå</span>
        <span>Etikett</span>
        <span>Farge</span>
        <span>Linje</span>
        <span>Vis</span>
      </div>
      {drawing.levels.map((level, i) => {
        const v = style(level, i);
        return (
          <div className="fib-row" key={i}>
            <input
              key={"value:" + level}
              aria-label={"Level " + i}
              type="number"
              step=".001"
              defaultValue={level}
              onBlur={(e) => {
                const n = +e.target.value;
                if (
                  Number.isFinite(n) &&
                  n >= -10 &&
                  n <= 10 &&
                  !drawing.levels.includes(n)
                ) {
                  const levels = [...drawing.levels];
                  levels[i] = n;
                  change({ levels, fibStyles: { ...styles, [String(n)]: v } });
                }
              }}
            />
            <input
              key={"label:" + v.label}
              aria-label={"Level label " + i}
              defaultValue={v.label}
              onBlur={(e) =>
                change({
                  fibStyles: {
                    ...styles,
                    [String(level)]: { ...v, label: e.target.value },
                  },
                })
              }
            />
            <input
              aria-label={"Level color " + i}
              type="color"
              value={v.color}
              onChange={(e) =>
                change({
                  fibStyles: {
                    ...styles,
                    [String(level)]: { ...v, color: e.target.value },
                  },
                })
              }
            />
            <select
              aria-label={"Level line " + i}
              value={v.style}
              onChange={(e) =>
                change({
                  fibStyles: {
                    ...styles,
                    [String(level)]: { ...v, style: e.target.value as any },
                  },
                })
              }
            >
              <option value="solid">Heltrukket</option>
              <option value="dashed">Stiplet</option>
              <option value="dotted">Prikket</option>
            </select>
            <input
              aria-label={"Level visible " + i}
              type="checkbox"
              checked={v.visible}
              onChange={(e) =>
                change({
                  fibStyles: {
                    ...styles,
                    [String(level)]: { ...v, visible: e.target.checked },
                  },
                })
              }
            />
          </div>
        );
      })}
      <label>
        Alle nivåverdier (kommaseparert)
        <input
          aria-label="Alle Fibonacci-nivåer"
          key={drawing.levels.join(",")}
          defaultValue={drawing.levels.join(", ")}
          onBlur={(e) => {
            const levels = e.target.value
              .split(",")
              .map((x) => Number(x.trim()));
            if (
              levels.length &&
              levels.length <= 20 &&
              levels.every((n) => Number.isFinite(n) && n >= -10 && n <= 10)
            )
              change({ levels: [...new Set(levels)] });
          }}
        />
      </label>
      <button onClick={() => change({ a: drawing.b, b: drawing.a })}>
        Bytt ankerretning
      </button>
      <button
        onClick={() => change({ levels: [0, 0.5, 0.618, 1], fibStyles: {} })}
      >
        Enkel standard · forslag
      </button>
      <label>
        Navn på oppsett
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button
        onClick={() => {
          if (!name.trim()) return;
          const p = {
            ...presets,
            [name.trim()]: {
              levels: drawing.levels,
              fibStyles: styles,
              fibFill: drawing.fibFill,
            },
          };
          localStorage.setItem("retrace:fib-presets:v1", JSON.stringify(p));
          setPresets(p);
        }}
      >
        Lagre oppsett
      </button>
      <select
        aria-label="Velg Fibonacci-oppsett"
        value=""
        onChange={(e) => change(presets[e.target.value])}
      >
        <option value="" disabled>
          Velg lagret oppsett
        </option>
        {Object.keys(presets).map((n) => (
          <option key={n}>{n}</option>
        ))}
      </select>
    </div>
  );
}
