import { useState } from "react";
import { PALETTES, type Appearance } from "../core/appearance";
export function AppearanceSettings({
  value,
  save,
}: {
  value: Appearance;
  save: (value: Appearance) => Promise<unknown>;
}) {
  const [look, setLook] = useState(value),
    [message, setMessage] = useState("");
  return (
    <section className="settings-section appearance-settings">
      <h3>Appearance</h3>
      <div className="palette-presets">
        {Object.entries(PALETTES).map(([key, p]) => (
          <button
            key={key}
            className={look.preset === key ? "selected" : ""}
            onClick={() =>
              setLook({ ...look, preset: key as Appearance["preset"] })
            }
            style={{
              background: p.bg,
              color: p.text,
              borderColor: look.preset === key ? p.accent : p.line,
            }}
          >
            <span className="palette-bars">
              <i
                style={{ background: p.up, border: `1px solid ${p.borderUp}` }}
              />
              <i style={{ background: p.down }} />
              <i
                style={{ background: p.up, border: `1px solid ${p.borderUp}` }}
              />
            </span>
            {p.name}
          </button>
        ))}
      </div>
      <div className="settings-grid">
        {(
          [
            ["panelOpacity", "Panels", 20, 100],
            ["zoneOpacity", "SL/TP zones", 0, 70],
            ["gridOpacity", "Grid", 0, 100],
            ["labelOpacity", "Labels", 30, 100],
          ] as const
        ).map(([key, label, min, max]) => (
          <label className="field" key={key}>
            <span>
              {label} · {look[key]}%
            </span>
            <input
              type="range"
              min={min}
              max={max}
              value={look[key]}
              onChange={(e) => setLook({ ...look, [key]: +e.target.value })}
            />
          </label>
        ))}
      </div>
      <label className="checklist-row">
        <input
          type="checkbox"
          checked={look.minimal}
          onChange={(e) => setLook({ ...look, minimal: e.target.checked })}
        />
        Minimal layout
      </label>
      <label className="checklist-row">
        <input
          type="checkbox"
          checked={look.graphOrders}
          onChange={(e) => setLook({ ...look, graphOrders: e.target.checked })}
        />
        Place and drag order levels on the chart
      </label>
      <div className="modal-actions">
        <label className="field">
          <span>Magnet</span>
          <select
            value={look.magnet ?? "weak"}
            onChange={(e) =>
              setLook({
                ...look,
                magnet: e.target.value as Appearance["magnet"],
              })
            }
          >
            <option value="off">Off</option>
            <option value="weak">Weak</option>
            <option value="strong">Strong</option>
          </select>
        </label>
        <button
          className="primary"
          onClick={() =>
            void save(look)
              .then(() => setMessage("Saved"))
              .catch((e) => setMessage(String(e)))
          }
        >
          Apply appearance
        </button>
        <small>{message}</small>
      </div>
    </section>
  );
}
