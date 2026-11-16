export type TF = "1m" | "5m" | "15m" | "30m" | "1H" | "4H" | "1D";
export const FRAMES: Record<TF, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1H": 3600,
  "4H": 14400,
  "1D": 86400,
};
export type Tick = {
  t: number;
  bid: number;
  ask: number;
  bv?: number;
  av?: number;
};
export type ChartRange = {
  from: number;
  to: number;
  version?: 2 | 3;
  anchor?: number;
  fromTime?: number;
  toTime?: number;
};
export type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  count: number;
  gapBefore?: { from: number; to: number };
};
export type Side = "buy" | "sell";
export type OrderKind = "market" | "limit" | "stop";
export type Specs = {
  currency?: string;
  unit?: string;
  tickSize?: number;
  contract: number;
  minLot: number;
  lotStep: number;
  leverage: number;
  commission: number;
  slippage: number;
  swapLong: number;
  swapShort: number;
  stopOut: number;
  precision: number;
};
export const DEFAULT_SPECS: Specs = {
  contract: 100,
  minLot: 0.01,
  lotStep: 0.01,
  leverage: 500,
  commission: 0,
  slippage: 0,
  swapLong: 0,
  swapShort: 0,
  stopOut: 50,
  precision: 3,
};
export type Order = {
  revisions?: {
    at: number;
    seq: number;
    price?: number;
    side: Side;
    sl?: number;
    tp?: number;
    lots: number;
  }[];
  setupId?: string;
  planId?: string;
  id: string;
  side: Side;
  kind: OrderKind;
  automaticLevel?: boolean;
  lots: number;
  price?: number;
  sl?: number;
  tp?: number;
  at: number;
  seq: number;
  thesis: string;
  tags: string[];
  strategy: string;
  screenshot?: string;
};
export type Position = Order & {
  changes?: { t: number; sl?: number; tp?: number }[];
  entry: number;
  opened: number;
  initialLots: number;
  initialRisk: number | null;
  entryFee: number;
  swap: number;
  initialSl?: number;
  initialTp?: number;
};
export type Fill = {
  setupId?: string;
  planId?: string;
  changes?: { t: number; sl?: number; tp?: number }[];
  id: string;
  positionId: string;
  side: Side;
  entry: number;
  exit: number;
  lots: number;
  opened: number;
  closed: number;
  gross: number;
  fees: number;
  swap: number;
  net: number;
  r: number | null;
  initialRisk: number | null;
  reason: string;
  thesis: string;
  tags: string[];
  strategy: string;
  screenshot?: string;
  initialSl?: number;
  initialTp?: number;
};
export type BrokerState = {
  initialBalance?: number;
  balance: number;
  positions: Position[];
  pending: Order[];
  fills: Fill[];
  events: { t: number; message: string }[];
  seq: number;
  peak: number;
  maxDrawdown: number;
  lastSwapDay: string;
  specs: Specs;
};
export type Drawing = {
  id: string;
  kind: "horizontal" | "ray" | "trend" | "zone" | "fib" | "long" | "short";
  a: { time: number; price: number };
  b: { time: number; price: number };
  color: string;
  locked: boolean;
  hidden?: boolean;
  fibFill?: boolean;
  fibStyles?: Record<
    string,
    {
      color: string;
      label: string;
      visible: boolean;
      style: "solid" | "dashed" | "dotted";
    }
  >;
  label: string;
  levels: number[];
  createdCursor: number;
  target?: number;
  lots?: number;
};
export type Indicator = {
  id: string;
  kind:
    | "SMA"
    | "EMA"
    | "RSI"
    | "ATR"
    | "sessions"
    | "previous"
    | "asian"
    | "custom";
  period: number;
  color: string;
  enabled: boolean;
  start?: number;
  end?: number;
  name?: string;
  script?: string;
  pane?: "price" | "separate";
};
export type Message = {
  savedFacts?: boolean;
  historyAnswer?: boolean;
  evidenceFallback?: boolean;
  evidence?: {
    tradeId?: string;
    label?: string;
    decisionCutoff?: number;
    decisionImage: boolean;
    currentImage: boolean;
    chartScan: boolean;
  };
  rawText?: string;
  groundingFiltered?: boolean;
  id: string;
  role: "user" | "assistant";
  text: string;
  at: number;
  cutoff: number;
  cursor: number;
  model: string;
  profile: string;
  strategy: string;
  snapshot?: string;
  status: "complete" | "interrupted" | "generating";
};
export type Note = {
  id: string;
  text: string;
  cutoff: number;
  cursor: number;
  tags: string[];
};
export type Notebook = {
  version: string;
  name: string;
  source: string;
  text: string;
  rules: { id: string; text: string }[];
  verified: boolean;
  cutoff: number;
};
export type Session = {
  learning?: import("./core/challenges").Learning;
  study?: import("./core/rr-study").RRStudy;
  journalDraft?: string;
  dataset: string;
  id: string;
  name: string;
  mode: "training" | "review";
  created: number;
  start: number;
  cursor: { hour: number; index: number };
  tick: Tick;
  broker: BrokerState;
  drawings: Drawing[];
  undo: Drawing[][];
  redo: Drawing[][];
  indicators: Indicator[];
  layout: {
    timeframe: TF;
    htf?: import("./core/htf").HTFSettings;
    second: TF;
    dual: boolean;
    ai: boolean;
    bottom: number;
    right: number;
    blind: boolean;
    timezone: string;
    range?: ChartRange;
    secondRange?: ChartRange;
  };
  chat: Message[];
  draft: string;
  notes: Note[];
  notebook: Notebook;
  thesis: string;
  tags: string;
  checklist: Record<string, boolean>;
  updated: number;
  status: string;
};
export type AISettings = {
  provider: "managed" | "lmstudio" | "ollama";
  url: string;
  model: string;
  enabled: boolean;
  profile: "normal" | "light" | "gaming";
  context: number;
  maxTokens: number;
  vision: boolean;
  structured: boolean;
  lazy: boolean;
  idleMinutes: number;
  runtime: string;
  gpu: string;
  previous?: Omit<AISettings, "previous">;
};
export type AIStatus = {
  state:
    | "off"
    | "starting"
    | "loading"
    | "ready"
    | "generating"
    | "unloading"
    | "error";
  message: string;
  models: { id: string; vision: boolean; loaded: boolean }[];
  owned: boolean;
  latency?: number;
  memory?: number;
};
export const DEFAULT_AI: AISettings = {
  provider: "managed",
  url: "http://127.0.0.1:12355",
  model: "qwen3.5-4b",
  enabled: true,
  profile: "normal",
  context: 8192,
  maxTokens: 640,
  vision: false,
  structured: false,
  lazy: false,
  idleMinutes: 20,
  runtime: "",
  gpu: "max",
};
export type Coverage = {
  hours: number;
  tickCount: number;
  bytes: number;
  first: number | null;
  last: number | null;
  gaps: number;
  intrahourGaps: number;
  expectedClosures: number;
  source: string;
  range?: {
    from: number;
    to: number;
    replayFrom?: number;
    replayTo?: number;
    warmupDays?: number;
  };
  marketDirectory?: string;
  importer: {
    kind?: "csv";
    count?: number;
    running: boolean;
    done: number;
    total: number;
    bytes: number;
    error: string;
    current: string;
    paused: boolean;
  };
};
export type AppState = {
  discord?: import("./core/discord-presence").DiscordSettings;
  discordStatus?: import("../electron/discord").PresenceState;
  rrProgress: import("./core/rr-lessons").RRProgress;
  rrView: import("./core/rr-study").RRStudyView;
  appearance: import("./core/appearance").Appearance;
  levels: import("./core/levels").Level[];
  session: Session | null;
  sessions: {
    id: string;
    name: string;
    updated: number;
    start: number;
    mode: string;
  }[];
  bars: Bar[];
  htfBars?: Bar[];
  secondBars: Bar[];
  quote: Tick | null;
  coverage: Coverage;
  ai: AIStatus;
  settings: AISettings;
  recovered: boolean;
  playing: boolean;
  speed: number;
  diagnostics: {
    storage: string;
    versions: Record<string, string>;
    errors: string[];
  };
};
export type Command = { type: string; [key: string]: unknown };
declare global {
  interface Window {
    replay: {
      onFeed: (fn: (value: any) => void) => () => void;
      call: (command: Command) => Promise<any>;
      subscribe: (fn: (state: AppState) => void) => () => void;
      onAI: (fn: (value: any) => void) => () => void;
      flush: (fn: () => Promise<void>) => void;
    };
  }
}
