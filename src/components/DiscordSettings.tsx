import { useState } from "react";
import type { AppState } from "../types";
import { DEFAULT_DISCORD } from "../core/discord-presence";

export function DiscordSettings({
  state,
  call,
}: {
  state: AppState;
  call: (c: any) => Promise<any>;
}) {
  const [value, setValue] = useState(state.discord ?? DEFAULT_DISCORD);
  const [issue, setIssue] = useState("");
  const [saved, setSaved] = useState(false);
  const save = async (next = value) => {
    setIssue("");
    setSaved(false);
    try {
      await call({ type: "discord.settings", value: next });
      setSaved(true);
    } catch (error) {
      setIssue(String((error as Error).message));
    }
  };
  return (
    <section className="settings-section discord-settings">
      <h3>Discord-aktivitet</h3>
      <p>
        Vis saldo, antall utførte trades og en lenke til RETRACE på
        Discord-profilen din.
      </p>
      <label className="discord-toggle">
        <input
          aria-label="Vis aktivitet i Discord"
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => {
            const next = { ...value, enabled: e.target.checked };
            setValue(next);
            void save(next);
          }}
        />{" "}
        Vis aktivitet i Discord
      </label>
      <p className="micro" role="status">
        {state.discordStatus?.message ?? "Aktivitetsdeling er slått av."}
      </p>
      <details className="discord-help">
        <summary>Egen Discord-app (valgfritt)</summary>
        <p className="micro">
          RETRACE er ferdig konfigurert. La Discord-appen være åpen. Endre bare
          disse feltene hvis du vil bruke din egen Discord-applikasjon.
        </p>
        <div className="settings-grid">
          <label className="field">
            <span>Applikasjons-ID</span>
            <input
              aria-label="Discord Application ID"
              inputMode="numeric"
              placeholder="From Discord Developer Portal"
              value={value.applicationId}
              onChange={(e) => {
                setValue({ ...value, applicationId: e.target.value });
                setSaved(false);
              }}
            />
          </label>
          <label className="field">
            <span>Navn på logoressurs</span>
            <input
              aria-label="Discord image asset name"
              placeholder="retrace"
              value={value.imageKey}
              onChange={(e) => {
                setValue({ ...value, imageKey: e.target.value });
                setSaved(false);
              }}
            />
          </label>
        </div>
        <button className="secondary-button" onClick={() => void save()}>
          {saved
            ? "Discord-innstillinger lagret"
            : "Lagre Discord-innstillinger"}
        </button>
        <details
          className="discord-help"
          open={!value.applicationId || undefined}
        >
          <summary>Oppsett av egen applikasjon</summary>
          <ol>
            <li>
              <button
                className="table-action"
                onClick={() => void call({ type: "discord.portal" })}
              >
                Åpne Discord Developer Portal
              </button>{" "}
              and create an application named <b>RETRACE</b>.
            </li>
            <li>
              Copy its <b>Applikasjons-ID</b> into the field above.
            </li>
            <li>
              Under <b>Rich Presence → Art Assets</b>, upload <b>RETRACE.png</b>{" "}
              and name it <b>retrace_rt</b>.{" "}
              <button
                className="table-action"
                onClick={() => void call({ type: "discord.icon" })}
              >
                Vis ikonfil
              </button>
            </li>
            <li>
              Save, switch activity on, and keep Discord desktop open. Discord's
              own activity/privacy settings also control who can see it.
            </li>
          </ol>
          <p className="micro">
            Ingen kontonøkkel eller bot er nødvendig. Saldo inkluderer realisert
            resultat og kostnader. Trades taken teller hver faktisk fylt trade
            én gang; delvise exits øker ikke antallet.
          </p>
        </details>
      </details>
      {issue && (
        <p className="inline-error" role="alert">
          {issue}
        </p>
      )}
    </section>
  );
}
