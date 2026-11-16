import { ChallengePanel } from "./components/ChallengePanel";
import { CHALLENGES } from "./core/challenges";
import { FibEditor } from "./components/FibEditor";
import { INSTRUMENTS, instrumentForDataset } from "./core/instruments";
import { LearningHub } from "./components/LearningHub";
import { DEFAULT_HTF } from "./core/htf";
import { draftIssues, combinedPlanRisk } from "./core/order-validation";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
  type CSSProperties,
} from "react";
import {
  Play,
  Pause,
  SkipForward,
  ChevronRight,
  ChevronDown,
  Settings,
  Database,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Layers,
  MousePointer2,
  Minus,
  MoveUpRight,
  Square,
  GitBranch,
  TrendingUp,
  TrendingDown,
  Undo2,
  Redo2,
  Trash2,
  Copy,
  Lock,
  Unlock,
  MoreHorizontal,
  BookOpen,
  Download,
  Upload,
  Shuffle,
  Clock,
  ArrowUpRight,
  Activity,
  X,
  Power,
  Send,
  Check,
  Maximize2,
  Crosshair,
  Save,
  PenLine,
  NotebookPen,
  StopCircle,
  SlidersHorizontal,
  LogOut,
  CircleHelp,
} from "lucide-react";
import {
  Chart,
  type Tool,
  type ChartHandle,
  type OrderLevel,
} from "./components/Chart";
import { DEFAULT_APPEARANCE, appearanceVariables } from "./core/appearance";
import { AppearanceSettings } from "./components/AppearanceSettings";
import { sessionTrades } from "./core/trade-evidence";
import { DiscordSettings } from "./components/DiscordSettings";
import retraceIcon from "../assets/RETRACE.svg";
import { FormulaEditor } from "./components/FormulaEditor";
import { TelegramPanel } from "./components/TelegramLivePanel";
import { AssistantPanel } from "./components/AssistantPanel";
import { WorkspaceHelp } from "./components/WorkspaceHelp";
import { RRStudyPanel } from "./components/RRStudyPanel";
import type { RRPlan, RRTimeframe } from "./core/rr-study";
import { planLevels } from "./core/drawings";
import { ToolIcon } from "./components/ToolIcon";
import {
  limitSide,
  moveDraftEntry,
  resolveLevelDraft,
  levelLabel,
} from "./core/order-draft";
import {
  account,
  pnl,
  sizeForRisk,
  statistics,
  tradeStatistics,
  margin,
} from "./core/broker";
import {
  DEFAULT_AI,
  FRAMES,
  type AppState,
  type Drawing,
  type Session,
  type AISettings,
  type Indicator,
  type TF,
} from "./types";
const formatMoney = (n: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
const money = (n: number) => formatMoney(n);
const num = (n: number) => n.toFixed(3);
const legacyDefaultText: Record<string, string> = {
  "Egen prishandling": "My price action",
  "Jeg har definert en tydelig ugyldiggjøring og SL.":
    "I have defined clear invalidation and a stop loss.",
  "Jeg har kontrollert kontant risiko, spread og margin.":
    "I have checked cash risk, spread and margin.",
  "Jeg kan beskrive observasjonen og hva som mangler.":
    "I can describe the observation and what is missing.",
};
const displayDefault = (text: string) => legacyDefaultText[text] ?? text;
const stamp = (t: number, blind = false, zone = "Europe/Oslo") =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    ...(!blind ? { day: "2-digit", month: "short", year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(t);
const aiLabels: Record<string, string> = {
  off: "Off",
  starting: "Starting",
  loading: "Loading",
  ready: "Ready",
  generating: "Thinking",
  unloading: "Unloading",
  error: "Error",
};
function IconButton({
  title,
  children,
  onClick,
  active = false,
  disabled = false,
}: {
  title: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={"icon-button " + (active ? "active" : "")}
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <small>RETRACE</small>
            <h2>{title}</h2>
          </div>
          <IconButton title="Close dialog" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
export default function App() {
  const [state, setState] = useState<AppState | null>(null),
    [modal, setModal] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tool, setTool] = useState<Tool>("select"),
    [selected, setSelected] = useState<string | null>(null),
    [tab, setTab] = useState("positions");
  const [picker, setPicker] = useState<OrderLevel | null>(null),
    [sidebar, setSidebar] = useState<"assistant" | "telegram" | "study">(() => {
      const saved = localStorage.getItem("replay.sidebarTab");
      return saved === "telegram" || saved === "study" ? saved : "assistant";
    }),
    [showNotes, setShowNotes] = useState(false);
  const feedOpen = sidebar === "telegram";
  const setFeedOpen = (open: boolean) =>
    setSidebar(open ? "telegram" : "assistant");
  const [studyPicking, setStudyPicking] = useState(false);
  const studyDraft = useRef<{ rangeId: string; value: RRPlan } | null>(null);
  const [previewActive, setPreviewActive] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [setupId, setSetupId] = useState(() => crypto.randomUUID());
  const [planId, setPlanId] = useState<string | undefined>();
  const [objectsOpen, setObjectsOpen] = useState(false);
  const [chartMenu, setChartMenu] = useState<{
    x: number;
    y: number;
    price: number;
    time: number;
  } | null>(null);
  const [sendingAI, setSendingAI] = useState(false);
  const [reviewTradeId, setReviewTradeId] = useState("auto");
  const [feedCount, setFeedCount] = useState(0);
  useEffect(
    () => localStorage.setItem("replay.sidebarTab", sidebar),
    [sidebar],
  );
  const look = state?.appearance ?? DEFAULT_APPEARANCE;
  const chart = useRef<ChartHandle>(null);
  const [draft, setDraft] = useState(""),
    [thesis, setThesis] = useState(""),
    [tags, setTags] = useState(""),
    [note, setNote] = useState(""),
    [chatMode, setChatMode] = useState("Check setup");
  const stateRef = useRef(state);
  stateRef.current = state;
  const inputs = useRef({ draft, thesis, tags, journalDraft: note });
  inputs.current = { draft, thesis, tags, journalDraft: note };
  const currentSession = useRef("");
  const call = useCallback(async (c: any) => {
    try {
      return await window.replay.call(c);
    } catch (e) {
      setError(
        String(e).replace(
          "Error invoking remote method 'replay:call': Error: ",
          "",
        ),
      );
      throw e;
    }
  }, []);
  const act = useCallback(
    (c: any) => {
      void call(c).catch(() => {});
    },
    [call],
  );
  useEffect(() => {
    let mounted = true;
    const update = (s: AppState) => {
      if (!mounted) return;
      setState(s);
      if (s.session?.id !== currentSession.current) {
        currentSession.current = s.session?.id ?? "";
        setDraft(s.session?.draft ?? "");
        setThesis(s.session?.thesis ?? "");
        setTags(s.session?.tags ?? "");
        setNote(s.session?.journalDraft ?? "");
        setSelected(null);
        setTool("select");
      }
      if (!s.session) setModal((m) => m || "sessions");
    };
    const unsub = window.replay.subscribe(update);
    const offFeed = window.replay.onFeed((value) =>
      setFeedCount(Number(value.unread) || 0),
    );
    void window.replay.call({ type: "feed.start" }).catch(() => {});
    void window.replay
      .call({ type: "state" })
      .then(update)
      .catch((e) => setError(String(e)));
    const off = window.replay.onAI((m) => {
      if (m.event === "error") setError(m.value);
      if (m.event === "ai") setState((s) => (s ? { ...s, ai: m.value } : s));
      if (m.event === "token")
        setState((s) => {
          if (!s?.session) return s;
          return {
            ...s,
            session: {
              ...s.session,
              chat: s.session.chat.map((a) =>
                a.id === m.value.id ? { ...a, text: a.text + m.value.text } : a,
              ),
            },
          };
        });
    });
    window.replay.flush(async () => {
      if (studyDraft.current)
        await window.replay.call({
          type: "study.draft",
          ...studyDraft.current,
        });
      await window.replay.call({ type: "flush", value: inputs.current });
    });
    return () => {
      mounted = false;
      unsub();
      offFeed();
      off();
    };
  }, []);
  useEffect(() => {
    if (!state?.session) return;
    const timer = setTimeout(() => {
      void window.replay
        .call({
          type: "ui",
          value: { draft, thesis, tags, journalDraft: note },
        })
        .catch((e) => setError(String(e)));
    }, 500);
    return () => clearTimeout(timer);
  }, [draft, thesis, tags, note, state?.session?.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (modal) {
          setModal("");
          return;
        }
        setChartMenu(null);
        setStudyPicking(false);
        setTool("select");
        setSelected(null);
        setPicker(null);
        setModal("");
        return;
      }
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable="true"],video,[role="dialog"],[role="menu"]',
        )
      )
        return;
      if (modal || chartMenu) return;
      if (e.key === "?") {
        e.preventDefault();
        setModal("help");
        if (stateRef.current?.playing) act({ type: "play", value: false });
        return;
      }
      if (e.key === " ") {
        if ((e.target as HTMLElement).closest('button,[role="button"],summary'))
          return;
        e.preventDefault();
        if (!e.repeat) act({ type: "step", kind: "candle" });
      }
      if (e.code === "KeyP" && !e.ctrlKey && !e.altKey && !e.repeat) {
        e.preventDefault();
        act({ type: "play", value: !stateRef.current?.playing });
      }
      if (e.key === "ArrowRight" && !e.repeat) {
        e.preventDefault();
        act({ type: "step", kind: "candle" });
      }
      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        act({ type: e.shiftKey ? "drawing.redo" : "drawing.undo" });
      }
      if (e.ctrlKey && e.key.toLowerCase() === "y") {
        e.preventDefault();
        act({ type: "drawing.redo" });
      }
      if (e.key === "Delete" && selected) {
        const s = stateRef.current?.session;
        if (s)
          act({
            type: "drawings",
            value: s.drawings.filter((d) => d.id !== selected),
          });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [act, selected, modal, chartMenu]);
  const session = state?.session;
  const money = (n: number) =>
    formatMoney(n, session?.broker.specs.currency ?? "USD");
  const num = (n: number) => n.toFixed(session?.broker.specs.precision ?? 3);
  const previousStudyRange = useRef<{ session: string; range?: string } | null>(
    null,
  );
  useEffect(() => {
    const previous = previousStudyRange.current;
    const id = session?.study?.range?.id;
    if (
      session &&
      previous?.session === session.id &&
      id &&
      previous.range !== id
    )
      chart.current?.focusStudy();
    previousStudyRange.current = session
      ? { session: session.id, range: id }
      : null;
  }, [session?.id, session?.study?.range?.id]);
  const a = session ? account(session.broker, session.tick) : null;
  const layout = (patch: Partial<Session["layout"]>) => {
    if (!session) return;
    if (patch.timeframe) setStudyPicking(false);
    const next = { ...session.layout, ...patch };
    // Logical bar indexes belong to one timeframe. Reusing them after a
    // timeframe change can put nearly the entire chart in future whitespace.
    if (patch.timeframe && patch.timeframe !== session.layout.timeframe) {
      const visible = chart.current?.visibleWindow();
      if (visible)
        next.range = {
          from: 0,
          to: 1,
          version: 3,
          fromTime: visible.from,
          toTime: visible.to,
        };
    }
    if (
      patch.second &&
      patch.second !== session.layout.second &&
      next.secondRange?.version !== 3
    )
      delete next.secondRange;
    act({ type: "ui", value: { layout: next } });
  };
  const [tradeToLocate, setTradeToLocate] = useState<string | null>(null);
  useEffect(() => {
    if (tradeToLocate && chart.current?.focusTrade(tradeToLocate))
      setTradeToLocate(null);
  }, [tradeToLocate, state?.bars, session?.layout.timeframe]);
  const locateTrade = (id: string) => {
    if (chart.current?.focusTrade(id)) return;
    if (session && session.layout.timeframe !== "1H") {
      setTradeToLocate(id);
      layout({ timeframe: "1H" });
    } else
      setError(
        "This trade is outside loaded history. Its original Decision chart is still available in History.",
      );
  };
  const [marketSide, setMarketSide] = useState<"buy" | "sell">("buy"),
    [kind, setKind] = useState<"market" | "limit">("limit"),
    [lots, setLots] = useState("0.01"),
    [entry, setEntry] = useState(""),
    [sl, setSL] = useState(""),
    [tp, setTP] = useState(""),
    [riskMode, setRiskMode] = useState("lots"),
    [riskValue, setRiskValue] = useState("1");
  const levelPrice = Number(entry);
  const side =
    kind === "market"
      ? marketSide
      : session
        ? limitSide(
            Number.isFinite(levelPrice) && levelPrice > 0
              ? levelPrice
              : session.tick.bid,
            session.tick.bid,
          )
        : "buy";
  const entryPrice = session
    ? kind === "market"
      ? side === "buy"
        ? session.tick.ask
        : session.tick.bid
      : Number(entry)
    : 0;
  const desiredRisk = a
    ? riskMode === "percent"
      ? (a.equity * Number(riskValue)) / 100
      : Number(riskValue)
    : 0;
  const effectiveLots =
    session && riskMode !== "lots" && sl
      ? sizeForRisk(desiredRisk, entryPrice, Number(sl), session.broker.specs)
      : Number(lots);
  const plannedRisk =
    session && sl && Number(sl) > 0
      ? Math.abs(entryPrice - Number(sl)) *
          effectiveLots *
          session.broker.specs.contract +
        effectiveLots *
          (session.broker.specs.commission +
            session.broker.specs.slippage * session.broker.specs.contract) *
          2
      : null;
  const setupEntries = session
    ? [...session.broker.pending, ...session.broker.positions]
        .filter((p) => p.setupId === setupId)
        .map((p) => ({
          id: p.id,
          entry: "entry" in p ? Number(p.entry) : p.price!,
          sl: p.sl,
          lots: p.lots,
        }))
    : [];
  const setupRisk = session
    ? combinedPlanRisk(
        [
          ...setupEntries,
          ...(previewActive
            ? [
                {
                  id: "draft",
                  entry: entryPrice,
                  sl: sl ? Number(sl) : undefined,
                  lots: effectiveLots,
                },
              ]
            : []),
        ],
        session.broker.specs,
      )
    : null;
  const reward =
    session && tp
      ? Math.abs(Number(tp) - entryPrice) *
        effectiveLots *
        session.broker.specs.contract
      : null;
  const requiredMargin = session
    ? margin(
        entryPrice || session.tick.ask,
        effectiveLots || 0,
        session.broker.specs,
      )
    : 0;
  const issues = session
    ? draftIssues(
        {
          side,
          kind,
          entry: entryPrice,
          sl: sl ? Number(sl) : undefined,
          tp: tp ? Number(tp) : undefined,
          lots: effectiveLots,
        },
        session.broker.specs,
      )
    : [];
  const order = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await call({ type: "play", value: false });
      const snapshot = (await call({ type: "state" })) as AppState;
      const execution =
        kind === "market"
          ? {
              side,
              kind,
              entry: entryPrice,
              sl: sl ? Number(sl) : undefined,
              tp: tp ? Number(tp) : undefined,
              lots: effectiveLots,
            }
          : resolveLevelDraft(
              {
                side,
                kind,
                entry: Number(entry),
                sl: sl ? Number(sl) : undefined,
                tp: tp ? Number(tp) : undefined,
                lots: effectiveLots,
              },
              snapshot.quote!.bid,
            );
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      );
      await call({
        type: "order",
        order: {
          side: execution.side,
          kind: execution.kind,
          automaticLevel: kind !== "market",
          setupId,
          planId,
          lots: effectiveLots,
          price: kind === "market" ? undefined : Number(entry),
          sl: execution.sl,
          tp: execution.tp,
          thesis,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          strategy: session.notebook.version,
        },
        screenshot: await chart.current?.capture(),
        cursor: chart.current?.cursor(),
      });
      setTab(kind === "market" ? "positions" : "pending");
      setPreviewActive(false);
    } catch {
    } finally {
      setBusy(false);
    }
  };
  const ask = async (
    request?: string,
    modeOverride?: string,
    targetOverride?: string,
  ) => {
    const question = request ?? draft;
    if (!session || !question.trim() || sendingAI) return;
    setSendingAI(true);
    try {
      await call({ type: "play", value: false });
      await call({ type: "flush", value: { draft, thesis, tags } });
      const snapshot = (await call({ type: "state" })) as AppState;
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      );
      await call({
        type: "ai.ask",
        text: (modeOverride ?? chatMode) + ": " + question,
        cursor: chart.current?.cursor(),
        screenshot: await chart.current?.capture(),
        tradeId: targetOverride ?? reviewTradeId,
        visibleWindow: chart.current?.visibleWindow(),
        proposal: previewActive
          ? {
              side,
              kind,
              planId,
              setupId,
              entry: entryPrice,
              sl: sl ? Number(sl) : null,
              tp: tp ? Number(tp) : null,
              lots: effectiveLots,
              cashRisk: plannedRisk,
              rr: plannedRisk && reward ? reward / plannedRisk : null,
              margin: requiredMargin,
            }
          : undefined,
      });
      setDraft("");
    } catch {
    } finally {
      setSendingAI(false);
    }
  };
  const selectedDrawing = session?.drawings.find((d) => d.id === selected);
  const newOrderDraft = async (price?: number) => {
    if (!session) return;
    try {
      await call({ type: "play", value: false });
      const fresh = await call({ type: "state" });
      setKind("limit");
      setSetupId(crypto.randomUUID());
      setPlanId(undefined);
      setLots(String(Math.max(Number(lots) || 0, session.broker.specs.minLot)));
      setEntry(num(price ?? fresh.quote.bid));
      setTicketOpen(true);
      setChartMenu(null);
      setSL("");
      setTP("");
      setPreviewActive(true);
      setSelected(null);
      setTool("select");
      setPicker(null);
      if (!look.graphOrders)
        act({ type: "appearance", value: { ...look, graphOrders: true } });
    } catch {}
  };
  const changeDrawing = (patch: Partial<Drawing>) => {
    if (session && selectedDrawing)
      act({ type: "drawing.patch", id: selectedDrawing.id, patch });
  };
  const cancelDraft = () => {
    setPreviewActive(false);
    setPicker(null);
    setEntry("");
    setSL("");
    setTP("");
    setKind("limit");
  };
  const usePlan = () => {
    if (!selectedDrawing || !session) return;
    const d = selectedDrawing;
    setPlanId(d.id);
    const level = resolveLevelDraft(
      {
        side: d.kind === "short" ? "sell" : "buy",
        kind: "limit",
        entry: d.a.price,
        sl: d.b.price,
        tp: planLevels(d).tp,
        lots: d.lots ?? effectiveLots,
      },
      session.tick.bid,
    );
    setKind("limit");
    setEntry(num(d.a.price));
    setSL(level.sl === undefined ? "" : num(level.sl));
    setTP(level.tp === undefined ? "" : num(level.tp));
    if (d.lots) setLots(String(d.lots));
    setPicker(null);
    setTool("select");
    setSelected(null);
    setPreviewActive(true);
    setTicketOpen(true);
  };
  const changeEntry = (price: number, text = num(price)) => {
    if (!session) return;
    const shifted = moveDraftEntry(
      {
        side,
        kind,
        entry: entryPrice || session.tick.bid,
        sl: sl ? Number(sl) : undefined,
        tp: tp ? Number(tp) : undefined,
        lots: effectiveLots,
        autoSide: true,
      },
      price,
      session.tick.bid,
    );
    setSL(shifted.sl === undefined ? "" : num(shifted.sl));
    setTP(shifted.tp === undefined ? "" : num(shifted.tp));
    setEntry(text);
    setKind("limit");
    setPreviewActive(true);
    setPicker(null);
  };
  if (!state)
    return (
      <div className="boot">
        <img
          className="brand-mark retrace-brand"
          src={retraceIcon}
          alt="RETRACE RT"
        />
        <h2>Opening your workspace</h2>
        <p>{error || "Reading your last saved checkpoint …"}</p>
      </div>
    );
  const stats = session ? statistics(session.broker.fills) : null;
  const toolbar: [Tool, string, ReactNode][] = [
    ["select", "Select and move · Esc", <ToolIcon kind="select" />],
    ["horizontal", "Horizontal line", <ToolIcon kind="horizontal" />],
    [
      "ray",
      "Ray · choose two points · Shift locks an axis",
      <ToolIcon kind="ray" />,
    ],
    [
      "trend",
      "Trend line · hold Shift to lock an axis",
      <ToolIcon kind="trend" />,
    ],
    ["zone", "Rectangle · click and drag", <ToolIcon kind="zone" />],
    ["fib", "Fibonacci · click and drag", <ToolIcon kind="fib" />],
    ["long", "Long position · buy plan", <ToolIcon kind="long" />],
    ["short", "Short position · sell plan", <ToolIcon kind="short" />],
  ];
  return (
    <div
      className={`app themed ${look.minimal ? "minimal" : ""} ${showNotes ? "notes-open" : ""}`}
      data-preset={look.preset}
      style={appearanceVariables(look) as CSSProperties}
    >
      <header className="topbar">
        <div className="brand">
          <img
            className="brand-mark retrace-brand"
            src={retraceIcon}
            alt="RETRACE RT"
          />
          <div>
            <b>RETRACE</b>
            <small>YOUR TRADING DESK</small>
          </div>
        </div>
        <div className="top-divider" />
        <button className="session-switch" onClick={() => setModal("sessions")}>
          <span className="status-dot" />
          {session?.name ?? "Select a session"}
          <ChevronDown size={14} />
        </button>
        <span className="paper-badge">
          REPLAY · {session?.broker.specs.currency ?? "USD"} · 1:
          {session?.broker.specs.leverage ?? 500}
        </span>
        <div className="top-actions">
          <button className="quiet" onClick={() => setModal("data")}>
            <Database size={15} />
            <span>
              {state.coverage.hours.toLocaleString("en-GB")} data hours
            </span>
            {state.coverage.importer.running && (
              <span className="mini-spinner" />
            )}
          </button>
          <IconButton
            title="Strategy notebook"
            onClick={() => setModal("notebook")}
          >
            <BookOpen size={18} />
          </IconButton>
          <IconButton title="Settings" onClick={() => setModal("settings")}>
            <Settings size={18} />
          </IconButton>
          <IconButton
            title="Exit app"
            onClick={() => act({ type: "app.exit" })}
          >
            <LogOut size={17} />
          </IconButton>
        </div>
      </header>
      <div className="account-strip">
        <div className="instrument">
          <select
            className="instrument-picker"
            aria-label="Instrument"
            value={session ? instrumentForDataset(session.dataset) : ""}
            onChange={(e) => {
              cancelDraft();
              setSelected(null);
              setTicketOpen(false);
              act({ type: "instrument", value: e.target.value });
            }}
          >
            <option disabled value="">
              Select instrument
            </option>
            {Object.entries(INSTRUMENTS).map(([id, i]) => (
              <option key={id} value={id} disabled={!i.available}>
                {id}
                {!i.available ? " · licensed data required" : ""}
              </option>
            ))}
          </select>
          <div>
            <b>
              {session
                ? INSTRUMENTS[instrumentForDataset(session.dataset)].name
                : "Gold / US Dollar"}
            </b>
            <small>
              {session
                ? instrumentForDataset(session.dataset) +
                  " · " +
                  (session.broker.specs.currency ?? "USD") +
                  " account · " +
                  INSTRUMENTS[instrumentForDataset(session.dataset)].unit
                : "XAUUSD"}
            </small>
          </div>
        </div>
        <div className="quote">
          <span>BID</span>
          <b className="green">{session ? num(session.tick.bid) : "—"}</b>
        </div>
        <div className="quote">
          <span>ASK</span>
          <b>{session ? num(session.tick.ask) : "—"}</b>
        </div>
        <div className="metric">
          <span>Spread</span>
          <b>{session ? num(session.tick.ask - session.tick.bid) : "—"}</b>
        </div>
        <div className="strip-divider" />
        <div className="metric">
          <span>Balance</span>
          <b>{a ? money(a.balance) : "$500,00"}</b>
        </div>
        <div className="metric">
          <span>Equity</span>
          <b>{a ? money(a.equity) : "$500,00"}</b>
        </div>
        <div className="metric">
          <span>Floating P/L</span>
          <b className={(a?.floating ?? 0) >= 0 ? "green" : "red"}>
            {a ? money(a.floating) : "—"}
          </b>
        </div>
        <div className="metric">
          <span>Used / free margin</span>
          <b>{a ? `${money(a.usedMargin)} / ${money(a.freeMargin)}` : "—"}</b>
        </div>
      </div>
      <main className="workspace">
        <aside className="drawing-toolbar">
          {toolbar.map(([t, title, icon]) => (
            <IconButton
              key={t}
              title={title}
              active={tool === t}
              onClick={() => {
                setTool(t);
                if (state.playing) act({ type: "play", value: false });
              }}
              disabled={!session}
            >
              {icon}
            </IconButton>
          ))}
          <hr />
          <IconButton
            title={`Magnet: ${look.magnet === "off" ? "off" : look.magnet === "strong" ? "strong" : "weak"} · hold Ctrl to toggle`}
            active={look.magnet !== "off"}
            onClick={() =>
              act({
                type: "appearance",
                value: {
                  ...look,
                  magnet:
                    look.magnet === "off"
                      ? "weak"
                      : look.magnet === "weak"
                        ? "strong"
                        : "off",
                },
              })
            }
          >
            <ToolIcon kind="magnet" />
          </IconButton>
          <IconButton
            title="Undo drawing (Ctrl+Z)"
            onClick={() => act({ type: "drawing.undo" })}
            disabled={!session?.undo.length}
          >
            <Undo2 size={17} />
          </IconButton>
          <IconButton
            title="Redo drawing (Ctrl+Y / Ctrl+Shift+Z)"
            onClick={() => act({ type: "drawing.redo" })}
            disabled={!session?.redo.length}
          >
            <Redo2 size={17} />
          </IconButton>
          <div className="toolbar-bottom">
            <IconButton
              title="Chart tools and shortcuts (?)"
              onClick={() => {
                setModal("help");
                if (state.playing) act({ type: "play", value: false });
              }}
            >
              <CircleHelp size={17} />
            </IconButton>
            <IconButton
              title="Go to replay point"
              onClick={() => chart.current?.current()}
            >
              <Crosshair size={18} />
            </IconButton>
          </div>
        </aside>
        <section className="center">
          <div className="chart-controls">
            <div className="frames">
              {(Object.keys(FRAMES) as TF[]).map((tf) => (
                <button
                  key={tf}
                  className={session?.layout.timeframe === tf ? "chosen" : ""}
                  onClick={() => layout({ timeframe: tf })}
                  disabled={!session}
                >
                  {tf}
                </button>
              ))}
            </div>
            <div className="chart-control-actions">
              <button
                aria-label="Ny ordre"
                className="new-draft-button"
                disabled={!session}
                onClick={() => void newOrderDraft()}
                title="Lag et utkast. Du kan også høyreklikke på en pris i charten."
              >
                <span>+</span> Ny ordre
              </button>
              <button
                className="toolbar-button"
                aria-pressed={session?.layout.htf?.enabled ?? true}
                title="Vis én pågående 4-timers candle på chartets prisskala"
                onClick={() =>
                  layout({
                    htf: {
                      ...DEFAULT_HTF,
                      ...session?.layout.htf,
                      enabled: !(session?.layout.htf?.enabled ?? true),
                    },
                  })
                }
              >
                4H-candle
              </button>
              <button
                className="toolbar-button"
                title="Forklaring, video og praktisk 4H-øvelse"
                onClick={() => {
                  setModal("learn4h");
                  act({ type: "play", value: false });
                }}
              >
                <BookOpen size={14} /> Lær 4H
              </button>
              <button
                className="toolbar-button challenge-entry"
                title="Start eller fortsett utfordringer i denne økten"
                onClick={() => {
                  setModal("challenge");
                  act({ type: "play", value: false });
                }}
              >
                Utfordringer
                {session?.learning
                  ? " · " +
                    (CHALLENGES.findIndex(
                      (c) => c[0] === session.learning!.active.stage,
                    ) +
                      1) +
                    "/10"
                  : ""}
              </button>
              <button
                className="toolbar-button"
                title="Finn, navngi, skjul eller lås tegningene dine"
                onClick={() => setObjectsOpen(!objectsOpen)}
                aria-pressed={objectsOpen}
              >
                Tegninger {session?.drawings.length ?? 0}
              </button>
              <details className="chart-more">
                <summary title="Flere chartverktøy, leksjoner og hjelp">
                  Mer <ChevronDown size={13} />
                </summary>
                <div
                  role="menu"
                  onClick={(e) => {
                    const b = (e.target as Element).closest("button");
                    if (b)
                      e.currentTarget
                        .closest("details")
                        ?.removeAttribute("open");
                  }}
                >
                  <button role="menuitem" onClick={() => setModal("help")}>
                    Hva gjør knappene? <small>Forklaring og snarveier</small>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setSidebar("study");
                      layout({ ai: true });
                      act({ type: "play", value: false });
                    }}
                  >
                    Leksjoner og strategi{" "}
                    <small>C1/C2, kilder og egne regler</small>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      layout({ timeframe: "4H" });
                      setStudyPicking(true);
                    }}
                  >
                    Velg C1/C2 <small>Pek ut candlene AI-en skal vurdere</small>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => setModal("indicators")}
                  >
                    Indikatorer{" "}
                    <small>Legg til for eksempel EMA eller RSI</small>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => layout({ dual: !session?.layout.dual })}
                  >
                    To charts <small>Se to tidsrammer samtidig</small>
                  </button>
                  <button role="menuitem" onClick={() => chart.current?.fit()}>
                    Tilpass chart{" "}
                    <small>Tilbakestill zoom til replay-punktet</small>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => chart.current?.overview()}
                  >
                    Vis hele historikken{" "}
                    <small>Zoom ut til alle lastede candles</small>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => setTicketOpen(!ticketOpen)}
                  >
                    Ordredetaljer <small>Åpne det kompakte ordrepanelet</small>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setFeedOpen(true);
                      layout({ ai: true });
                    }}
                  >
                    Telegram <small>Åpne dine egne kilder</small>
                  </button>
                  {session && sessionTrades(session).length > 0 && (
                    <button
                      role="menuitem"
                      onClick={() => locateTrade(sessionTrades(session)[0].id)}
                    >
                      Vis siste trade{" "}
                      <small>Finn inngang og utgang på charten</small>
                    </button>
                  )}
                </div>
              </details>
            </div>
          </div>
          {(tool !== "select" || studyPicking) && (
            <div className="tool-explainer" role="status">
              <b>
                {studyPicking
                  ? "Velg C1"
                  : toolbar.find((t) => t[0] === tool)?.[1]}
              </b>
              <span>
                {studyPicking
                  ? "Klikk på den første candlen. Neste ferdige candle blir C2."
                  : tool === "horizontal"
                    ? "Klikk én gang ved ønsket pris."
                    : "Velg to punkter eller dra. Shift låser linjer vannrett/loddrett. Esc avslutter."}
              </span>
              <button
                onClick={() => {
                  setTool("select");
                  setStudyPicking(false);
                  setSelected(null);
                }}
              >
                Avslutt
              </button>
            </div>
          )}
          {objectsOpen && session && (
            <div className="object-list" aria-label="Drawing objects">
              <header>
                Objects <button onClick={() => setObjectsOpen(false)}>×</button>
              </header>
              {session.drawings.map((d) => (
                <div key={d.id} className={selected === d.id ? "selected" : ""}>
                  <button
                    onClick={() => setSelected(d.id)}
                    title="Select drawing"
                  >
                    {d.kind}
                  </button>
                  <input
                    aria-label={"Name " + d.id}
                    defaultValue={d.label}
                    placeholder="Name"
                    onBlur={(e) =>
                      act({
                        type: "drawing.patch",
                        id: d.id,
                        patch: { label: e.target.value },
                      })
                    }
                  />
                  <button
                    aria-label={"Visibility " + d.id}
                    aria-pressed={!d.hidden}
                    onClick={() =>
                      act({
                        type: "drawing.patch",
                        id: d.id,
                        patch: { hidden: !d.hidden },
                      })
                    }
                  >
                    {d.hidden ? "Show" : "Hide"}
                  </button>
                  <button
                    aria-label={"Lock " + d.id}
                    aria-pressed={d.locked}
                    onClick={() =>
                      act({
                        type: "drawing.patch",
                        id: d.id,
                        patch: { locked: !d.locked },
                      })
                    }
                  >
                    {d.locked ? "Unlock" : "Lock"}
                  </button>
                  <button
                    aria-label={"Delete " + d.id}
                    onClick={() => act({ type: "drawing.remove", id: d.id })}
                  >
                    ×
                  </button>
                </div>
              ))}
              {!session.drawings.length && (
                <p>Draw on the chart to add an object.</p>
              )}
            </div>
          )}
          {chartMenu && (
            <div
              className="chart-context-menu"
              role="menu"
              style={{
                left: Math.min(chartMenu.x, window.innerWidth - 240),
                top: Math.min(chartMenu.y, window.innerHeight - 310),
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setChartMenu(null);
              }}
            >
              <b>{num(chartMenu.price)}</b>
              <button
                role="menuitem"
                autoFocus
                onClick={() => void newOrderDraft(chartMenu.price)}
              >
                New order draft here
              </button>
              {(
                [
                  "horizontal",
                  "trend",
                  "ray",
                  "zone",
                  "fib",
                  "long",
                  "short",
                ] as Tool[]
              ).map((t) => (
                <button
                  role="menuitem"
                  key={t}
                  onClick={() => {
                    setTool(t);
                    setChartMenu(null);
                  }}
                >
                  {t === "fib" ? "Fibonacci" : t}
                </button>
              ))}
              <button
                role="menuitem"
                onClick={() => {
                  chart.current?.fit();
                  setChartMenu(null);
                }}
              >
                Fit chart
              </button>
              <button role="menuitem" onClick={() => setChartMenu(null)}>
                Close menu
              </button>
            </div>
          )}
          <div className={"chart-area " + (session?.layout.dual ? "dual" : "")}>
            {session ? (
              <>
                <Chart
                  ref={chart}
                  htfBars={state.htfBars ?? []}
                  onHTFChange={(htf) => layout({ htf })}
                  onLearnHTF={() => {
                    setModal("learn4h");
                    if (state.playing) act({ type: "play", value: false });
                  }}
                  bars={state.bars}
                  appearance={look}
                  picker={picker}
                  studyPicking={studyPicking}
                  onStudyPick={(c1Time) => {
                    void call({
                      type: "study.range",
                      timeframe: session.layout.timeframe as RRTimeframe,
                      c1Time,
                      cursor: session.broker.seq,
                    })
                      .then(() => setStudyPicking(false))
                      .catch(() => {});
                  }}
                  onContext={setChartMenu}
                  onDraftLots={(value) => {
                    setRiskMode("lots");
                    setLots(String(value));
                  }}
                  planLots={effectiveLots || 0.01}
                  onCancelDraft={cancelDraft}
                  onCancelPending={(id) => act({ type: "pending.cancel", id })}
                  onPendingEdit={(id, changes) => {
                    void (async () => {
                      await call({ type: "pending.edit", id, changes });
                      const updated = (await call({
                        type: "state",
                      })) as AppState;
                      const pending = updated.session?.broker.pending.find(
                        (p) => p.id === id,
                      );
                      if (!pending) return;
                      await new Promise<void>((r) =>
                        requestAnimationFrame(() =>
                          requestAnimationFrame(() => r()),
                        ),
                      );
                      await call({
                        type: "pending.snapshot",
                        id,
                        revision: pending.revisions?.length,
                        cursor: chart.current?.cursor(),
                        screenshot: await chart.current?.capture(),
                      });
                    })().catch(() => {});
                  }}
                  orderDraft={
                    previewActive &&
                    !["long", "short"].includes(tool) &&
                    !selectedDrawing
                      ? {
                          side,
                          kind,
                          entry: entryPrice,
                          sl: sl ? Number(sl) : undefined,
                          tp: tp ? Number(tp) : undefined,
                          lots: effectiveLots,
                          autoSide: true,
                        }
                      : undefined
                  }
                  onOrderLevel={(role, price) => {
                    setPreviewActive(true);
                    if (role === "sl") setSL(num(price));
                    else if (role === "tp") setTP(num(price));
                    else changeEntry(price);
                    setPicker(null);
                  }}
                  levels={state.levels}
                  session={session}
                  timeframe={session.layout.timeframe}
                  tool={tool}
                  selected={selected}
                  onSelect={setSelected}
                  onDraw={(ds) => {
                    act({ type: "drawings", value: ds });
                    setTool("select");
                  }}
                  onProtect={(id, sl, tp) =>
                    act({ type: "position.edit", id, sl, tp })
                  }
                  onRange={(value) => act({ type: "viewport", value })}
                />
                {session.layout.dual && (
                  <div className="second-container">
                    <select
                      aria-label="Second timeframe"
                      className="second-frame"
                      value={session.layout.second}
                      onChange={(e) => layout({ second: e.target.value as TF })}
                    >
                      {Object.keys(FRAMES).map((tf) => (
                        <option key={tf}>{tf}</option>
                      ))}
                    </select>
                    <Chart
                      bars={state.secondBars}
                      appearance={look}
                      levels={state.levels}
                      session={session}
                      timeframe={session.layout.second}
                      tool="select"
                      selected={null}
                      onSelect={() => {}}
                      onDraw={() => {}}
                      onProtect={() => {}}
                      onRange={(value) =>
                        act({ type: "viewport", value, secondary: true })
                      }
                      secondary
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="welcome">
                <div className="welcome-art">
                  <Activity size={44} strokeWidth={1} />
                </div>
                <small>A CLEAR SPACE TO PRACTISE</small>
                <h1>
                  Read the setup.
                  <br />
                  <span>Make your own decision.</span>
                </h1>
                <p>
                  Practise with real historical gold quotes and a separate paper
                  account. Only past data is visible.
                </p>
                <button
                  className="primary"
                  onClick={() =>
                    setModal(state.coverage.hours ? "sessions" : "data")
                  }
                >
                  {state.coverage.importer.running
                    ? "Preparing real chart data…"
                    : state.coverage.hours
                      ? "Select practice session"
                      : "Download history"}
                  <ChevronRight size={16} />
                </button>
                <p className="micro">
                  {state.coverage.importer.running
                    ? "First setup downloads a small real-tick starter period automatically. AI prepares separately in the sidebar."
                    : state.coverage.importer.error
                      ? "Data setup was interrupted. Open Data hours to retry or import your own prices."
                      : "No broker connection · Simulated orders only"}
                </p>
              </div>
            )}
          </div>
          {(modal === "challenge" || modal === "learn4h") && (
            <Modal
              wide
              title={
                modal === "challenge"
                  ? "Utfordringer og progresjon"
                  : "Lær 4H-candles"
              }
              onClose={() => setModal("")}
            >
              <LearningHub
                state={state}
                initial={modal === "challenge" ? "challenges" : "4h"}
                call={call}
                showChart={(timeframe) => {
                  layout({
                    timeframe,
                    htf: {
                      ...DEFAULT_HTF,
                      ...session?.layout.htf,
                      enabled: true,
                      count: 1,
                      timeframe: "4H",
                    },
                  });
                  setModal("");
                }}
              />
            </Modal>
          )}
          {selectedDrawing && (
            <div className="selection-bar">
              <span>{selectedDrawing.kind} · selected</span>
              <input
                aria-label="Drawing name"
                placeholder="Label"
                value={selectedDrawing.label}
                onChange={(e) => changeDrawing({ label: e.target.value })}
              />
              <input
                type="color"
                aria-label="Drawing color"
                value={selectedDrawing.color}
                onChange={(e) => changeDrawing({ color: e.target.value })}
              />
              <IconButton
                title={selectedDrawing.locked ? "Unlock" : "Lock drawing"}
                onClick={() =>
                  changeDrawing({ locked: !selectedDrawing.locked })
                }
              >
                {selectedDrawing.locked ? (
                  <Lock size={14} />
                ) : (
                  <Unlock size={14} />
                )}
              </IconButton>
              <IconButton
                title="Duplicate drawing"
                onClick={() =>
                  act({
                    type: "drawings",
                    value: [
                      ...session!.drawings,
                      {
                        ...selectedDrawing,
                        id: crypto.randomUUID(),
                        a: {
                          ...selectedDrawing.a,
                          time:
                            selectedDrawing.a.time +
                            FRAMES[session!.layout.timeframe],
                        },
                        b: {
                          ...selectedDrawing.b,
                          time:
                            selectedDrawing.b.time +
                            FRAMES[session!.layout.timeframe],
                        },
                      },
                    ],
                  })
                }
              >
                <Copy size={14} />
              </IconButton>
              <IconButton
                title="Delete selected drawing"
                onClick={() => {
                  act({
                    type: "drawings",
                    value: session!.drawings.filter((d) => d.id !== selected),
                  });
                  setSelected(null);
                }}
              >
                <Trash2 size={14} />
              </IconButton>
              {selectedDrawing.kind === "fib" && (
                <button className="quiet" onClick={() => setModal("fib")}>
                  Edit levels
                </button>
              )}
              {["long", "short"].includes(selectedDrawing.kind) && (
                <>
                  <div className="plan-inputs">
                    {(
                      [
                        ["sl", "SL", planLevels(selectedDrawing).sl],
                        ["tp", "TP", planLevels(selectedDrawing).tp],
                        [
                          "rr",
                          "R:R",
                          Math.abs(
                            planLevels(selectedDrawing).tp -
                              selectedDrawing.a.price,
                          ) /
                            Math.max(
                              0.001,
                              Math.abs(
                                selectedDrawing.a.price -
                                  selectedDrawing.b.price,
                              ),
                            ),
                        ],
                      ] as const
                    ).map(([key, label, value]) => (
                      <label key={selectedDrawing.id + key}>
                        <span>{label}</span>
                        <input
                          key={`${selectedDrawing.id}:${key}:${value}`}
                          aria-label={`Plan ${label}`}
                          type="number"
                          min="0.001"
                          step={key === "rr" ? 0.1 : 0.001}
                          defaultValue={Number(
                            value.toFixed(
                              key === "rr"
                                ? 2
                                : session!.broker.specs.precision,
                            ),
                          )}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                          onBlur={(e) => {
                            const v = +e.target.value;
                            if (!Number.isFinite(v) || v <= 0) return;
                            if (key === "sl")
                              changeDrawing({
                                b: { ...selectedDrawing.b, price: v },
                                target: planLevels(selectedDrawing).tp,
                              });
                            else
                              changeDrawing({
                                target:
                                  key === "rr"
                                    ? selectedDrawing.a.price +
                                      (selectedDrawing.a.price -
                                        selectedDrawing.b.price) *
                                        v
                                    : v,
                              });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <button className="quiet" onClick={usePlan}>
                    Use in order
                  </button>
                </>
              )}
            </div>
          )}
          <div className="replay-bar">
            <button
              className={"play-button " + (state.playing ? "playing" : "")}
              aria-label={state.playing ? "Pause replay" : "Play replay"}
              onClick={() => act({ type: "play", value: !state.playing })}
              disabled={!session}
            >
              {state.playing ? (
                <Pause size={16} fill="currentColor" />
              ) : (
                <Play size={16} fill="currentColor" />
              )}
            </button>
            <IconButton
              title="Next candle (Space / right arrow)"
              onClick={() => act({ type: "step", kind: "candle" })}
              disabled={!session}
            >
              <SkipForward size={17} />
            </IconButton>
            <button
              className="tick-step"
              title="Next real tick"
              onClick={() => act({ type: "step", kind: "tick" })}
              disabled={!session}
            >
              + tick
            </button>
            <div className="speed-options">
              {[1, 5, 10, 30, 100].map((v) => (
                <button
                  key={v}
                  className={state.speed === v ? "chosen" : ""}
                  onClick={() => act({ type: "speed", value: v })}
                >
                  {v}×
                </button>
              ))}
            </div>
            <div className="virtual-clock">
              <Clock size={13} />
              {session
                ? stamp(
                    session.tick.t,
                    session.layout.blind,
                    session.layout.timezone,
                  )
                : "Select historical time"}
              <span>{session ? "Replay time" : "Paused"}</span>
            </div>
            <button
              className={
                "blind-toggle " + (session?.layout.blind ? "active" : "")
              }
              onClick={() => layout({ blind: !session?.layout.blind })}
              disabled={!session}
            >
              Blind mode {session?.layout.blind ? "on" : "off"}
            </button>
          </div>
          <div
            className="panel-resizer"
            onPointerDown={(e) => {
              const initial = e.clientY,
                height = session?.layout.bottom ?? 232;
              const move = (event: PointerEvent) => {
                const bottom = Math.max(
                  140,
                  Math.min(480, height + initial - event.clientY),
                );
                document.documentElement.style.setProperty(
                  "--bottom-height",
                  bottom + "px",
                );
              };
              const up = (event: PointerEvent) => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
                layout({
                  bottom: Math.max(
                    140,
                    Math.min(480, height + initial - event.clientY),
                  ),
                });
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
            }}
          />
          <section
            className="bottom-panel"
            style={{
              height:
                "var(--bottom-height, " +
                (session?.layout.bottom ?? 232) +
                "px)",
            }}
          >
            {a && (
              <div className="paper-summary">
                <b>Paper Trading</b>
                <span>
                  Balance <strong>{money(session!.broker.balance)}</strong>
                </span>
                <span>
                  Equity <strong>{money(a.equity)}</strong>
                </span>
                <span>
                  Floating P/L{" "}
                  <strong className={a.floating >= 0 ? "green" : "red"}>
                    {money(a.floating)}
                  </strong>
                </span>
                <span>
                  Margin <strong>{money(a.usedMargin)}</strong>
                </span>
                <span>
                  Free margin <strong>{money(a.freeMargin)}</strong>
                </span>
              </div>
            )}
            <div className="tabs">
              {[
                ["positions", "Positions", session?.broker.positions.length],
                ["pending", "Orders", session?.broker.pending.length],
                ["history", "History", session?.broker.fills.length],
                ["journal", "Journal", session?.notes.length],
                ["stats", "Statistics", null],
                ["account", "Account", null],
              ].map(([key, label, count]) => (
                <button
                  key={key}
                  onClick={() => setTab(String(key))}
                  className={tab === key ? "active" : ""}
                >
                  {label}
                  {count !== null && <span>{count ?? 0}</span>}
                </button>
              ))}
              <span className="hedge-label">PAPER TRADING</span>
            </div>
            {!session ? (
              <div className="empty-small">
                A new session starts with $500 in virtual funds.
              </div>
            ) : (
              <Bottom
                tab={tab}
                session={session}
                act={act}
                call={call}
                note={note}
                setNote={setNote}
                setModal={setModal}
                locateTrade={locateTrade}
                reviewTrade={(id) => {
                  setReviewTradeId(id);
                  setChatMode("Review trade");
                  setDraft(
                    "Was this trade a valid setup? Answer directly using the chart at my decision.",
                  );
                  setSidebar("assistant");
                  layout({ ai: true });
                }}
              />
            )}
          </section>
        </section>
        {ticketOpen && session && (
          <aside
            className="order-panel compact-ticket"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <header>
              <b>{previewActive ? "Order draft" : "New order"}</b>
              <button
                aria-label="Hide order ticket"
                onClick={() => setTicketOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="ticket-grid">
              <label>
                Order type
                <select
                  aria-label="Order type"
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as any);
                    setPreviewActive(true);
                  }}
                >
                  <option value="limit">Level · auto BUY/SELL</option>
                  <option value="market">Market</option>
                </select>
              </label>
              <label>
                Direction
                {kind === "market" ? (
                  <select
                    aria-label="Direction"
                    value={marketSide}
                    onChange={(e) => setMarketSide(e.target.value as any)}
                  >
                    <option value="buy">BUY</option>
                    <option value="sell">SELL</option>
                  </select>
                ) : (
                  <b className={side}>{side.toUpperCase()}</b>
                )}
              </label>
              <label>
                ENTRY
                <input
                  aria-label="Entry price"
                  type="number"
                  step={session.broker.specs.tickSize ?? 0.001}
                  value={kind === "market" ? entryPrice : entry}
                  disabled={kind === "market"}
                  onChange={(e) => {
                    setEntry(e.target.value);
                    setPreviewActive(true);
                  }}
                />
              </label>
              <label>
                {session.broker.specs.unit ?? "Lots"}
                <input
                  aria-label="Order size"
                  type="number"
                  min={session.broker.specs.minLot}
                  step={session.broker.specs.lotStep}
                  value={lots}
                  onChange={(e) => {
                    setLots(e.target.value);
                    setRiskMode("lots");
                  }}
                />
              </label>
              <label>
                SL
                <input
                  aria-label="Order stop loss"
                  type="number"
                  step={session.broker.specs.tickSize ?? 0.001}
                  value={sl}
                  placeholder="Optional"
                  onChange={(e) => {
                    setSL(e.target.value);
                    setPreviewActive(true);
                  }}
                />
              </label>
              <label>
                TP
                <input
                  aria-label="Order take profit"
                  type="number"
                  step={session.broker.specs.tickSize ?? 0.001}
                  value={tp}
                  placeholder="Optional"
                  onChange={(e) => {
                    setTP(e.target.value);
                    setPreviewActive(true);
                  }}
                />
              </label>
            </div>
            <p className="ticket-risk">
              Risk <b>{plannedRisk === null ? "No SL" : money(plannedRisk)}</b>{" "}
              · Reward <b>{reward === null ? "—" : money(reward)}</b>
              <br />
              R:R{" "}
              <b>
                {plannedRisk && reward
                  ? (reward / plannedRisk).toFixed(2)
                  : "—"}
              </b>{" "}
              · Margin <b>{money(requiredMargin)}</b>
            </p>
            {previewActive &&
              issues.map((issue) => (
                <p className="inline-error" key={issue}>
                  {issue}
                </p>
              ))}
            <button
              className="submit-order"
              disabled={busy || issues.length > 0}
              onClick={() => void order()}
            >
              {busy ? "Saving…" : "Place order"}
            </button>
            <div className="ticket-actions">
              <button
                onClick={() => {
                  setPreviewActive(true);
                  setEntry(num(entryPrice || session.tick.bid));
                }}
              >
                Add entry · same setup
              </button>
              <button onClick={cancelDraft}>Cancel draft</button>
            </div>
            <p className="setup-total">
              Setup: {setupEntries.length + (previewActive ? 1 : 0)} entries ·
              combined risk{" "}
              {setupRisk === null ? "SL missing" : money(setupRisk)}. Add entry
              keeps the setup and SL; choose the next entry and TP.
            </p>
            <details>
              <summary>Notes & risk sizing</summary>
              <label>
                Size by
                <select
                  value={riskMode}
                  onChange={(e) => setRiskMode(e.target.value)}
                >
                  <option value="lots">Quantity</option>
                  <option value="percent">Risk %</option>
                  <option value="cash">Cash risk</option>
                </select>
              </label>
              {riskMode !== "lots" && (
                <input
                  aria-label="Risk budget"
                  type="number"
                  value={riskValue}
                  onChange={(e) => setRiskValue(e.target.value)}
                />
              )}
              <textarea
                aria-label="Trade thesis"
                value={thesis}
                onChange={(e) => setThesis(e.target.value)}
                placeholder="What would make your idea wrong?"
              />
              <button onClick={() => setModal("notebook")}>
                Strategy rules
              </button>
            </details>
          </aside>
        )}
        <aside
          className={"ai-panel " + (!session?.layout.ai ? "collapsed" : "")}
        >
          <button
            className="ai-collapse"
            title={session?.layout.ai ? "Hide sidebar" : "Show sidebar"}
            onClick={() => layout({ ai: !session?.layout.ai })}
          >
            {session?.layout.ai ? (
              <PanelRightClose size={17} />
            ) : (
              <MessageSquare size={17} />
            )}
          </button>
          {session?.layout.ai && (
            <>
              <nav className="sidebar-tabs" aria-label="Side panel">
                <button
                  className={sidebar === "assistant" ? "selected" : ""}
                  onClick={() => setFeedOpen(false)}
                >
                  Assistant
                </button>
                <button
                  className={feedOpen ? "selected" : ""}
                  onClick={() => setFeedOpen(true)}
                >
                  <Send size={13} />
                  Telegram
                  {feedCount > 0 && (
                    <small className="feed-count">
                      {Math.min(99, feedCount)}
                    </small>
                  )}
                </button>
                <button
                  className={sidebar === "study" ? "selected" : ""}
                  onClick={() => {
                    setSidebar("study");
                    if (state.playing) act({ type: "play", value: false });
                  }}
                >
                  Læring
                </button>
              </nav>
              {sidebar === "study" ? (
                <RRStudyPanel
                  state={state}
                  call={call}
                  picking={studyPicking}
                  pick={(value) => {
                    setStudyPicking(value);
                    setTool("select");
                    setSelected(null);
                    setPicker(null);
                  }}
                  focusRange={() => chart.current?.focusStudy()}
                  onDraft={(value) => {
                    studyDraft.current = value;
                  }}
                />
              ) : feedOpen ? (
                <TelegramPanel embedded close={() => setFeedOpen(false)} />
              ) : (
                <AssistantPanel
                  state={state}
                  tradeId={reviewTradeId}
                  setTradeId={setReviewTradeId}
                  draft={draft}
                  setDraft={setDraft}
                  mode={chatMode}
                  setMode={setChatMode}
                  send={() => ask()}
                  assess={() =>
                    ask(
                      "Vurder oppsettet mitt på den synlige charten. Les tegningene, innganger, SL og TP og relevant høyere tidsramme. Forklar hva som er støttet av mine regler, hva som mangler, og ett neste læringspunkt.",
                      "Check setup",
                      "chart",
                    )
                  }
                  sending={sendingAI}
                  act={act}
                  openSettings={() => setModal("settings")}
                />
              )}
            </>
          )}
        </aside>
      </main>
      <footer className="statusbar">
        <div>
          <span className="status-dot" />
          {state.playing ? "Playing" : session ? "Paused" : "No active session"}
          <span className="muted">
            {session?.status || "Download price data and select a session."}
          </span>
        </div>
        <span>
          {state.recovered
            ? "Recovered checkpoint"
            : "Local transaction storage"}
          <span className="footer-sep">/</span>
          {state.ai.latency
            ? `${(state.ai.latency / 1000).toFixed(1)} s · last response`
            : "Local only"}
        </span>
      </footer>
      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button title="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {modal === "sessions" && (
        <Sessions state={state} call={call} close={() => setModal("")} />
      )}
      {modal === "data" && (
        <DataModal state={state} call={call} close={() => setModal("")} />
      )}
      {modal === "settings" && (
        <SettingsModal state={state} call={call} close={() => setModal("")} />
      )}
      {modal === "help" && (
        <Modal title="Chart tools and shortcuts" onClose={() => setModal("")}>
          <WorkspaceHelp />
        </Modal>
      )}
      {modal === "indicators" && session && (
        <Indicators
          session={session}
          bars={state.bars}
          act={act}
          close={() => setModal("")}
        />
      )}
      {modal === "notebook" && (
        <Notebook
          session={session ?? null}
          call={call}
          close={() => setModal("")}
        />
      )}
      {modal === "fib" && selectedDrawing && (
        <Fib
          drawing={selectedDrawing}
          change={changeDrawing}
          close={() => setModal("")}
        />
      )}
    </div>
  );
}
function Sessions({
  state,
  call,
  close,
}: {
  state: AppState;
  call: (c: any) => Promise<any>;
  close: () => void;
}) {
  const [eligible, setEligible] = useState<any[]>([]),
    [date, setDate] = useState(""),
    [challenge, setChallenge] = useState(""),
    [name, setName] = useState(state.session?.name ?? ""),
    [issue, setIssue] = useState("");
  useEffect(() => {
    void call({ type: "sessions.eligible" })
      .then(setEligible)
      .catch((e) => setIssue(String(e)));
  }, []);
  const action = async (c: any) => {
    try {
      await call(c);
      close();
    } catch (e) {
      setIssue(String(e));
    }
  };
  return (
    <Modal title="Your next practice session" onClose={close} wide>
      <p className="lead">
        Resume exactly where you left off, or start at a new time with a
        separate account.
      </p>
      <label className="field">
        <span>Fri trening eller utfordring / Practice mode</span>
        <select
          aria-label="Practice mode"
          value={challenge}
          onChange={(e) => setChallenge(e.target.value)}
        >
          <option value="">Fri trening / Free practice</option>
          {CHALLENGES.map((c, i) => (
            <option value={c[0]} key={c[0]}>
              {i + 1}. {c[1]} / {c[2]}
            </option>
          ))}
        </select>
      </label>
      <div className="session-choices">
        <button
          onClick={() =>
            state.session
              ? close()
              : setIssue("No previous session has been saved.")
          }
          disabled={!state.session}
        >
          <Clock />
          <b>Continue</b>
          <span>
            {state.session ? state.session.name : "No saved session yet"}
          </span>
        </button>
        <button
          onClick={() =>
            void action({
              type: "sessions.new",
              challenge: challenge || undefined,
            })
          }
          disabled={!eligible.length}
        >
          <Shuffle />
          <b>Random session</b>
          <span>
            Fresh window ·{" "}
            {state.session?.dataset === "dukascopy:NAS100"
              ? "USD 10,000"
              : (state.session?.broker.specs.currency ?? "USD") + " 500"}
          </span>
        </button>
        <div className="date-choice">
          <Clock />
          <b>Select time (UTC)</b>
          <select value={date} onChange={(e) => setDate(e.target.value)}>
            <option value="">
              {eligible.length
                ? "Select an available hour"
                : "No eligible hours yet"}
            </option>
            {eligible.map((e) => (
              <option key={e.hour} value={e.hour}>
                {new Date(e.hour).toISOString().slice(0, 16).replace("T", " ")}
              </option>
            ))}
          </select>
          <button
            className="quiet"
            disabled={!date}
            onClick={() =>
              void action({
                type: "sessions.new",
                timestamp: Number(date),
                challenge: challenge || undefined,
              })
            }
          >
            Start new account
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <p className="micro">
        Requires 24 open hours of past context and 4 open practice hours without
        unknown gaps. Blind mode can hide the date.
      </p>
      {issue && <p className="inline-error">{issue}</p>}
      <h3>Saved sessions</h3>
      <div className="saved-sessions">
        {state.sessions.length ? (
          state.sessions.map((s) => (
            <button
              key={s.id}
              onClick={() =>
                void action({ type: "sessions.continue", id: s.id })
              }
            >
              <div>
                <b>{s.name}</b>
                <span>
                  {s.mode === "review" ? "Review" : "Practice"} · last saved{" "}
                  {new Date(s.updated).toLocaleString("en-GB")}
                </span>
              </div>
              <ChevronRight size={17} />
            </button>
          ))
        ) : (
          <p className="muted">Your sessions and journals appear here.</p>
        )}
      </div>
      {state.session && (
        <div className="inline-edit">
          <input
            aria-label="Session name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="secondary-button"
            onClick={() => void action({ type: "sessions.rename", name })}
          >
            Rename
          </button>
        </div>
      )}
      <div className="modal-actions">
        <button
          className="secondary-button"
          onClick={() =>
            void call({ type: "backup.export" }).catch((e) =>
              setIssue(String(e)),
            )
          }
          disabled={!state.session}
        >
          <Download size={15} />
          Export backup
        </button>
        <button
          className="secondary-button"
          onClick={() => void action({ type: "backup.import" })}
        >
          <Upload size={15} />
          Import backup
        </button>
      </div>
    </Modal>
  );
}
function DataModal({
  state,
  call,
  close,
}: {
  state: AppState;
  call: (c: any) => Promise<any>;
  close: () => void;
}) {
  const c = state.coverage,
    [issue, setIssue] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [csv, setCsv] = useState<any>(null),
    [datasets, setDatasets] = useState<any[]>([]),
    [mapping, setMapping] = useState({
      timestamp: "timestamp",
      bid: "bid",
      ask: "ask",
      bidVolume: "",
      askVolume: "",
      timezone: "UTC",
      unit: "iso",
      delimiter: ",",
    });
  useEffect(() => {
    void call({ type: "datasets" }).then(setDatasets);
  }, [c.source]);
  const act = (value: any) =>
    void call(value).catch((e) => setIssue(String(e)));
  return (
    <Modal title="Historical prices" onClose={close} wide>
      <div className="coverage-cards">
        <div>
          <small>VERIFIED HOURS</small>
          <strong>{c.hours.toLocaleString("en-GB")}</strong>
        </div>
        <div>
          <small>BID/ASK TICKS</small>
          <strong>{c.tickCount.toLocaleString("en-GB")}</strong>
        </div>
        <div>
          <small>SOURCE FILES</small>
          <strong>
            {(c.bytes / 1048576).toFixed(1)} <em>MB</em>
          </strong>
        </div>
        <div>
          <small>UNVERIFIED GAPS</small>
          <strong className={c.gaps ? "red" : ""}>{c.gaps}</strong>
        </div>
      </div>
      <p className="lead">
        {c.first && c.last
          ? `${new Date(c.first).toISOString()} → ${new Date(c.last).toISOString()}`
          : "No price data has been downloaded yet."}
      </p>
      <p className="micro">
        {c.source} · UTC storage · volume is the feed's quote volume, not total
        gold-market volume. {c.expectedClosures} hours are classified as
        recurring market breaks. {c.intrahourGaps} internal tick gaps are marked
        in downloaded hours.
      </p>
      {datasets.length > 1 && (
        <Field label="Active dataset">
          <select
            onChange={(e) => act({ type: "dataset", value: e.target.value })}
            defaultValue={state.session?.dataset ?? "dukascopy"}
          >
            {datasets.map((d) => (
              <option key={d.dataset}>{d.dataset}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Data folder for new chunks">
        <div className="inline-edit">
          <input
            readOnly
            value={c.marketDirectory ?? state.diagnostics.storage}
          />
          <button
            className="secondary-button"
            onClick={() => act({ type: "storage.choose" })}
          >
            Select folder
          </button>
        </div>
      </Field>
      {c.range?.replayFrom && (
        <p className="micro">
          Practice range:{" "}
          {new Date(c.range.replayFrom).toISOString().slice(0, 10)} →{" "}
          {new Date(c.range.replayTo! - 1).toISOString().slice(0, 10)}. Extra
          warmup: {c.range.warmupDays} days. The range is complete only after
          all open hours are verified.
        </p>
      )}
      <section className="settings-section">
        <h3>Download the last completed year</h3>
        <p>
          The final day is checked during download. Eight extra days provide
          indicator warmup. Valid files are reused.
        </p>
        <div className="progress">
          <div
            style={{
              width: c.importer.total
                ? `${(100 * c.importer.done) / c.importer.total}%`
                : "0%",
            }}
          />
        </div>
        <div className="progress-label">
          <span>
            {c.importer.running
              ? "Import running"
              : c.importer.paused
                ? "Import paused"
                : "Ready / last import"}{" "}
            ·{" "}
            {c.importer.kind === "csv"
              ? `${(Number(c.importer.done ?? 0) / 1048576).toFixed(1)} / ${(Number(c.importer.total ?? 0) / 1048576).toFixed(1)} MB lest · ${c.importer.count ?? 0} ticks godkjent`
              : `${c.importer.done ?? 0} / ${c.importer.total ?? 0} timer behandlet`}
          </span>
          <span>{(Number(c.importer.bytes ?? 0) / 1048576).toFixed(1)} MB</span>
        </div>
        <small className="muted">{c.importer.current}</small>
        <div className="modal-actions">
          <button
            className="primary"
            onClick={() => act({ type: "import.start", year: true })}
            disabled={c.importer.running}
          >
            <Download size={15} />
            Download / resume year
          </button>
          <button
            className="secondary-button"
            onClick={() => act({ type: "import.pause" })}
            disabled={!c.importer.running}
          >
            Pause import
          </button>
        </div>
        {c.importer.error && <p className="inline-error">{c.importer.error}</p>}
      </section>
      <div className="field-row">
        <Field label="From (UTC, inclusive)">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="To (UTC, exclusive)">
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <button
          className="secondary-button"
          disabled={!from || !to || c.importer.running}
          onClick={() =>
            act({
              type: "import.start",
              from: Date.parse(from),
              to: Date.parse(to),
            })
          }
        >
          Import range
        </button>
      </div>
      <section className="settings-section">
        <h3>Import your own bid/ask ticks</h3>
        <p>
          CSV needs explicit time, bid and ask columns. Your files become a
          separate dataset. Bar-only import is unavailable; no tick path is
          invented.
        </p>
        <button
          className="secondary-button"
          onClick={() =>
            void call({ type: "csv.choose" })
              .then(setCsv)
              .catch((e) => setIssue(String(e)))
          }
        >
          <Upload size={14} />
          Select CSV file
        </button>
        {csv && (
          <>
            <pre className="csv-preview">{csv.preview.join("\n")}</pre>
            <div className="settings-grid">
              {(
                ["timestamp", "bid", "ask", "bidVolume", "askVolume"] as const
              ).map((key) => (
                <Field key={key} label={key + " (kolonnenavn)"}>
                  <input
                    value={mapping[key]}
                    onChange={(e) =>
                      setMapping({ ...mapping, [key]: e.target.value })
                    }
                  />
                </Field>
              ))}
              <Field label="Timezone for timestamps without an offset">
                <select
                  value={mapping.timezone}
                  onChange={(e) =>
                    setMapping({ ...mapping, timezone: e.target.value })
                  }
                >
                  <option>UTC</option>
                  <option>Europe/Oslo</option>
                  <option>Europe/London</option>
                  <option>America/New_York</option>
                </select>
              </Field>
              <Field label="Timestamp format">
                <select
                  value={mapping.unit}
                  onChange={(e) =>
                    setMapping({ ...mapping, unit: e.target.value })
                  }
                >
                  <option value="iso">ISO / YYYY-MM-DD HH:mm:ss.SSS</option>
                  <option value="ms">Epoch milliseconds</option>
                  <option value="s">Epoch seconds</option>
                </select>
              </Field>
              <Field label="Delimiter">
                <select
                  value={mapping.delimiter}
                  onChange={(e) =>
                    setMapping({ ...mapping, delimiter: e.target.value })
                  }
                >
                  <option value=",">Comma</option>
                  <option value=";">Semicolon</option>
                  <option value={"\t"}>Tab</option>
                </select>
              </Field>
            </div>
            <button
              className="primary"
              onClick={() => act({ type: "csv.import", mapping })}
            >
              Import selected file
            </button>
          </>
        )}
      </section>
      {issue && <p className="inline-error">{issue}</p>}
      <p className="micro">
        Unknown gaps pause replay. Weekends and documented recurring breaks are
        skipped with a visible time marker. Price files are local and are not
        included in session backups.
      </p>
    </Modal>
  );
}
function SettingsModal({
  state,
  call,
  close,
}: {
  state: AppState;
  call: (c: any) => Promise<any>;
  close: () => void;
}) {
  const [value, setValue] = useState<AISettings>(state.settings),
    [specs, setSpecs] = useState(state.session?.broker.specs),
    [issue, setIssue] = useState("");
  useEffect(() => {
    if (!value.model && state.settings.model)
      setValue((previous) => ({ ...previous, model: state.settings.model }));
  }, [state.settings.model]);
  const change = (patch: Partial<AISettings>) =>
    setValue({ ...value, ...patch });
  const run = async (c: any) => {
    try {
      await call(c);
    } catch (e) {
      setIssue(String(e));
    }
  };
  return (
    <Modal title="Local settings" onClose={close} wide>
      <DiscordSettings state={state} call={call} />
      <AppearanceSettings
        value={state.appearance ?? DEFAULT_APPEARANCE}
        save={(value) => call({ type: "appearance", value })}
      />
      <div className="settings-section">
        <h3>Chart Assistant · local AI</h3>
        {value.provider === "managed" && (
          <p className="micro">
            Automatic setup · no model selection or account is needed. The first
            launch downloads about 3.4 GB of verified files. Chart analysis
            stays on this PC. Keep the app open to finish; an interrupted
            download resumes next time.
          </p>
        )}
        <details>
          <summary>Advanced AI settings (optional)</summary>
          <p>
            Replay and accounting work independently of AI. GPU mode uses the
            selected offload setting. Low-memory mode uses a shorter context and
            fewer GPU layers. Gaming mode unloads the model.
          </p>
          <div className="settings-grid">
            <Field label="Local base address">
              <input
                value={value.url}
                onChange={(e) => change({ url: e.target.value })}
              />
            </Field>
            <Field label="Model ID (detected from runtime)">
              <input
                list="model-ids"
                value={value.model}
                onChange={(e) => change({ model: e.target.value })}
              />
              <datalist id="model-ids">
                {state.ai.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.vision ? "Vision" : "Text"}
                  </option>
                ))}
              </datalist>
            </Field>
            <Field label="Resource profile">
              <select
                value={value.profile}
                onChange={(e) => change({ profile: e.target.value as any })}
              >
                <option value="normal">GPU · selected offload</option>
                <option value="light">
                  Low memory · up to 4K / 25% of layers
                </option>
                <option value="gaming">Off / Gaming · unload</option>
              </select>
            </Field>
            <Field label="Context budget">
              <input
                type="number"
                min="1024"
                max="32768"
                step="1024"
                value={value.context}
                onChange={(e) => change({ context: Number(e.target.value) })}
              />
            </Field>
            <Field label="Response limit (tokens)">
              <input
                type="number"
                min="100"
                max="4096"
                value={value.maxTokens}
                onChange={(e) => change({ maxTokens: Number(e.target.value) })}
              />
            </Field>
            <Field label="GPU layers (not a utilization guarantee)">
              <select
                value={value.gpu}
                onChange={(e) => change({ gpu: e.target.value })}
              >
                <option value="max">Maximum</option>
                <option value="0.75">75% of layers</option>
                <option value="0.5">50% of layers</option>
                <option value="0.25">25% of layers</option>
                <option value="off">CPU</option>
              </select>
            </Field>
            <Field label="Unload after inactivity (minutes)">
              <input
                type="number"
                min="1"
                max="120"
                value={value.idleMinutes}
                onChange={(e) =>
                  change({ idleMinutes: Number(e.target.value) })
                }
              />
            </Field>
          </div>
          <div className="settings-checks">
            {(
              [
                ["enabled", "Remember AI enabled"],
                ["lazy", "Load on the first question"],
                ["vision", "Include a chart image when supported"],
                ["structured", "Structured rule review (JSON)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={value[key]}
                  onChange={(e) => change({ [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="modal-actions">
            <button
              className="primary"
              onClick={() => void run({ type: "ai.settings", value })}
            >
              <Save size={14} />
              Save AI profile
            </button>
            <button
              className="secondary-button"
              onClick={() => void run({ type: "ai.health" })}
            >
              Test / discover models
            </button>
            <button
              className="secondary-button"
              disabled={!state.settings.previous}
              onClick={() => void run({ type: "ai.rollback" })}
            >
              Restore previous profile
            </button>
          </div>
          <p className="micro">
            {state.ai.message}
            <br />
            The tested fast profile uses Qwen3.5-4B with a text snapshot. Image
            input is optional and slower. Downloaded models are kept locally;
            replay works with the assistant off.
          </p>
        </details>
      </div>
      {specs && (
        <section className="settings-section">
          <h3>Simulator assumptions</h3>
          <p>
            Can be changed only while the account is flat. Margin = entry
            notional / leverage. Swap is a simple daily charge at UTC midnight
            without triple rollover.
          </p>
          <div className="settings-grid">
            {Object.entries(specs).map(([key, v]) => (
              <Field key={key} label={key}>
                <input
                  type="number"
                  step="any"
                  value={v}
                  onChange={(e) =>
                    setSpecs({ ...specs, [key]: Number(e.target.value) })
                  }
                />
              </Field>
            ))}
          </div>
          <button
            className="secondary-button"
            onClick={() => void run({ type: "specs", value: specs })}
          >
            Save simulator profile
          </button>
        </section>
      )}
      <section className="settings-section">
        <h3>Diagnostics</h3>
        <div className="diagnostics">
          <span>Storage</span>
          <code>{state.diagnostics.storage}</code>
          <span>Node / Electron</span>
          <code>
            {state.diagnostics.versions.node} /{" "}
            {state.diagnostics.versions.electron ?? "—"}
          </code>
          <span>Recovery</span>
          <code>
            {state.recovered ? "Last committed autosave" : "Normal save"}
          </code>
          <span>Memory</span>
          <code>
            {state.ai.memory
              ? `${(state.ai.memory / 1073741824).toFixed(2)} GiB allocated`
              : "See measured runtime results in the validation notes"}
          </code>
        </div>
        {state.diagnostics.errors.map((e, i) => (
          <p key={i} className="inline-error">
            {e}
          </p>
        ))}
      </section>
      {issue && <p className="inline-error">{issue}</p>}
    </Modal>
  );
}
function Indicators({
  session: s,
  bars,
  act,
  close,
}: {
  session: Session;
  bars: import("./types").Bar[];
  act: (c: any) => void;
  close: () => void;
}) {
  const change = (id: string, value: Partial<Indicator>) =>
    act({
      type: "indicators",
      value: s.indicators.map((i) => (i.id === id ? { ...i, ...value } : i)),
    });
  return (
    <Modal title="Indicators and levels" onClose={close}>
      <p className="lead">
        Calculated from available bid candles. Missing warmup never produces
        invented values.
      </p>
      {s.indicators.map((i) => (
        <div className="indicator-row" key={i.id}>
          <input
            type="checkbox"
            checked={i.enabled}
            onChange={(e) => change(i.id, { enabled: e.target.checked })}
          />
          <b>{i.kind === "custom" ? i.name : i.kind}</b>
          {["SMA", "EMA", "RSI", "ATR"].includes(i.kind) && (
            <input
              aria-label={i.kind + " period"}
              type="number"
              min="2"
              max="500"
              value={i.period}
              onChange={(e) => change(i.id, { period: Number(e.target.value) })}
            />
          )}
          <input
            type="color"
            aria-label="Indicator color"
            value={i.color}
            onChange={(e) => change(i.id, { color: e.target.value })}
          />
          {i.kind === "asian" && (
            <>
              <input
                aria-label="Asia start hour"
                type="number"
                min="0"
                max="23"
                value={i.start ?? 0}
                onChange={(e) =>
                  change(i.id, { start: Number(e.target.value) })
                }
              />
              <input
                aria-label="Asia end hour"
                type="number"
                min="0"
                max="23"
                value={i.end ?? 6}
                onChange={(e) => change(i.id, { end: Number(e.target.value) })}
              />
            </>
          )}
          <IconButton
            title="Remove indicator"
            onClick={() =>
              act({
                type: "indicators",
                value: s.indicators.filter((a) => a.id !== i.id),
              })
            }
          >
            <Trash2 size={15} />
          </IconButton>
        </div>
      ))}
      <div className="indicator-add">
        {(
          ["SMA", "EMA", "RSI", "ATR", "sessions", "previous", "asian"] as const
        ).map((kind) => (
          <button
            className="secondary-button"
            key={kind}
            onClick={() =>
              act({
                type: "indicators",
                value: [
                  ...s.indicators,
                  {
                    id: crypto.randomUUID(),
                    kind,
                    period: kind === "SMA" || kind === "EMA" ? 20 : 14,
                    color: kind === "RSI" ? "#ad93ca" : "#c7a66c",
                    enabled: true,
                    start: 0,
                    end: 6,
                  },
                ],
              })
            }
          >
            + {kind}
          </button>
        ))}
      </div>
      <FormulaEditor indicators={s.indicators} bars={bars} />
      <div className="modal-actions">
        {[20, 50, 200].map((period) => (
          <button
            className="quiet"
            key={period}
            onClick={() =>
              act({
                type: "indicators",
                value: [
                  ...s.indicators,
                  {
                    id: crypto.randomUUID(),
                    kind: "EMA",
                    period,
                    color: "#999999",
                    enabled: true,
                  },
                ],
              })
            }
          >
            EMA {period}
          </button>
        ))}
      </div>
      <p className="micro">
        London 08–17 local time; New York 08–17 local time. Each timezone
        handles DST separately. Asia uses the display timezone. PDH/PDL use the
        previous available UTC trading day.
      </p>
    </Modal>
  );
}
function Notebook({
  session: s,
  call,
  close,
}: {
  session: Session | null;
  call: (c: any) => Promise<any>;
  close: () => void;
}) {
  const [value, setValue] = useState(s?.notebook),
    [ruleText, setRuleText] = useState(
      s?.notebook.rules.map((r) => r.text).join("\n") ?? "",
    ),
    [issue, setIssue] = useState("");
  return (
    <Modal title="Your strategy notebook" onClose={close} wide>
      {!value ? (
        <p>Create a session to save your rules and sources.</p>
      ) : (
        <>
          <div className="notebook-notice">
            No rules are attributed to Accurate RR without verified source
            material. This checklist is generic and editable.
          </div>
          <div className="field-row">
            <Field label="Strategy name">
              <input
                value={value.name}
                onChange={(e) => setValue({ ...value, name: e.target.value })}
              />
            </Field>
            <Field label="Version">
              <input
                value={value.version}
                onChange={(e) =>
                  setValue({ ...value, version: e.target.value })
                }
              />
            </Field>
          </div>
          <Field label="Source / link / transcript date">
            <input
              value={value.source}
              onChange={(e) => setValue({ ...value, source: e.target.value })}
            />
          </Field>
          <Field label="Your notes / pasted transcript">
            <textarea
              rows={9}
              value={value.text}
              onChange={(e) => setValue({ ...value, text: e.target.value })}
              placeholder="Paste material to study. It is saved as reference material, never as order instructions."
            />
          </Field>
          <Field label="Checklist · one rule per line">
            <textarea
              rows={5}
              value={ruleText}
              onChange={(e) => setRuleText(e.target.value)}
            />
          </Field>
          <label className="checklist-row">
            <input
              type="checkbox"
              checked={value.verified}
              onChange={(e) =>
                setValue({ ...value, verified: e.target.checked })
              }
            />
            I have checked these rules against the source above.
          </label>
          <button
            className="primary"
            onClick={() =>
              void call({
                type: "notebook",
                value: {
                  ...value,
                  rules: ruleText
                    .split("\n")
                    .filter(Boolean)
                    .map((text, i) => ({
                      id: `${value.version}:rule-${i + 1}`,
                      text,
                    })),
                },
              })
                .then(close)
                .catch((e) => setIssue(String(e)))
            }
          >
            Save strategy and checklist
          </button>
          {issue && <p className="inline-error">{issue}</p>}
        </>
      )}
    </Modal>
  );
}
function Fib({
  drawing,
  change,
  close,
}: {
  drawing: Drawing;
  change: (p: Partial<Drawing>) => void;
  close: () => void;
}) {
  return (
    <Modal title="Fibonacci levels" onClose={close}>
      <FibEditor drawing={drawing} change={change} />
      <div className="modal-actions">
        <button className="primary" onClick={close}>
          Done
        </button>
      </div>
    </Modal>
  );
}

function Bottom({
  tab,
  session: s,
  act,
  call,
  note,
  setNote,
  setModal,
  reviewTrade,
  locateTrade,
}: {
  tab: string;
  session: Session;
  act: (c: any) => void;
  call: (c: any) => Promise<any>;
  note: string;
  setNote: (v: string) => void;
  setModal: (v: string) => void;
  reviewTrade: (id: string) => void;
  locateTrade: (id: string) => void;
}) {
  const money = (n: number) => formatMoney(n, s.broker.specs.currency ?? "USD");
  const [editing, setEditing] = useState<any>(null),
    [image, setImage] = useState<string | null>(null),
    [overall, setOverall] = useState<any[]>([]),
    [tag, setTag] = useState(""),
    [strategy, setStrategy] = useState(""),
    [mode, setMode] = useState("training");
  const stats = tradeStatistics(
    s.broker.fills.filter(
      (f) =>
        (!tag || f.tags.includes(tag)) &&
        (!strategy || f.strategy === strategy) &&
        (!mode || s.mode === mode),
    ),
    s.broker.positions.map((p) => p.id),
  );
  useEffect(() => {
    if (tab === "stats")
      void call({ type: "stats", tag, strategy, mode })
        .then(setOverall)
        .catch(() => {});
  }, [tab, tag, strategy, mode, s.broker.fills.length]);
  return (
    <div className="bottom-content">
      {tab === "account" && (
        <div className="account-overview">
          {[
            ["Balance", money(s.broker.balance)],
            ["Equity", money(account(s.broker, s.tick).equity)],
            [
              "Realized P/L",
              money(s.broker.balance - (s.broker.initialBalance ?? 500)),
            ],
            ["Floating P/L", money(account(s.broker, s.tick).floating)],
            ["Used margin", money(account(s.broker, s.tick).usedMargin)],
            ["Free margin", money(account(s.broker, s.tick).freeMargin)],
            ["Simulated leverage", `1:${s.broker.specs.leverage}`],
            ["Account type", "USD · hedging · paper"],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      )}
      {tab === "positions" &&
        (s.broker.positions.length ? (
          <table>
            <thead>
              <tr>
                <th>Direction / size</th>
                <th>Entry</th>
                <th>Stop loss</th>
                <th>Take profit</th>
                <th>Initial risk</th>
                <th>Floating P/L</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {s.broker.positions.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b className={p.side === "buy" ? "green" : "red"}>
                      {p.side === "buy" ? "BUY" : "SELL"}
                    </b>{" "}
                    <span>{p.lots.toFixed(2)} lot</span>
                  </td>
                  <td>{num(p.entry)}</td>
                  <td>{p.sl ? num(p.sl) : "—"}</td>
                  <td>{p.tp ? num(p.tp) : "—"}</td>
                  <td>
                    {p.initialRisk === null ? "No R" : money(p.initialRisk)}
                  </td>
                  <td
                    className={
                      pnl(
                        p.side,
                        p.entry,
                        p.side === "buy" ? s.tick.bid : s.tick.ask,
                        p.lots,
                        s.broker.specs.contract,
                      ) >= 0
                        ? "green"
                        : "red"
                    }
                  >
                    {money(
                      pnl(
                        p.side,
                        p.entry,
                        p.side === "buy" ? s.tick.bid : s.tick.ask,
                        p.lots,
                        s.broker.specs.contract,
                      ) - p.swap,
                    )}
                  </td>
                  <td>
                    <button
                      className="table-action"
                      onClick={() =>
                        setEditing({
                          type: "position",
                          ...p,
                          sl: p.sl ?? "",
                          tp: p.tp ?? "",
                          closeLots: p.lots,
                        })
                      }
                    >
                      Edit / close
                    </button>
                    <button
                      className="table-action"
                      onClick={() =>
                        act({
                          type: "position.edit",
                          id: p.id,
                          sl: p.entry,
                          tp: p.tp,
                        })
                      }
                    >
                      BE
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-small">
            <Activity size={22} strokeWidth={1} />
            <b>No open positions</b>
            <span>Waiting is a valid decision.</span>
          </div>
        ))}
      {tab === "pending" &&
        (s.broker.pending.length ? (
          <table>
            <thead>
              <tr>
                <th>Orders</th>
                <th>Volume</th>
                <th>Price</th>
                <th>SL / TP</th>
                <th>Placed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {s.broker.pending.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.side.toUpperCase()} {p.kind}
                  </td>
                  <td>{p.lots}</td>
                  <td>{num(p.price!)}</td>
                  <td>
                    {p.sl ?? "—"} / {p.tp ?? "—"}
                  </td>
                  <td>{stamp(p.at, true, s.layout.timezone)}</td>
                  <td>
                    <button
                      className="table-action"
                      onClick={() =>
                        setEditing({
                          type: "pending",
                          ...p,
                          sl: p.sl ?? "",
                          tp: p.tp ?? "",
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      className="table-action"
                      onClick={() => act({ type: "pending.cancel", id: p.id })}
                    >
                      Cancel order
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-small">
            No pending orders. Orders trigger on the first eligible subsequent
            tick.
          </div>
        ))}
      {tab === "history" &&
        (s.broker.fills.length ? (
          <table>
            <thead>
              <tr>
                <th>Direction</th>
                <th>Lot</th>
                <th>Entry → exit</th>
                <th>Gross / costs</th>
                <th>Net</th>
                <th>R</th>
                <th>Reason</th>
                <th>Chart</th>
              </tr>
            </thead>
            <tbody>
              {[...s.broker.fills].reverse().map((f) => (
                <tr key={f.id}>
                  <td>{f.side.toUpperCase()}</td>
                  <td>{f.lots}</td>
                  <td>
                    {num(f.entry)} → {num(f.exit)}
                  </td>
                  <td>
                    {money(f.gross)} / {money(f.fees + f.swap)}
                  </td>
                  <td className={f.net >= 0 ? "green" : "red"}>
                    {money(f.net)}
                  </td>
                  <td>{f.r === null ? "—" : f.r.toFixed(2) + "R"}</td>
                  <td>{f.reason}</td>
                  <td>
                    {f.screenshot && (
                      <button
                        className="table-action"
                        onClick={() =>
                          void call({ type: "image", id: f.screenshot }).then(
                            setImage,
                          )
                        }
                      >
                        Decision chart
                      </button>
                    )}
                    <button
                      className="table-action"
                      onClick={() => locateTrade(f.positionId)}
                    >
                      Show on chart
                    </button>
                    <button
                      className="table-action"
                      onClick={() => reviewTrade(f.positionId)}
                    >
                      Review with AI
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-small">
            Closed trades include gross P/L, costs, net P/L and initial R.
          </div>
        ))}
      {tab === "journal" && (
        <div className="journal">
          <div>
            <textarea
              placeholder="Emotion, discipline and what followed the plan — independently of the outcome …"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
            <button
              className="secondary-button"
              disabled={!note.trim()}
              onClick={() => {
                void call({ type: "note", text: note })
                  .then(() => setNote(""))
                  .catch(() => {});
              }}
            >
              <Save size={13} />
              Save reflection
            </button>
            <button className="quiet" onClick={() => setModal("notebook")}>
              Open strategy
            </button>
          </div>
          <div>
            {[...s.notes].reverse().map((n) => (
              <article key={n.id}>
                <small>
                  {stamp(n.cutoff, s.layout.blind, s.layout.timezone)}
                </small>
                <p>{n.text}</p>
              </article>
            ))}
          </div>
        </div>
      )}
      {tab === "stats" && (
        <div className="statistics">
          <div className="stat-filters">
            <input
              placeholder="Filter tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            />
            <input
              placeholder="Strategy version"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
            />
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="training">Practice</option>
              <option value="review">Review</option>
              <option value="">Both modes</option>
            </select>
          </div>
          <div className="stat-cards">
            {[
              ["Net", money(stats.net)],
              ["Closed trades", stats.tradeCount],
              ["Partial exits", stats.count],
              [
                "Win rate",
                stats.winRate === null
                  ? "—"
                  : (stats.winRate * 100).toFixed(1) + " %",
              ],
              [
                "Average R",
                stats.meanR === null ? "—" : stats.meanR.toFixed(2),
              ],
              [
                "Expectancy",
                stats.expectancy === null ? "—" : money(stats.expectancy),
              ],
              [
                "Profit factor",
                stats.profitFactor === null
                  ? "Not defined"
                  : stats.profitFactor.toFixed(2),
              ],
              ["Max. equity drawdown", money(s.broker.maxDrawdown)],
            ].map(([label, value]) => (
              <div key={label}>
                <small>{label}</small>
                <b>{value}</b>
              </div>
            ))}
          </div>
          <div className="overall">
            {overall.map((o) => (
              <span key={o.id}>
                {o.name} · {o.count} closed · {money(o.net)} · {o.strategy}
              </span>
            ))}
          </div>
          <small className="muted">
            Win rate, expectancy and R use fully closed positions; partial exits
            are grouped. R requires an initial SL. Assess rule adherence
            separately from profit.
          </small>
        </div>
      )}
      {editing && (
        <Modal
          title={
            editing.type === "pending"
              ? "Edit pending order"
              : "Manage position"
          }
          onClose={() => setEditing(null)}
        >
          <div className="settings-grid">
            {(editing.type === "pending"
              ? ["price", "lots", "sl", "tp"]
              : ["sl", "tp"]
            ).map((key) => (
              <Field key={key} label={key.toUpperCase()}>
                <input
                  type="number"
                  step=".001"
                  value={editing[key]}
                  onChange={(e) =>
                    setEditing({ ...editing, [key]: e.target.value })
                  }
                />
              </Field>
            ))}
          </div>
          <p className="micro">
            Changing SL never overwrites initial risk in R statistics.
          </p>
          <button
            className="primary"
            onClick={() => {
              const sl = editing.sl === "" ? undefined : Number(editing.sl),
                tp = editing.tp === "" ? undefined : Number(editing.tp);
              void call(
                editing.type === "pending"
                  ? {
                      type: "pending.edit",
                      id: editing.id,
                      changes: {
                        price: Number(editing.price),
                        lots: Number(editing.lots),
                        sl,
                        tp,
                      },
                    }
                  : { type: "position.edit", id: editing.id, sl, tp },
              )
                .then(() => setEditing(null))
                .catch(() => {});
            }}
          >
            Save changes
          </button>
          {editing.type === "position" && (
            <section className="settings-section">
              <h3>Partial or full close</h3>
              <Field label="Size to close">
                <input
                  type="number"
                  min=".01"
                  max={editing.lots}
                  step=".01"
                  value={editing.closeLots}
                  onChange={(e) =>
                    setEditing({ ...editing, closeLots: e.target.value })
                  }
                />
              </Field>
              <button
                className="danger-button"
                onClick={() =>
                  void call({
                    type: "position.close",
                    id: editing.id,
                    lots: Number(editing.closeLots),
                  })
                    .then(() => setEditing(null))
                    .catch(() => {})
                }
              >
                Close selected size at current bid/ask
              </button>
            </section>
          )}
        </Modal>
      )}
      {image && (
        <Modal title="Chart at decision" onClose={() => setImage(null)} wide>
          <img
            className="decision-image"
            src={image}
            alt="Saved chart when the original order decision was made"
          />
        </Modal>
      )}
    </div>
  );
}
