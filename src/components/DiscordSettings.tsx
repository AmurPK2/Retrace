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
      <h3>Discord activity</h3>
      <p>
        Show your balance, completed wins and a link to the RETRACE project on
        your Discord profile.
      </p>
      <label className="discord-toggle">
        <input
          aria-label="Show activity in Discord"
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => {
            const next = { ...value, enabled: e.target.checked };
            setValue(next);
            void save(next);
          }}
        />{" "}
        Show activity in Discord
      </label>
      <p className="micro" role="status">
        {state.discordStatus?.message ?? "Activity sharing is off."}
      </p>
      <details className="discord-help">
        <summary>Advanced setup (optional)</summary>
        <p className="micro">
          RETRACE is ready to use. Keep Discord desktop open. Only change these
          fields to use your own Discord application.
        </p>
        <div className="settings-grid">
          <label className="field">
            <span>Application ID</span>
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
            <span>Logo image asset name</span>
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
          {saved ? "Discord settings saved" : "Save Discord settings"}
        </button>
        <details
          className="discord-help"
          open={!value.applicationId || undefined}
        >
          <summary>One-time setup</summary>
          <ol>
            <li>
              <button
                className="table-action"
                onClick={() => void call({ type: "discord.portal" })}
              >
                Open Discord Developer Portal
              </button>{" "}
              and create an application named <b>RETRACE</b>.
            </li>
            <li>
              Copy its <b>Application ID</b> into the field above.
            </li>
            <li>
              Under <b>Rich Presence → Art Assets</b>, upload <b>RETRACE.png</b>{" "}
              and name it <b>retrace_rt</b>.{" "}
              <button
                className="table-action"
                onClick={() => void call({ type: "discord.icon" })}
              >
                Show icon file
              </button>
            </li>
            <li>
              Save, switch activity on, and keep Discord desktop open. Discord's
              own activity/privacy settings also control who can see it.
            </li>
          </ol>
          <p className="micro">
            No account token or bot is needed. Balance includes booked profit
            and costs; open profit is excluded. Trades taken count fully closed
            profitable trades after all partial exits and costs.
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
