import { useEffect, useState, useRef } from "react";
import {
  ArrowUp,
  Square,
  Power,
  Settings2,
  Image,
  MessageSquare,
} from "lucide-react";
import type { AppState, Message } from "../types";
import { sessionTrades } from "../core/trade-evidence";

function messageBody(m: Message) {
  if (m.role === "user")
    return m.text.replace(
      /^(?:Sjekk oppsett|Gi et hint|Gjennomgå handelen|Fri samtale|Check setup|Give a hint|Review trade|Open chat):\s*/,
      "",
    );
  if (m.status === "interrupted") {
    if (
      /AbortError|aborted|avbrutt/i.test(m.text) &&
      !/unverified|ukontrollerte|grunnlag|withheld|tilbake/i.test(m.text)
    )
      return "Response stopped.";
    if (/grunnlag|withheld|tilbake|unverified|ukontrollerte/i.test(m.text))
      return "A number in this reply could not be verified. Ask for a qualitative review or add an exact entry, stop and target.";
  }
  return m.text;
}
function Answer({ text }: { text: string }) {
  try {
    const data = JSON.parse(text);
    if (typeof data.summary === "string")
      return (
        <>
          <p>{data.summary}</p>
          {data.missing_information?.length > 0 && (
            <ul>
              {data.missing_information
                .slice(0, 4)
                .map((v: string, i: number) => (
                  <li key={i}>{v}</li>
                ))}
            </ul>
          )}
          {data.learning_point && (
            <p className="assistant-note">{data.learning_point}</p>
          )}
          {data.questions?.[0] && <p>{data.questions[0]}</p>}
        </>
      );
  } catch {}
  return <p>{text}</p>;
}
export function AssistantPanel({
  state,
  tradeId,
  setTradeId,
  draft,
  setDraft,
  mode,
  setMode,
  send,
  sending,
  act,
  openSettings,
}: {
  state: AppState;
  tradeId: string;
  setTradeId: (id: string) => void;
  draft: string;
  setDraft: (v: string) => void;
  mode: string;
  setMode: (v: string) => void;
  send: () => Promise<void>;
  sending: boolean;
  act: (command: any) => void;
  openSettings: () => void;
}) {
  const [now, setNow] = useState(Date.now()),
    [phaseStart, setPhaseStart] = useState(Date.now());
  const active = state.session?.chat
    .filter((m) => m.status === "generating")
    .at(-1);
  const conversation = useRef<HTMLDivElement>(null);
  const lastMessage = state.session?.chat.at(-1);
  useEffect(() => {
    const box = conversation.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [lastMessage?.id]);
  useEffect(() => {
    const box = conversation.current;
    if (box && box.scrollHeight - box.scrollTop - box.clientHeight < 120)
      box.scrollTop = box.scrollHeight;
  }, [lastMessage?.text, lastMessage?.status]);
  const busy =
    sending ||
    !!active ||
    ["starting", "loading", "generating"].includes(state.ai.state);
  useEffect(() => {
    setPhaseStart(Date.now());
  }, [state.ai.state]);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [busy]);
  const seconds = Math.max(
    0,
    Math.floor((now - (active?.at ?? phaseStart)) / 1000),
  );
  const enabled = state.settings.enabled && state.settings.profile !== "gaming";
  const label = active
    ? "Thinking"
    : (
        {
          off: "Off",
          starting: "Starting",
          loading: "Loading model",
          ready: "Ready",
          generating: "Thinking",
          unloading: "Unloading",
          error: "Needs attention",
        } as const
      )[state.ai.state];
  return (
    <section className="assistant-panel">
      <header className="assistant-header">
        <div>
          <b>Chart Assistant</b>
          <span>Local · private</span>
        </div>
        <button
          className={`assistant-power ${enabled ? "on" : ""}`}
          title={
            enabled
              ? "Turn off and release model memory"
              : "Turn on Chart Assistant"
          }
          aria-label={enabled ? "Turn off assistant" : "Turn on assistant"}
          onClick={() => act({ type: "ai.toggle", value: !enabled })}
        >
          <Power size={14} />
          <span>{enabled ? "On" : "Off"}</span>
        </button>
      </header>
      <div className="assistant-status" aria-live="polite">
        <span className={busy ? "assistant-dot busy" : "assistant-dot"} />
        <span>
          {label}
          {busy
            ? ` · ${seconds}s`
            : state.ai.latency
              ? ` · ${(state.ai.latency / 1000).toFixed(1)}s last`
              : ""}
        </span>
        <button
          title="Assistant settings"
          aria-label="Assistant settings"
          onClick={openSettings}
        >
          <Settings2 size={13} />
        </button>
      </div>
      <div className="assistant-conversation" ref={conversation}>
        {!state.session?.chat.length && (
          <div className="assistant-empty">
            <MessageSquare size={22} />
            <h3>A second look at your chart.</h3>
            <p>Ask about structure, risk or your trade plan.</p>
            <button
              onClick={() => {
                setMode("Check setup");
                setDraft("What is missing from my trade plan?");
              }}
            >
              What am I missing?
            </button>
            <button
              onClick={() => {
                setMode("Give a hint");
                setDraft(
                  "Give one qualitative observation about the current structure.",
                );
              }}
            >
              Review structure
            </button>
          </div>
        )}
        {state.session?.chat.map((m) => (
          <article key={m.id} className={`assistant-message ${m.role}`}>
            <header>
              <span>{m.role === "user" ? "You" : "Assistant"}</span>
              <time>
                {new Date(m.cutoff).toLocaleTimeString("en-GB", {
                  timeZone: state.session!.layout.timezone,
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              {m.status === "interrupted" && <span>Stopped</span>}
            </header>
            {m.status === "generating" ? (
              <p className="assistant-typing">
                Checking the replay snapshot<span>…</span>
              </p>
            ) : (
              <Answer text={messageBody(m)} />
            )}
            {m.evidence && <p className="assistant-note">{m.evidence.label ? m.evidence.label + " · " : ""}{m.evidence.decisionImage ? "Decision chart + " : ""}{m.evidence.currentImage ? "current chart + " : ""}saved chart data{m.evidence.tradeId && !m.evidence.decisionImage ? " · decision image not analysed" : ""}</p>}
            {m.historyAnswer && <p className="assistant-note">From this session’s saved trade history.</p>}
            {m.evidenceFallback && <p className="assistant-note">Saved-data reply · an AI draft could not be verified.</p>}
            {m.groundingFiltered && (
              <p className="assistant-note">
                Unverified numerical sentences omitted.
              </p>
            )}
            {m.status === "interrupted" && (
              <details className="assistant-details">
                <summary>Details</summary>
                <p>{m.text}</p>
              </details>
            )}
          </article>
        ))}
      </div>
      <div className="assistant-compose">
        <label className="assistant-trade-target"><span>Question refers to</span>
          <select aria-label="Trade to review" value={tradeId} onChange={e => setTradeId(e.target.value)}>
            <option value="auto">Auto · latest trade for reviews</option>
            <option value="chart">Current chart / draft</option>
            {state.session && sessionTrades(state.session).slice(0, 30).map(t => <option key={t.id} value={t.id}>{t.side.toUpperCase()} @ {t.entry.toFixed(3)} · {new Date(t.opened).toLocaleString("en-GB", { timeZone: state.session!.layout.timezone, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {t.status}</option>)}
          </select>
        </label>
        <div className="assistant-compose-options">
          <select
            aria-label="Assistant mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option>Check setup</option>
            <option>Give a hint</option>
            <option>Review trade</option>
            <option>Open chat</option>
          </select>
          <button
            title={
              state.settings.vision
                ? "Scan images for every question"
                : "Auto scan: trade reviews, setup checks and hints use chart images"
            }
            aria-pressed={state.settings.vision}
            className={state.settings.vision ? "image-on" : ""}
            onClick={() =>
              act({
                type: "ai.settings",
                value: { ...state.settings, vision: !state.settings.vision },
              })
            }
          >
            <Image size={14} />
            {state.settings.vision ? "Always scan" : "Auto scan"}
          </button>
        </div>
        <textarea
          aria-label="Message Chart Assistant"
          placeholder={
            enabled ? "Ask about the chart…" : "Turn on the assistant to ask…"
          }
          value={draft}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              if (enabled && draft.trim() && !busy) void send();
            }
          }}
        />
        <footer>
          <span>
            {state.settings.vision
              ? "Charts + saved trade evidence"
              : "Reviews scan decision + current charts"}
          </span>
          {active ? (
            <button
              key="stop"
              disabled={false}
              title="Stop response"
              aria-label="Stop response"
              onClick={() => act({ type: "ai.cancel" })}
            >
              <Square size={13} />
            </button>
          ) : (
            <button
              key="send"
              className="assistant-send"
              title="Send · Ctrl+Enter"
              aria-label="Send message"
              disabled={!enabled || !draft.trim() || busy}
              onClick={() => void send()}
            >
              <ArrowUp size={16} />
            </button>
          )}
        </footer>
      </div>
    </section>
  );
}
