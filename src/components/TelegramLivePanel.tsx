import { useEffect, useState } from "react";
export function TelegramPanel({
  close,
  embedded = false,
}: {
  close: () => void;
  embedded?: boolean;
}) {
  const [group, setGroup] = useState("all"),
    [view, setView] = useState<any>(null),
    [error, setError] = useState(""),
    [setup, setSetup] = useState(false),
    [apiId, setApiId] = useState(""),
    [apiHash, setApiHash] = useState(""),
    [sources, setSources] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = async () => {
    try {
      setView(await window.replay.call({ type: "feed.read", group }));
    } catch {
      setError("Could not load the optional Telegram panel.");
    }
  };
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    const off = window.replay.onFeed(() => void refresh());
    return () => {
      clearInterval(timer);
      off();
    };
  }, [group]);
  const openSetup = () => {
    setApiId(String(view?.configuration?.apiId ?? ""));
    setSources(
      (view?.configuration?.sources ?? [])
        .map((s: any) => s.title + " | " + s.peer)
        .join("\n"),
    );
    setSetup(true);
    setError("");
  };
  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      const list = sources
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((line) => {
          const [title, peer, ...rest] = line.split("|").map((s) => s.trim());
          if (!title || !peer || rest.length)
            throw Error(
              "Use one source per line: Name | @username or -100channelid",
            );
          return { title, peer };
        });
      await window.replay.call({
        type: "feed.configure",
        apiId: Number(apiId),
        apiHash,
        sources: list,
      });
      setApiHash("");
      setGroup("all");
      setSetup(false);
      if (list.length) await window.replay.call({ type: "feed.link" });
      await refresh();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  return (
    <aside
      className={"telegram-panel" + (embedded ? " embedded" : "")}
      aria-label="Your Telegram sources"
    >
      <header>
        <b>Telegram · optional</b>
        <span className="spacer" />
        <button onClick={openSetup}>Your sources</button>
        <button aria-label="Close Telegram" onClick={close}>
          ×
        </button>
      </header>
      <p className="micro" style={{ padding: "0 14px" }}>
        Only sources you choose are connected. No sources or accounts are
        included with RETRACE. Messages stay separate from chart AI.
      </p>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {(setup || !view?.configuration?.configured) && (
        <section
          className="telegram-user-setup"
          style={{ padding: 14, display: "grid", gap: 10 }}
        >
          <b>Connect your own account</b>
          <p className="micro">
            Use your own Telegram Application API ID and API hash from
            my.telegram.org. Your account must already belong to the selected
            channels. RETRACE never joins a group or sends messages.
          </p>
          <label>
            API ID
            <input
              aria-label="Your Telegram API ID"
              inputMode="numeric"
              value={apiId}
              onChange={(e) => setApiId(e.target.value)}
            />
          </label>
          <label>
            API hash
            <input
              aria-label="Your Telegram API hash"
              type="password"
              autoComplete="off"
              placeholder={
                view?.configuration?.configured
                  ? "Leave blank to keep saved hash"
                  : "32-character API hash"
              }
              value={apiHash}
              onChange={(e) => setApiHash(e.target.value)}
            />
          </label>
          <label>
            Your sources · one per line
            <textarea
              aria-label="Your Telegram sources"
              rows={4}
              placeholder={
                "My study channel | @my_channel\nPrivate channel | -1001234567890"
              }
              value={sources}
              onChange={(e) => setSources(e.target.value)}
            />
          </label>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void connect()}
          >
            {busy ? "Saving…" : "Save and connect"}
          </button>
          <p className="micro">
            API credentials and login sessions are encrypted with your Windows
            account. Remove all source lines and save to stop monitoring.
            Offline periods may miss edits or deletions.
          </p>
        </section>
      )}
      {view?.login?.state === "qr" && (
        <section style={{ padding: 14 }}>
          <p>
            Telegram → Settings → Devices → Link Desktop Device. Scan this code
            yourself.
          </p>
          <img
            width="240"
            height="240"
            src={view.login.image}
            alt="Your Telegram sign-in QR code"
          />
          <button
            onClick={() =>
              void window.replay.call({ type: "feed.link.cancel" })
            }
          >
            Cancel sign-in
          </button>
        </section>
      )}
      {view?.login?.state === "password" && (
        <form
          style={{ padding: 14 }}
          onSubmit={(e) => {
            e.preventDefault();
            void window.replay
              .call({ type: "feed.password", password })
              .then(() => setPassword(""));
          }}
        >
          <label>
            Telegram two-step password
            <input
              type="password"
              autoComplete="off"
              aria-label="Telegram two-step password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button>Continue</button>
        </form>
      )}
      {view?.login?.state === "error" && (
        <p className="inline-error">
          Sign-in did not finish. Open Your sources to retry.
        </p>
      )}
      {view?.configuration?.configured && !setup && (
        <>
          <nav>
            <button
              className={group === "all" ? "selected" : ""}
              onClick={() => setGroup("all")}
            >
              Activity
            </button>
            {view.groups?.map((s: any) => (
              <button
                key={s.group}
                className={group === s.group ? "selected" : ""}
                onClick={() => setGroup(s.group)}
              >
                {s.title}
              </button>
            ))}
          </nav>
          <p className="micro" style={{ padding: "0 14px" }}>
            {view.transport?.detail}
          </p>
          <div className="telegram-messages">
            {group === "all"
              ? (view.events ?? []).map((e: any) => (
                  <article key={e.seq}>
                    <time>
                      {e.kind} · {new Date(e.at).toLocaleString()}
                    </time>
                    <p style={{ whiteSpace: "pre-wrap" }}>
                      {e.message?.text || "Media post"}
                    </p>
                  </article>
                ))
              : (view.messages ?? []).map((m: any) => (
                  <article key={m.id}>
                    <time>
                      {new Date(m.time).toLocaleString()}
                      {m.deletedAt ? " · deleted" : ""}
                    </time>
                    <p style={{ whiteSpace: "pre-wrap" }}>
                      {m.text || "Media post"}
                    </p>
                  </article>
                ))}
          </div>
        </>
      )}
    </aside>
  );
}
