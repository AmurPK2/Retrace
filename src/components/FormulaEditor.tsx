import { useState } from "react";
import type { Indicator, Bar } from "../types";
import { FORMULA_PRESETS, calculateFormula } from "../core/formulas";
export function FormulaEditor({
  indicators,
  bars,
}: {
  indicators: Indicator[];
  bars: Bar[];
}) {
  const [id, setId] = useState(""),
    [name, setName] = useState("My EMA"),
    [pane, setPane] = useState<"price" | "separate">("price"),
    [code, setCode] = useState(FORMULA_PRESETS[0].code),
    [message, setMessage] = useState("");
  const preview = () => {
    const plots = calculateFormula(code, bars);
    return `${plots.length} plot · ${plots.reduce((n, p) => n + p.values.length, 0)} calculated values`;
  };
  const save = async () => {
    try {
      const status = preview();
      const item: Indicator = {
        id: id || crypto.randomUUID(),
        kind: "custom",
        name: name.trim() || "My indicator",
        script: code,
        pane,
        period: 20,
        color: "#64b5f6",
        enabled: true,
      };
      const next = id
        ? indicators.map((i) => (i.id === id ? item : i))
        : [...indicators, item];
      await window.replay.call({ type: "indicators", value: next });
      setId(item.id);
      setMessage("Saved · " + status);
    } catch (e) {
      setMessage(String(e));
    }
  };
  return (
    <details className="formula-editor">
      <summary>
        Custom indicators <span>ƒx</span>
      </summary>
      <div className="field-row">
        <label className="field">
          <span>Open / new</span>
          <select
            value={id}
            onChange={(e) => {
              const i = indicators.find((i) => i.id === e.target.value);
              setId(e.target.value);
              if (i) {
                setName(i.name ?? "My indicator");
                setCode(i.script ?? "");
                setPane(i.pane ?? "price");
              }
              setMessage("");
            }}
          >
            <option value="">New indicator</option>
            {indicators
              .filter((i) => i.kind === "custom")
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          <span>Name</span>
          <input
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Placement</span>
          <select value={pane} onChange={(e) => setPane(e.target.value as any)}>
            <option value="price">On chart</option>
            <option value="separate">Separate pane</option>
          </select>
        </label>
      </div>
      <div className="formula-presets">
        {FORMULA_PRESETS.map((p) => (
          <button
            className="quiet"
            key={p.name}
            onClick={() => {
              setId("");
              setName(p.name);
              setCode(p.code);
              setPane(p.pane);
              setMessage("");
            }}
          >
            {p.name}
          </button>
        ))}
      </div>
      <textarea
        className="code-editor"
        aria-label="Indicator code"
        spellCheck={false}
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          setMessage("");
        }}
        rows={10}
        maxLength={12000}
      />
      <div className="modal-actions">
        <button
          className="secondary-button"
          onClick={() => {
            try {
              setMessage(preview());
            } catch (e) {
              setMessage(String(e));
            }
          }}
        >
          Validate
        </button>
        <button className="primary" onClick={() => void save()}>
          Save to chart
        </button>
      </div>
      {message && <p className="formula-result">{message}</p>}
      <details className="micro">
        <summary>Language and functions</summary>
        <p>
          Formula v1: open, high, low, close, hl2, hlc3 and count (tick count).
          ta.sma, ta.ema, ta.rsi, ta.atr, ta.highest, ta.lowest, math.abs,
          math.min/max, math.sqrt. Arithmetic, comparisons, condition ? yes : no
          and close[1] for past candles. plot(expression, "Name", "#color"). Up
          to four plots. A bounded language with no full Pine Script, external
          data or order commands.
        </p>
      </details>
    </details>
  );
}
