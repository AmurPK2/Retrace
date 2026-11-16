import { useState } from "react";
import { PALETTES, orderColors, type Appearance } from "../core/appearance";
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
      <h3>Utseende</h3>
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
            ["panelOpacity", "Paneler", 20, 100],
            ["zoneOpacity", "SL/TP-soner", 0, 70],
            ["gridOpacity", "Rutenett", 0, 100],
            ["labelOpacity", "Etiketter", 30, 100],
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
        Kompakt visning
      </label>
      <label className="checklist-row">
        <input
          type="checkbox"
          checked={look.graphOrders}
          onChange={(e) => setLook({ ...look, graphOrders: e.target.checked })}
        />
        Plasser og dra ordrenivåer i chartet
      </label>
      <div className="settings-grid">
        {(["buy", "sell", "sl", "tp"] as const).map((key) => (
          <label className="field" key={key}>
            <span>{key.toUpperCase()}-linje</span>
            <input
              type="color"
              value={
                look.orderColors?.[key] ??
                orderColors(look.preset === "lavender")[key]
              }
              onChange={(e) =>
                setLook({
                  ...look,
                  orderColors: {
                    ...orderColors(look.preset === "lavender"),
                    ...look.orderColors,
                    [key]: e.target.value,
                  },
                })
              }
            />
          </label>
        ))}
      </div>
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
            <option value="off">Av</option>
            <option value="weak">Svak</option>
            <option value="strong">Sterk</option>
          </select>
        </label>
        <button
          className="primary"
          onClick={() =>
            void save(look)
              .then(() => setMessage("Lagret"))
              .catch((e) => setMessage(String(e)))
          }
        >
          Lagre utseende
        </button>
        <small>{message}</small>
      </div>
    </section>
  );
}
