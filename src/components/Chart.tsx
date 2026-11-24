import { HTFCandles } from "./HTFCandles";
import { htfCandles, DEFAULT_HTF, type HTFSettings } from "../core/htf";
import { INSTRUMENTS, instrumentForDataset } from "../core/instruments";
import {
  useEffect,
  useRef,
  useState,
  useMemo,
  useImperativeHandle,
  forwardRef,
} from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { sma, ema, rsi, atr, sessionFlags, zonedParts } from "../core/bars";
import {
  FRAMES,
  type Bar,
  type Session,
  type Drawing,
  type Tick,
  type TF,
  type ChartRange,
} from "../types";
import { pnl } from "../core/broker";
import { flushSync } from "react-dom";
import {
  moveDraftEntry,
  resolveLevelDraft,
  levelLabel,
} from "../core/order-draft";
import { snapDrawingPoint } from "../core/magnet";
import { RRRangeOverlay } from "./RRRangeOverlay";
import { TradeMarkers } from "./TradeMarkers";
import { tradeMarkers } from "../core/trade-markers";
import {
  DEFAULT_APPEARANCE,
  PALETTES,
  alpha,
  type Appearance,
  orderColors,
} from "../core/appearance";
import { calculateFormula } from "../core/formulas";
import {
  moveDrawing,
  constrainLinePoint,
  finishDrawing,
  drawingScreenHandles,
  planLevels,
  clipRay,
} from "../core/drawings";
export type OrderLevel = "entry" | "sl" | "tp";
export type DraftOrder = {
  side: "buy" | "sell";
  kind: "market" | "limit" | "stop";
  entry: number;
  sl?: number;
  tp?: number;
  lots: number;
  autoSide?: boolean;
};
import {
  chartTimeline,
  chartBreaks,
  initialChartRange,
  captureChartRange,
  logicalAtTime,
  timeAtLogical,
  axisLabel,
  candleLabel,
} from "../core/chart-view";
export type Tool = "select" | Drawing["kind"];
export type ChartHandle = {
  focusTrade: (id: string) => boolean;
  focusStudy: () => void;
  capture: () => Promise<string>;
  viewport: () => ChartRange | undefined;
  visibleWindow: () => { from: number; to: number } | undefined;
  cursor: () => number;
  current: () => void;
  fit: () => void;
  overview: () => void;
  proposedLevel: (
    entry: number,
    side: "buy" | "sell",
    role: "sl" | "tp",
  ) => number;
};
export const Chart = forwardRef<
  ChartHandle,
  {
    bars: Bar[];
    htfBars?: Bar[];
    onHTFChange?: (value: HTFSettings) => void;
    onLearnHTF?: () => void;
    levels: import("../core/levels").Level[];
    session: Session;
    timeframe: TF;
    tool: Tool;
    selected: string | null;
    onSelect: (id: string | null) => void;
    onDraw: (drawings: Drawing[]) => void;
    onProtect: (
      id: string,
      sl: number | undefined,
      tp: number | undefined,
    ) => void;
    onRange: (range: ChartRange) => void;
    secondary?: boolean;
    studyPicking?: boolean;
    onStudyPick?: (time: number) => void;
    appearance?: Appearance;
    orderDraft?: DraftOrder;
    picker?: OrderLevel | null;
    onOrderLevel?: (role: OrderLevel, price: number) => void;
    planLots?: number;
    onPendingEdit?: (
      id: string,
      changes: { price?: number; sl?: number; tp?: number; lots?: number },
    ) => void;
    onContext?: (value: {
      x: number;
      y: number;
      price: number;
      time: number;
    }) => void;
    onDraftLots?: (lots: number) => void;
    onCancelDraft?: () => void;
    onCancelPending?: (id: string) => void;
  }
>(function Chart(
  {
    bars,
    htfBars = [],
    onHTFChange,
    onLearnHTF,
    levels: appLevels,
    session: s,
    timeframe,
    tool,
    selected,
    onSelect,
    onDraw,
    onProtect,
    onRange,
    secondary,
    studyPicking = false,
    onStudyPick,
    appearance = DEFAULT_APPEARANCE,
    orderDraft,
    picker,
    onOrderLevel,
    planLots = 0.01,
    onPendingEdit,
    onCancelDraft,
    onCancelPending,
    onContext,
    onDraftLots,
  },
  ref,
) {
  const sideConfig = { ...DEFAULT_HTF, ...s.layout.htf };
  const sideSpace =
    !secondary && sideConfig.enabled
      ? Math.max(
          178,
          (sideConfig.width + sideConfig.gap) * sideConfig.count + 100,
        ) + 24
      : 0;
  function reserveSideSpace(pixels = sideSpace) {
    const target = chart.current;
    // Lightweight Charts applies a new logical range on its next render frame.
    // Reserve space only after that range settles, not against the previous view.
    requestAnimationFrame(() => {
      const c = chart.current,
        range = c?.timeScale().getVisibleLogicalRange();
      if (!c || c !== target || !range || !pixels) return;
      const last = timesRef.current.length - 1,
        spacing =
          c.timeScale().width() / (Number(range.to) - Number(range.from));
      const missing = pixels - (Number(range.to) - last) * spacing;
      if (missing > 1)
        c.timeScale().setVisibleLogicalRange({
          from: Number(range.from) + missing / spacing,
          to: Number(range.to) + missing / spacing,
        });
    });
  }
  const rangeCallback = useRef(onRange);
  rangeCallback.current = onRange;
  const host = useRef<HTMLDivElement>(null),
    chart = useRef<IChartApi | null>(null),
    series = useRef<ISeriesApi<"Candlestick"> | null>(null),
    indicatorSeries = useRef<ISeriesApi<"Line">[]>([]),
    barsRef = useRef(bars);
  const quoteLine = useRef<ReturnType<
    ISeriesApi<"Candlestick">["createPriceLine"]
  > | null>(null);
  barsRef.current = bars;
  const timeline = useMemo(
    () => chartTimeline(bars, timeframe),
    [bars, timeframe],
  );
  const times = useMemo(() => timeline.map((p) => p.time), [timeline]);
  const timesRef = useRef(times);
  timesRef.current = times;
  const [, repaint] = useState(0);
  const [draft, setDraft] = useState<Drawing | null>(null),
    [changed, setChanged] = useState<Drawing[] | null>(null),
    [protect, setProtect] = useState<{
      id: string;
      kind: "sl" | "tp";
      price: number;
    } | null>(null);
  const drag = useRef<any>(null),
    [dims, setDims] = useState({ w: 800, h: 500 });
  const linePlacement = useRef<Drawing | null>(null);
  const lastLinePoint = useRef<Drawing["a"] | null>(null);
  const lineKeyHandler = useRef<(event: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    const handle = (event: KeyboardEvent) => lineKeyHandler.current(event);
    window.addEventListener("keydown", handle);
    window.addEventListener("keyup", handle);
    return () => {
      window.removeEventListener("keydown", handle);
      window.removeEventListener("keyup", handle);
    };
  }, []);
  const [hover, setHover] = useState<Bar | null>(null);
  const [snapPoint, setSnapPoint] = useState<{
    time: number;
    price: number;
  } | null>(null);
  const [orderPreview, setOrderPreview] = useState<{
    role: OrderLevel;
    price: number;
  } | null>(null);
  const palette = PALETTES[appearance.preset];
  const tradeColors = {
    ...orderColors(appearance.preset === "lavender"),
    ...appearance.orderColors,
  };
  useEffect(() => {
    if (
      (tool !== "ray" && tool !== "trend") ||
      (linePlacement.current && linePlacement.current.kind !== tool)
    ) {
      linePlacement.current = null;
      if (!drag.current) setDraft(null);
    }
  }, [tool]);
  useEffect(() => {
    quoteLine.current?.applyOptions({
      price: s.tick.bid,
      color: palette.muted,
      axisLabelColor: palette.panel,
      axisLabelTextColor: palette.text,
    });
  }, [s.tick.bid, appearance]);
  useEffect(() => {
    chart.current?.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: palette.bg },
        textColor: palette.muted,
        panes: {
          separatorColor: palette.line,
          separatorHoverColor: palette.accent,
        },
      },
      grid: {
        vertLines: { color: alpha(palette.line, appearance.gridOpacity) },
        horzLines: { color: alpha(palette.line, appearance.gridOpacity) },
      },
      rightPriceScale: { borderColor: palette.line },
      timeScale: { borderColor: palette.line },
      crosshair: {
        vertLine: { color: palette.muted, labelBackgroundColor: palette.panel },
        horzLine: { color: palette.muted, labelBackgroundColor: palette.panel },
      },
    });
    series.current?.applyOptions({
      upColor: palette.up,
      downColor: palette.down,
      borderUpColor: palette.borderUp,
      borderDownColor: palette.borderDown,
      wickUpColor: palette.wickUp,
      wickDownColor: palette.wickDown,
      lastValueVisible: false,
      priceLineVisible: false,
    });
  }, [appearance]);
  useEffect(() => {
    const node = host.current!;
    const c = createChart(node, {
      width: node.clientWidth,
      height: node.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: palette.bg },
        textColor: palette.muted,
        fontFamily: "Segoe UI, sans-serif",
        fontSize: 11,
        attributionLogo: true,
        panes: {
          separatorColor: palette.line,
          separatorHoverColor: palette.accent,
          enableResize: true,
        },
      },
      grid: {
        vertLines: { color: alpha(palette.line, appearance.gridOpacity) },
        horzLines: { color: alpha(palette.line, appearance.gridOpacity) },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: palette.muted, labelBackgroundColor: palette.panel },
        horzLine: { color: palette.muted, labelBackgroundColor: palette.panel },
      },
      rightPriceScale: {
        borderColor: palette.line,
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: {
        borderColor: palette.line,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 7,
      },
      localization: {
        locale: "en-GB",
        timeFormatter: (time: any) =>
          candleLabel(
            Number(time),
            timeframe,
            s.layout.timezone,
            s.layout.blind,
          ),
      },
    });
    chart.current = c;
    const cs = c.addSeries(CandlestickSeries, {
      upColor: palette.up,
      downColor: palette.down,
      borderUpColor: palette.borderUp,
      borderDownColor: palette.borderDown,
      wickUpColor: palette.wickUp,
      wickDownColor: palette.wickDown,
      priceFormat: {
        type: "price",
        precision: s.broker.specs.precision,
        minMove: 10 ** -s.broker.specs.precision,
      },
    });
    series.current = cs;
    // The reference is the executable replay bid, including when the last
    // visible candle is an older one after zooming or panning.
    cs.applyOptions({ lastValueVisible: false, priceLineVisible: false });
    quoteLine.current = cs.createPriceLine({
      price: s.tick.bid,
      color: palette.muted,
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      axisLabelColor: palette.panel,
      axisLabelTextColor: palette.text,
      title: "",
    });
    const update = () => repaint((x) => x + 1);
    c.timeScale().subscribeVisibleLogicalRangeChange(update);
    c.subscribeCrosshairMove((p) => {
      const b = p.seriesData.get(cs) as any;
      setHover(b?.open !== undefined ? b : null);
    });
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        const timeRange = c.timeScale().getVisibleLogicalRange();
        const priceRange = c.priceScale("right").getVisibleRange();
        c.resize(width, height);
        if (timeRange) c.timeScale().setVisibleLogicalRange(timeRange);
        if (priceRange) c.priceScale("right").setVisibleRange(priceRange);
        setDims({ w: width, h: height });
        update();
      }
    });
    ro.observe(node);
    // Canvas and SVG use one animation-frame viewport, including price-axis
    // gestures which do not emit a logical time-range change.
    let animation = 0,
      signature = "";
    const syncOverlay = () => {
      const range = c.timeScale().getVisibleLogicalRange();
      const sample = barsRef.current.at(-1)?.close ?? 1;
      const next = [
        range?.from,
        range?.to,
        cs.priceToCoordinate(sample),
        cs.priceToCoordinate(sample + 1),
        node.clientWidth,
        node.clientHeight,
      ].join(":");
      if (next !== signature) {
        signature = next;
        flushSync(() => repaint((value) => value + 1));
      }
      animation = requestAnimationFrame(syncOverlay);
    };
    animation = requestAnimationFrame(syncOverlay);
    return () => {
      cancelAnimationFrame(animation);
      ro.disconnect();
      c.remove();
      chart.current = null;
      series.current = null;
      quoteLine.current = null;
      indicatorSeries.current = [];
    };
  }, [secondary]);
  const previousData = useRef<{
    session: string;
    tf: TF;
    cutoff: number;
    times: number[];
  } | null>(null);
  useEffect(() => {
    if (!series.current || !chart.current) return;
    const previous = previousData.current,
      c = chart.current;
    const preserve = previous?.session === s.id && previous.tf === timeframe;
    const range = preserve ? c.timeScale().getVisibleLogicalRange() : null;
    const view =
      range && previous
        ? {
            from: timeAtLogical(
              previous.times,
              Number(range.from),
              FRAMES[timeframe],
            ),
            to: timeAtLogical(
              previous.times,
              Number(range.to),
              FRAMES[timeframe],
            ),
          }
        : null;
    const followReplay = !!(
      range &&
      previous &&
      previous.cutoff !== s.tick.t &&
      Number(range.from) <= previous.times.length - 1 &&
      Number(range.to) >= previous.times.length - 1
    );
    const priceRange =
      preserve && previous?.cutoff === s.tick.t
        ? c.priceScale("right").getVisibleRange()
        : null;
    series.current.applyOptions({
      priceFormat: {
        type: "price",
        precision: s.broker.specs.precision,
        minMove: s.broker.specs.tickSize ?? 10 ** -s.broker.specs.precision,
      },
    });
    series.current.setData(
      timeline.map((b) => ({ ...b, time: b.time as UTCTimestamp })),
    );
    if (followReplay && range && previous) {
      const right =
        times.length - 1 + (Number(range.to) - (previous.times.length - 1));
      c.timeScale().setVisibleLogicalRange({
        from: right - (Number(range.to) - Number(range.from)),
        to: right,
      });
    } else if (view)
      c.timeScale().setVisibleLogicalRange({
        from: logicalAtTime(times, view.from, FRAMES[timeframe]),
        to: logicalAtTime(times, view.to, FRAMES[timeframe]),
      });
    if (priceRange) c.priceScale("right").setVisibleRange(priceRange);
    previousData.current = {
      session: s.id,
      tf: timeframe,
      cutoff: s.tick.t,
      times,
    };
    repaint((x) => x + 1);
  }, [timeline]);
  useEffect(() => {
    if (!chart.current) return;
    chart.current.applyOptions({
      localization: {
        timeFormatter: (time: any) =>
          candleLabel(
            Number(time),
            timeframe,
            s.layout.timezone,
            s.layout.blind,
          ),
      },
      timeScale: {
        timeVisible: timeframe !== "1D",
        tickMarkFormatter: (time: any, kind: number) =>
          axisLabel(
            Number(time),
            timeframe,
            s.layout.timezone,
            s.layout.blind,
            kind,
          ),
      },
    });
  }, [s.layout.blind, s.layout.timezone, timeframe]);
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    for (const line of indicatorSeries.current) c.removeSeries(line);
    indicatorSeries.current = [];
    for (const i of s.indicators.filter((i) => i.enabled)) {
      if (i.kind === "custom") {
        try {
          for (const plot of calculateFormula(i.script ?? "", bars)) {
            const pane = i.pane === "separate" ? 1 : 0;
            const line = c.addSeries(
              LineSeries,
              {
                color: plot.color,
                lineWidth: 1,
                title: plot.title,
                priceLineVisible: false,
                lastValueVisible: pane === 1,
                ...(pane === 0 ? { autoscaleInfoProvider: () => null } : {}),
              },
              pane,
            );
            const values = new Map(plot.values.map((v) => [v.time, v.value]));
            line.setData(
              timeline.map((p) =>
                values.has(p.time)
                  ? { time: p.time as UTCTimestamp, value: values.get(p.time)! }
                  : { time: p.time as UTCTimestamp },
              ),
            );
            indicatorSeries.current.push(line);
          }
        } catch {}
        continue;
      }
      const calc =
        i.kind === "SMA"
          ? sma
          : i.kind === "EMA"
            ? ema
            : i.kind === "RSI"
              ? rsi
              : i.kind === "ATR"
                ? atr
                : null;
      if (!calc) continue;
      const pane = i.kind === "RSI" || i.kind === "ATR" ? 1 : 0;
      const line = c.addSeries(
        LineSeries,
        {
          color: i.color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: pane === 1,
          title: `${i.kind} ${i.period}`,
          crosshairMarkerVisible: false,
          ...(pane === 0 ? { autoscaleInfoProvider: () => null } : {}),
        },
        pane,
      );
      const values = new Map(
        calc(bars, i.period).map((v) => [v.time, v.value]),
      );
      line.setData(
        timeline.map((p) =>
          values.has(p.time)
            ? { time: p.time as UTCTimestamp, value: values.get(p.time)! }
            : { time: p.time as UTCTimestamp },
        ),
      );
      indicatorSeries.current.push(line);
    }
    if (c.panes().length > 1) {
      c.panes()[0].setStretchFactor(4);
      c.panes()[1].setStretchFactor(1);
    }
  }, [s.indicators, bars, timeline]);
  useEffect(() => {
    chart.current?.applyOptions({
      handleScroll:
        tool === "select" && !picker && !drag.current && !studyPicking,
      handleScale:
        tool === "select" && !picker && !drag.current && !studyPicking,
    });
  }, [tool, draft, changed, protect, picker, studyPicking]);
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const saved = secondary ? s.layout.secondRange : s.layout.range;
    c.priceScale("right").applyOptions({ autoScale: true });
    c.timeScale().setVisibleLogicalRange(
      initialChartRange(
        timesRef.current,
        FRAMES[timeframe],
        saved,
        timeframe,
      ) as any,
    );
    if (!saved) reserveSideSpace();
    let timer: ReturnType<typeof setTimeout>;
    const changed = (range: any) => {
      if (!range) return;
      clearTimeout(timer);
      const snapshot = captureChartRange(
        timesRef.current,
        FRAMES[timeframe],
        timeframe,
        { from: Number(range.from), to: Number(range.to) },
      );
      timer = setTimeout(() => rangeCallback.current(snapshot), 250);
    };
    c.timeScale().subscribeVisibleLogicalRangeChange(changed);
    changed(c.timeScale().getVisibleLogicalRange());
    return () => {
      clearTimeout(timer);
      c.timeScale().unsubscribeVisibleLogicalRangeChange(changed);
    };
  }, [timeframe, s.id]);
  const previousSideSpace = useRef(sideSpace);
  useEffect(() => {
    if (sideSpace > previousSideSpace.current) reserveSideSpace();
    previousSideSpace.current = sideSpace;
  }, [sideSpace]);
  useImperativeHandle(ref, () => ({
    viewport: () => {
      const range = chart.current?.timeScale().getVisibleLogicalRange();
      return range
        ? captureChartRange(timesRef.current, FRAMES[timeframe], timeframe, {
            from: Number(range.from),
            to: Number(range.to),
          })
        : undefined;
    },
    focusTrade: (id) => {
      const events = tradeMarkers(s).arrows.filter((m) => m.tradeId === id);
      if (!events.length || !chart.current || !times.length) return false;
      const first = Math.min(...events.map((e) => e.time));
      const last = Math.max(...events.map((e) => e.time));
      if (first < times[0] || last >= times.at(-1)! + FRAMES[timeframe])
        return false;
      const from = logicalAtTime(times, first, FRAMES[timeframe]);
      const to = logicalAtTime(times, last, FRAMES[timeframe]);
      chart.current.priceScale("right").applyOptions({ autoScale: true });
      chart.current.timeScale().setVisibleLogicalRange({
        from: from - 18,
        to: Math.max(to + 18, from + 48),
      } as any);
      return true;
    },
    focusStudy: () => {
      const range = s.study?.range;
      if (!range || !chart.current) return;
      const from = logicalAtTime(
        timesRef.current,
        range.c1.time,
        FRAMES[timeframe],
      );
      const to = logicalAtTime(
        timesRef.current,
        range.c2.time + 2 * FRAMES[range.timeframe],
        FRAMES[timeframe],
      );
      chart.current.priceScale("right").applyOptions({ autoScale: true });
      chart.current.timeScale().setVisibleLogicalRange({
        from: from - 10,
        to: Math.max(to + 8, from + 35),
      } as any);
    },
    visibleWindow: () => {
      const range = chart.current?.timeScale().getVisibleLogicalRange();
      if (!range) return undefined;
      return {
        from: timeAtLogical(times, Number(range.from), FRAMES[timeframe]),
        to: timeAtLogical(times, Number(range.to), FRAMES[timeframe]),
      };
    },
    capture: async () => {
      if (!chart.current) return "";
      const canvas = chart.current.takeScreenshot();
      const svg = host.current?.parentElement?.querySelector(".drawing-layer");
      if (svg) {
        const bytes = new TextEncoder().encode(
          new XMLSerializer().serializeToString(svg),
        );
        let encoded = "";
        for (const b of bytes) encoded += String.fromCharCode(b);
        const img = new Image();
        img.src = "data:image/svg+xml;base64," + btoa(encoded);
        await img.decode();
        canvas
          .getContext("2d")!
          .drawImage(img, 0, 0, canvas.width, canvas.height);
      }
      return canvas.toDataURL("image/png");
    },
    cursor: () => s.broker.seq,
    current: () => {
      chart.current?.priceScale("right").applyOptions({ autoScale: true });
      chart.current?.timeScale().scrollToRealTime();
      reserveSideSpace();
    },
    fit: () => {
      chart.current?.priceScale("right").applyOptions({ autoScale: true });
      chart.current
        ?.timeScale()
        .setVisibleLogicalRange(
          initialChartRange(timesRef.current, FRAMES[timeframe]) as any,
        );
      reserveSideSpace();
    },
    overview: () => {
      chart.current?.priceScale("right").applyOptions({ autoScale: true });
      chart.current?.timeScale().fitContent();
    },
    proposedLevel: (entry, side, role) => {
      const scale = series.current;
      if (!scale) return entry;
      const current = scale.priceToCoordinate(entry);
      if (current === null) return entry;
      const direction = (side === "buy" ? 1 : -1) * (role === "sl" ? 1 : -1);
      return Number(
        (scale.coordinateToPrice(current + direction * 70) ?? entry).toFixed(
          s.broker.specs.precision,
        ),
      );
    },
  }));
  const x = (time: number) => {
    const c = chart.current;
    if (!c || !bars.length) return 0;
    const exact = c.timeScale().timeToCoordinate(time as UTCTimestamp);
    if (exact !== null) return exact;
    const logical = logicalAtTime(times, time, FRAMES[timeframe]);
    return c.timeScale().logicalToCoordinate(logical as any) ?? 0;
  };
  const y = (price: number) => series.current?.priceToCoordinate(price) ?? -100;
  const point = (px: number, py: number, magnet = false, ctrl = false) => {
    const logical = Number(chart.current!.timeScale().coordinateToLogical(px)),
      i = Math.floor(logical);
    const time = timeAtLogical(times, logical, FRAMES[timeframe]);
    const raw = {
      time,
      price: Number(
        (series.current!.coordinateToPrice(py) ?? s.tick.bid).toFixed(
          s.broker.specs.precision,
        ),
      ),
    };
    if (!magnet) return raw;
    const mode = ctrl
      ? (appearance.magnet ?? "weak") === "off"
        ? "weak"
        : "off"
      : (appearance.magnet ?? "weak");
    const result = snapDrawingPoint(raw, bars, px, py, x, y, mode);
    setSnapPoint(result.snapped ? result.point : null);
    return result.point;
  };
  const linePoint = (
    drawing: Drawing,
    p: Drawing["a"],
    shift: boolean,
    handle?: string,
  ) => {
    const next = constrainLinePoint(drawing, p, shift, x, y, handle);
    if (
      shift &&
      ["trend", "ray"].includes(drawing.kind) &&
      (handle === "a" || handle === "b")
    )
      setSnapPoint(null);
    return next;
  };
  const cancelGesture = () => {
    linePlacement.current = null;
    lastLinePoint.current = null;
    drag.current = null;
    setDraft(null);
    setChanged(null);
    setProtect(null);
    setOrderPreview(null);
    setSnapPoint(null);
    chart.current?.applyOptions({
      handleScroll: tool === "select" && !picker && !studyPicking,
      handleScale: tool === "select" && !picker && !studyPicking,
    });
  };
  const refreshLinePreview = (shift: boolean) => {
    const p = lastLinePoint.current;
    if (!p) return;
    const gesture = drag.current;
    if (gesture?.type === "new") {
      const drawing = gesture.drawing as Drawing;
      if (!["trend", "ray"].includes(drawing.kind)) return;
      gesture.drawing = finishDrawing(
        drawing,
        linePoint(drawing, p, shift, "b"),
      );
      setDraft(gesture.drawing);
    } else if (
      gesture?.type === "move" &&
      ["a", "b"].includes(gesture.handle)
    ) {
      const drawing = gesture.original as Drawing;
      if (!["trend", "ray"].includes(drawing.kind)) return;
      setChanged(
        s.drawings.map((d) =>
          d.id === gesture.id
            ? moveDrawing(
                drawing,
                linePoint(drawing, p, shift, gesture.handle),
                gesture.start,
                gesture.handle,
              )
            : d,
        ),
      );
    } else if (!gesture && linePlacement.current) {
      setDraft(
        finishDrawing(
          linePlacement.current,
          linePoint(linePlacement.current, p, shift, "b"),
        ),
      );
    }
  };
  lineKeyHandler.current = (event) => {
    const target = event.target as HTMLElement | null;
    if (
      target?.isContentEditable ||
      target?.closest?.("input, textarea, select, dialog")
    )
      return;
    if (event.key === "Shift") refreshLinePreview(event.type === "keydown");
    if (
      event.type === "keydown" &&
      event.key === "Enter" &&
      linePlacement.current &&
      lastLinePoint.current
    ) {
      const original = linePlacement.current;
      const completed = finishDrawing(
        original,
        linePoint(original, lastLinePoint.current, event.shiftKey, "b"),
      );
      if (
        Math.hypot(
          x(completed.b.time) - x(completed.a.time),
          y(completed.b.price) - y(completed.a.price),
        ) < 6
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      onDraw([...s.drawings, completed]);
      linePlacement.current = null;
      lastLinePoint.current = null;
      setDraft(null);
      setSnapPoint(null);
    }
    if (
      event.type === "keydown" &&
      event.key === "Escape" &&
      (linePlacement.current || drag.current)
    ) {
      event.preventDefault();
      cancelGesture();
    }
  };
  const start = (e: React.PointerEvent<SVGSVGElement>) => {
    if (secondary || !bars.length || e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect(),
      p = point(
        e.clientX - rect.left,
        e.clientY - rect.top,
        (tool !== "select" ||
          !!(e.target as SVGElement).dataset.handle ||
          !!picker) &&
          !e.altKey,
        e.ctrlKey,
      ),
      target =
        (e.target as SVGElement).closest<SVGElement>(
          "[data-order-role], [data-pending], [data-position]",
        ) ?? (e.target as SVGElement),
      id = target.closest<SVGElement>("[data-id]")?.dataset.id,
      handle = target.dataset.handle;
    if (
      id ||
      target.dataset.orderRole ||
      target.dataset.pending ||
      target.dataset.position ||
      tool !== "select" ||
      picker ||
      studyPicking
    ) {
      e.stopPropagation();
      e.preventDefault();
      chart.current?.applyOptions({ handleScroll: false, handleScale: false });
    }
    lastLinePoint.current = p;
    const creating = target.dataset.createProtection === "true";
    if (!creating && studyPicking && onStudyPick) {
      const nearest = bars.reduce((a, b) =>
        Math.abs(x(a.time) - (e.clientX - rect.left)) <=
        Math.abs(x(b.time) - (e.clientX - rect.left))
          ? a
          : b,
      );
      e.preventDefault();
      onStudyPick(nearest.time);
      return;
    }
    if (!creating && picker && onOrderLevel) {
      onOrderLevel(picker, p.price);
      return;
    }
    if (
      (tool === "select" || creating) &&
      target.dataset.orderRole &&
      onOrderLevel
    ) {
      drag.current = {
        type: "order",
        role: target.dataset.orderRole,
        creating,
        startY: e.clientY,
      };
      drag.current.original = orderDraft;
      setOrderPreview({
        role: target.dataset.orderRole as OrderLevel,
        price: p.price,
      });
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if ((tool === "select" || creating) && target.dataset.position) {
      const pos = s.broker.positions.find(
        (p) => p.id === target.dataset.position,
      )!;
      if (!pos) return;
      drag.current = {
        type: "protect",
        pos,
        kind: target.dataset.kind,
        creating,
        startY: e.clientY,
      };
      setProtect({
        id: pos.id,
        kind: target.dataset.kind as any,
        price: p.price,
      });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if ((tool === "select" || creating) && target.dataset.pending) {
      const order = s.broker.pending.find(
        (p) => p.id === target.dataset.pending,
      );
      if (!order) return;
      drag.current = {
        type: "pending",
        order,
        role: target.dataset.kind,
        creating,
        startY: e.clientY,
      };
      setOrderPreview({
        role: target.dataset.kind as OrderLevel,
        price: p.price,
      });
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (tool !== "select") {
      if ((tool === "ray" || tool === "trend") && linePlacement.current) {
        const drawing = finishDrawing(
          linePlacement.current,
          linePoint(linePlacement.current, p, e.shiftKey, "b"),
        );
        linePlacement.current = null;
        drag.current = { type: "new", drawing };
        setDraft(drawing);
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      const drawing: Drawing = {
        id: crypto.randomUUID(),
        kind: tool,
        a: p,
        b: p,
        color: palette.muted,
        locked: false,
        label:
          tool === "long" ? "Buy plan" : tool === "short" ? "Sell plan" : "",
        levels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1],
        createdCursor: s.broker.seq,
        lots: planLots,
      };
      drag.current = { type: "new", drawing };
      setDraft(drawing);
      onSelect(drawing.id);
      e.currentTarget.setPointerCapture(e.pointerId);
    } else if (id) {
      const original = s.drawings.find((d) => d.id === id)!;
      onSelect(id);
      if (original.locked) return;
      e.preventDefault();
      drag.current = { type: "move", id, handle, original, start: p };
      setChanged(structuredClone(s.drawings));
      e.currentTarget.setPointerCapture(e.pointerId);
    } else onSelect(null);
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag.current && !linePlacement.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const gesture = drag.current;
    const p = point(
      e.clientX - rect.left,
      e.clientY - rect.top,
      ((!gesture && !!linePlacement.current) ||
        gesture?.type === "new" ||
        (gesture?.type === "move" && !!gesture.handle)) &&
        !e.altKey,
      e.ctrlKey,
    );
    lastLinePoint.current = p;
    if (!gesture) {
      if ((tool === "ray" || tool === "trend") && linePlacement.current)
        setDraft(
          finishDrawing(
            linePlacement.current,
            linePoint(linePlacement.current, p, e.shiftKey, "b"),
          ),
        );
      return;
    }
    if (gesture.type === "new") {
      const original = gesture.drawing as Drawing;
      gesture.drawing = finishDrawing(
        original,
        linePoint(original, p, e.shiftKey, "b"),
      );
      setDraft(gesture.drawing);
    } else if (gesture.type === "order" || gesture.type === "pending") {
      setOrderPreview({ role: gesture.role, price: p.price });
    } else if (gesture.type === "protect") {
      setProtect({
        id: gesture.pos.id,
        kind: gesture.kind as any,
        price: p.price,
      });
    } else {
      setChanged(
        s.drawings.map((d) =>
          d.id === gesture.id
            ? moveDrawing(
                gesture.original,
                linePoint(gesture.original, p, e.shiftKey, gesture.handle),
                gesture.start,
                gesture.handle,
              )
            : d,
        ),
      );
    }
  };
  const finish = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    // A click or a cancelled gesture must not create protection at the entry.
    if (
      drag.current.creating &&
      Math.abs(e.clientY - drag.current.startY) < 4
    ) {
      cancelGesture();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect(),
      pointAtRelease = point(
        e.clientX - rect.left,
        e.clientY - rect.top,
        (drag.current.type === "new" ||
          (drag.current.type === "move" && !!drag.current.handle)) &&
          !e.altKey,
        e.ctrlKey,
      );
    if (drag.current.type === "new") {
      const original = drag.current.drawing as Drawing;
      const completed = finishDrawing(
        original,
        linePoint(original, pointAtRelease, e.shiftKey, "b"),
      );
      if (
        ["ray", "trend"].includes(original.kind) &&
        Math.hypot(
          x(completed.b.time) - x(completed.a.time),
          y(completed.b.price) - y(completed.a.price),
        ) < 6
      ) {
        linePlacement.current = original;
        drag.current = null;
        setDraft(completed);
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
        return;
      }
      linePlacement.current = null;
      const needsArea = ["zone", "fib", "long", "short"].includes(
        original.kind,
      );
      if (
        !needsArea ||
        (Math.abs(x(completed.b.time) - x(completed.a.time)) >= 8 &&
          Math.abs(y(completed.b.price) - y(completed.a.price)) >= 8)
      )
        onDraw([...s.drawings, completed]);
    }
    if (drag.current.type === "move") {
      const d = drag.current;
      onDraw(
        s.drawings.map((a) =>
          a.id === d.id
            ? moveDrawing(
                d.original,
                linePoint(d.original, pointAtRelease, e.shiftKey, d.handle),
                d.start,
                d.handle,
              )
            : a,
        ),
      );
    }
    if (drag.current.type === "order")
      onOrderLevel?.(drag.current.role, pointAtRelease.price);
    if (drag.current.type === "pending") {
      const { order, role } = drag.current,
        price = pointAtRelease.price;
      const delta = price - order.price;
      onPendingEdit?.(
        order.id,
        role === "entry"
          ? { price }
          : role === "sl"
            ? { sl: price }
            : { tp: price },
      );
    }
    if (drag.current.type === "protect") {
      const p = drag.current.pos;
      onProtect(
        p.id,
        drag.current.kind === "sl" ? pointAtRelease.price : p.sl,
        drag.current.kind === "tp" ? pointAtRelease.price : p.tp,
      );
    }
    drag.current = null;
    lastLinePoint.current = null;
    setDraft(null);
    setChanged(null);
    setProtect(null);
    setOrderPreview(null);
    setSnapPoint(null);
    chart.current?.applyOptions({
      handleScroll: tool === "select",
      handleScale: tool === "select",
    });
  };
  const drawings = [
    ...(changed ?? s.drawings),
    ...(draft ? [draft] : []),
  ].filter((d) => !d.hidden);
  const active = hover ?? bars.at(-1);
  const paneHeight = chart.current?.panes()[0]?.getHeight() ?? dims.h;
  const overlays = s.indicators.filter((i) => i.enabled);
  const levels = appLevels.map((l) => ({ p: l.price, label: l.label }));
  const visibleDraft =
    orderPreview && drag.current?.type === "order" && orderDraft
      ? orderPreview.role === "entry"
        ? moveDraftEntry(
            drag.current.original ?? orderDraft,
            orderPreview.price,
            s.tick.bid,
          )
        : { ...orderDraft, [orderPreview.role]: orderPreview.price }
      : orderDraft;
  const visiblePending = s.broker.pending.map((p) => {
    if (
      drag.current?.type !== "pending" ||
      drag.current.order.id !== p.id ||
      !orderPreview
    )
      return p;
    const role = orderPreview.role,
      price = orderPreview.price;
    const delta = role === "entry" ? price - p.price! : 0;
    const level = {
      side: p.side,
      kind: p.kind,
      entry: p.price! + delta,
      lots: p.lots,
      sl: role === "sl" ? price : p.sl,
      tp: role === "tp" ? price : p.tp,
    };
    const next =
      p.automaticLevel && role === "entry"
        ? resolveLevelDraft(level, s.tick.bid)
        : level;
    return {
      ...p,
      side: next.side,
      kind: next.kind,
      price: next.entry,
      sl: next.sl,
      tp: next.tp,
    };
  });
  // Creation handles are separate targets: they never reuse the entry gesture.
  const protectionHandles = (
    owner: "draft" | "pending" | "position",
    id: string,
    entry: number,
    side: "buy" | "sell",
    sl: number | undefined,
    tp: number | undefined,
    labelX: number,
  ) => {
    const yy = y(entry);
    if (!Number.isFinite(yy)) return null;
    return (["sl", "tp"] as const).map((role, index) => {
      if ((role === "sl" ? sl : tp) !== undefined) return null;
      const color = role === "sl" ? tradeColors.sl : tradeColors.tp;
      const xx =
        Math.max(172, Math.min(dims.w - 194, labelX - 118)) + index * 57;
      const label = "Add " + role.toUpperCase() + " to " + owner + " " + id;
      return (
        <g
          key={owner + id + role}
          role="button"
          tabIndex={0}
          aria-label={label}
          className="protection-create-handle"
          data-create-protection="true"
          data-order-role={owner === "draft" ? role : undefined}
          data-pending={owner === "pending" ? id : undefined}
          data-position={owner === "position" ? id : undefined}
          data-kind={role}
          style={{ pointerEvents: "all", cursor: "ns-resize" }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            const direction =
              (side === "buy" ? 1 : -1) * (role === "sl" ? 1 : -1);
            const value = series.current?.coordinateToPrice(
              yy + direction * 70,
            );
            if (value === null || value === undefined || value <= 0) return;
            const price = Number(value.toFixed(s.broker.specs.precision));
            if (owner === "draft") onOrderLevel?.(role, price);
            else if (owner === "pending")
              onPendingEdit?.(id, { [role]: price });
            else
              onProtect(
                id,
                role === "sl" ? price : sl,
                role === "tp" ? price : tp,
              );
          }}
        >
          <title>
            {"Dra " +
              role.toUpperCase() +
              " fra inngangen til ønsket pris. Enter legger til et nærliggende nivå. Escape avbryter."}
          </title>
          <rect
            x={xx}
            y={yy - 13}
            width={52}
            height={26}
            rx={5}
            fill={palette.panel}
            stroke={color}
            strokeWidth={1.5}
          />
          <text
            x={xx + 26}
            y={yy + 4}
            textAnchor="middle"
            fill={color}
            fontSize={11}
            fontWeight={600}
            style={{ pointerEvents: "none" }}
          >
            + {role.toUpperCase()}
          </text>
        </g>
      );
    });
  };
  return (
    <div
      className={"chart " + (secondary ? "secondary" : "")}
      data-last-candle-x={times.length ? x(times.at(-1)!) : undefined}
      tabIndex={-1}
      onPointerDownCapture={(e) => {
        if (
          !(e.target as Element).closest(
            'input,textarea,select,button,a,summary,video,[contenteditable="true"],[role="button"]',
          )
        ) {
          e.currentTarget.focus({ preventScroll: true });
        }
      }}
      onContextMenu={(e) => {
        if (
          secondary ||
          !bars.length ||
          (e.target as Element).closest("input,button,select")
        )
          return;
        e.preventDefault();
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        const p = point(e.clientX - r.left, e.clientY - r.top);
        onContext?.({
          x: e.clientX,
          y: e.clientY,
          price: p.price,
          time: p.time,
        });
      }}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (
          tool === "select" &&
          !picker &&
          !(e.target as Element).closest(
            "[data-id],[data-order-role],[data-position]",
          )
        )
          onSelect(null);
      }}
    >
      <div ref={host} className="chart-canvas" />
      {!secondary && onHTFChange && onLearnHTF && (
        <HTFCandles
          bars={htfBars}
          cutoff={s.tick.t}
          value={s.layout.htf}
          save={(value) => {
            onHTFChange(value);
            if (value.enabled)
              reserveSideSpace(
                Math.max(178, (value.width + value.gap) * value.count + 100) +
                  24,
              );
          }}
          precision={s.broker.specs.precision}
          height={paneHeight}
          priceY={y}
          onLearn={onLearnHTF}
          onFit={() => {
            const c = { ...DEFAULT_HTF, ...s.layout.htf };
            const shown = htfCandles(htfBars, s.tick.t, c.timeframe, c.count);
            if (!shown.length) return;
            const low = Math.min(...shown.map((b) => b.low)),
              high = Math.max(...shown.map((b) => b.high)),
              pad =
                Math.max(high - low, s.broker.specs.tickSize ?? 0.001) * 0.25;
            chart.current
              ?.priceScale("right")
              .setVisibleRange({ from: low - pad, to: high + pad });
            reserveSideSpace();
            repaint((v) => v + 1);
          }}
        />
      )}
      {!secondary && (
        <div
          className="chart-order-sizes"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {visibleDraft && (
            <label
              className="order-inline-size"
              style={{
                top: Math.max(
                  34,
                  Math.min(paneHeight - 42, y(visibleDraft.entry) - 14),
                ),
              }}
            >
              Størrelse{" "}
              <input
                aria-label="Draft size"
                type="number"
                min={s.broker.specs.minLot}
                step={s.broker.specs.lotStep}
                value={visibleDraft.lots}
                onChange={(e) => onDraftLots?.(Number(e.target.value))}
              />
            </label>
          )}
          {s.broker.pending.map((p) => (
            <label
              className="order-inline-size"
              key={p.id}
              style={{
                top: Math.max(
                  34,
                  Math.min(paneHeight - 42, y(p.price ?? s.tick.bid) - 14),
                ),
              }}
            >
              {p.side.toUpperCase()} @{" "}
              {p.price?.toFixed(s.broker.specs.precision)}{" "}
              <input
                aria-label={"Pending size " + p.id}
                type="number"
                min={s.broker.specs.minLot}
                step={s.broker.specs.lotStep}
                defaultValue={p.lots}
                key={p.id + ":" + p.lots}
                onBlur={(e) => {
                  const lots = Number(e.target.value);
                  if (lots !== p.lots) onPendingEdit?.(p.id, { lots });
                }}
              />
            </label>
          ))}
        </div>
      )}
      <div className="chart-caption">
        <strong>{instrumentForDataset(s.dataset)}</strong>
        <span>
          {timeframe} per candle ·{" "}
          {s.dataset.startsWith("dukascopy") ? "Dukascopy" : "CSV"} / bid
        </span>
        {active && (
          <span className="ohlc">
            O {active.open.toFixed(s.broker.specs.precision)}　H{" "}
            {active.high.toFixed(s.broker.specs.precision)}　L{" "}
            {active.low.toFixed(s.broker.specs.precision)}　C{" "}
            <b>{active.close.toFixed(s.broker.specs.precision)}</b>
          </span>
        )}
      </div>
      <svg
        width={dims.w}
        height={dims.h}
        className={
          "drawing-layer " +
          ((tool !== "select" || picker || studyPicking) && !secondary
            ? "drawing"
            : "")
        }
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={() => {
          linePlacement.current = null;
          lastLinePoint.current = null;
          drag.current = null;
          setDraft(null);
          setChanged(null);
          setProtect(null);
          setOrderPreview(null);
          setSnapPoint(null);
          chart.current?.applyOptions({
            handleScroll: tool === "select" && !picker,
            handleScale: tool === "select" && !picker,
          });
        }}
        onLostPointerCapture={() => {
          if (!drag.current) return;
          drag.current = null;
          setDraft(null);
          setChanged(null);
          setProtect(null);
          setOrderPreview(null);
          setSnapPoint(null);
          chart.current?.applyOptions({
            handleScroll: tool === "select" && !picker,
            handleScale: tool === "select" && !picker,
          });
        }}
      >
        <defs>
          <clipPath id={secondary ? "plot2" : "plot"}>
            <rect
              x="0"
              y="30"
              width={Math.max(0, dims.w - 70)}
              height={Math.max(0, paneHeight - 30)}
            />
          </clipPath>
        </defs>
        <g clipPath={`url(#${secondary ? "plot2" : "plot"})`}>
          <TradeMarkers
            session={s}
            x={(time) =>
              x(Math.floor(time / FRAMES[timeframe]) * FRAMES[timeframe])
            }
            y={y}
          />
          {s.study?.overlay &&
            s.study.range &&
            s.study.range.selectedAt <= s.tick.t &&
            s.study.range.selectedSeq <= s.broker.seq && (
              <RRRangeOverlay
                range={s.study.range}
                x={x}
                y={y}
                width={dims.w}
                cutoff={s.tick.t}
                detailed={FRAMES[timeframe] <= FRAMES[s.study.range.timeframe]}
                accent={palette.accent}
                muted={palette.muted}
              />
            )}
          {chartBreaks(bars, timeframe).map((boundary) => {
            const px = (x(boundary.before) + x(boundary.after)) / 2;
            const label = boundary.missing
              ? "Missing price data"
              : "Market time break";
            return (
              <g
                key={"break:" + boundary.after}
                data-chart-break={boundary.missing ? "missing" : "closed"}
              >
                <title>
                  {s.layout.blind
                    ? label
                    : label +
                      " · " +
                      candleLabel(
                        boundary.from / 1000,
                        timeframe,
                        s.layout.timezone,
                        false,
                      ) +
                      " – " +
                      candleLabel(
                        boundary.to / 1000,
                        timeframe,
                        s.layout.timezone,
                        false,
                      ) +
                      (boundary.missing
                        ? ". Incomplete candles are omitted; replay cannot cross unverified data."
                        : ". No empty candle slots are inserted.")}
                </title>
                <line
                  x1={px}
                  x2={px}
                  y1={30}
                  y2={paneHeight}
                  stroke={boundary.missing ? palette.accent : palette.muted}
                  strokeWidth="1"
                  strokeDasharray="3 5"
                  opacity={boundary.missing ? 0.85 : 0.45}
                  pointerEvents="stroke"
                />
              </g>
            );
          })}
          {overlays.some((i) => i.kind === "sessions") &&
            bars
              .filter(
                (b, i) =>
                  i === 0 ||
                  sessionFlags(b.time * 1000).london !==
                    sessionFlags(bars[i - 1].time * 1000).london ||
                  sessionFlags(b.time * 1000).newYork !==
                    sessionFlags(bars[i - 1].time * 1000).newYork,
              )
              .map((b, i, a) => {
                const f = sessionFlags(b.time * 1000);
                return f.london || f.newYork ? (
                  <rect
                    key={b.time}
                    x={x(b.time)}
                    y={30}
                    width={Math.max(
                      1,
                      x(a[i + 1]?.time ?? bars.at(-1)!.time) - x(b.time),
                    )}
                    height={paneHeight}
                    fill={f.london ? "#aaaaaa08" : "#77777708"}
                  />
                ) : null;
              })}
          {levels.map((l) => (
            <g key={l.label}>
              <line
                x1={0}
                x2={dims.w - 70}
                y1={y(l.p)}
                y2={y(l.p)}
                stroke={palette.muted}
                strokeDasharray="3 6"
              />
              <text x={12} y={y(l.p) - 5} fill={palette.muted} fontSize="10">
                {l.label} {l.p.toFixed(s.broker.specs.precision)}
              </text>
            </g>
          ))}
          {drawings.map((d) => {
            const xa = x(d.a.time),
              xb = x(d.b.time),
              ya = y(d.a.price),
              yb = y(d.b.price);
            const attrs = {
              "data-id": d.id,
              stroke: d.color,
              strokeWidth: selected === d.id ? 2 : 1.2,
              style: {
                pointerEvents: "stroke" as const,
                cursor: d.locked ? "default" : "move",
              },
            };
            const left = Math.min(xa, xb),
              top = Math.min(ya, yb),
              w = Math.max(1, Math.abs(xb - xa)),
              h = Math.max(1, Math.abs(yb - ya));
            return (
              <g key={d.id} data-id={d.id}>
                {d.kind === "horizontal" && (
                  <>
                    <line
                      data-id={d.id}
                      x1={d.kind === "horizontal" ? 0 : xa}
                      y1={ya}
                      x2={dims.w - 70}
                      y2={ya}
                      stroke="transparent"
                      strokeWidth={12}
                      style={{
                        pointerEvents: "stroke",
                        cursor: d.locked ? "default" : "move",
                      }}
                    />
                    <line
                      {...attrs}
                      x1={d.kind === "horizontal" ? 0 : xa}
                      y1={ya}
                      x2={dims.w - 70}
                      y2={ya}
                    />
                    <text
                      x={Math.max(10, xa)}
                      y={ya - 7}
                      fill={d.color}
                      fontSize="11"
                    >
                      {d.label || d.a.price.toFixed(s.broker.specs.precision)}
                    </text>
                  </>
                )}
                {d.kind === "trend" && (
                  <>
                    <line
                      {...attrs}
                      x1={xa}
                      y1={ya}
                      x2={xb}
                      y2={yb}
                      stroke="transparent"
                      strokeWidth={14}
                    />
                    <line {...attrs} x1={xa} y1={ya} x2={xb} y2={yb} />
                  </>
                )}
                {d.kind === "ray" &&
                  (() => {
                    const segment = clipRay(
                      { x: xa, y: ya },
                      { x: xb, y: yb },
                      {
                        left: 0,
                        right: dims.w - 70,
                        top: 30,
                        bottom: paneHeight,
                      },
                    );
                    return segment ? (
                      <>
                        <line
                          {...attrs}
                          {...segment}
                          stroke="transparent"
                          strokeWidth={12}
                        />
                        <line {...attrs} {...segment} />
                        {d.label && (
                          <text
                            x={xa + 6}
                            y={ya - 7}
                            fill={d.color}
                            fontSize={11}
                          >
                            {d.label}
                          </text>
                        )}
                      </>
                    ) : null;
                  })()}
                {d.kind === "zone" && (
                  <rect
                    {...attrs}
                    x={left}
                    y={top}
                    width={w}
                    height={h}
                    fill={alpha(d.color, appearance.zoneOpacity)}
                    style={{
                      pointerEvents: "all",
                      cursor: d.locked ? "default" : "move",
                    }}
                  />
                )}
                {d.kind === "fib" &&
                  d.levels.map((level, index) => {
                    const st = d.fibStyles?.[String(level)] ?? {
                      color: [
                        "#e6e6e6",
                        "#65b8df",
                        "#5dd995",
                        "#ffd080",
                        "#ff9b4a",
                        "#cf96f0",
                        "#e6e6e6",
                      ][index % 7],
                      label: String(level),
                      visible: true,
                      style: "dashed",
                    };
                    if (!st.visible) return null;
                    const price = d.a.price + (d.b.price - d.a.price) * level,
                      yy = y(price);
                    return (
                      <g key={level}>
                        {(d.fibFill ?? true) && index > 0 && (
                          <rect
                            {...attrs}
                            x={left}
                            width={w}
                            y={Math.min(
                              yy,
                              y(
                                d.a.price +
                                  (d.b.price - d.a.price) * d.levels[index - 1],
                              ),
                            )}
                            height={Math.abs(
                              yy -
                                y(
                                  d.a.price +
                                    (d.b.price - d.a.price) *
                                      d.levels[index - 1],
                                ),
                            )}
                            stroke="none"
                            fill={st.color}
                            fillOpacity={0.08}
                          />
                        )}
                        <line
                          {...attrs}
                          x1={left}
                          y1={yy}
                          x2={left + w}
                          y2={yy}
                          stroke={st.color}
                          strokeDasharray={
                            st.style === "solid"
                              ? ""
                              : st.style === "dotted"
                                ? "2 3"
                                : "6 4"
                          }
                        />
                        {(index === 0 ||
                          index === d.levels.length - 1 ||
                          (Math.abs(yy - ya) > 13 &&
                            Math.abs(yy - yb) > 13 &&
                            d.levels
                              .slice(0, index)
                              .every(
                                (previous) =>
                                  Math.abs(
                                    y(
                                      d.a.price +
                                        (d.b.price - d.a.price) * previous,
                                    ) - yy,
                                  ) > 13,
                              ))) && (
                          <text
                            x={left + 4}
                            y={yy - 5}
                            fill={st.color}
                            fontSize="10"
                          >
                            {st.label} ·{" "}
                            {price.toFixed(s.broker.specs.precision)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                {(d.kind === "long" || d.kind === "short") &&
                  (() => {
                    const entry = d.a.price,
                      stop = d.b.price,
                      target = planLevels(d).tp,
                      yt = y(target),
                      risk =
                        Math.abs(entry - stop) *
                        s.broker.specs.contract *
                        (d.lots ?? 0.01),
                      reward =
                        Math.abs(target - entry) *
                        s.broker.specs.contract *
                        (d.lots ?? 0.01),
                      rr =
                        Math.abs(target - entry) /
                        Math.max(0.001, Math.abs(entry - stop));
                    return (
                      <>
                        <rect
                          {...attrs}
                          x={left}
                          y={Math.min(ya, yb)}
                          width={w}
                          height={Math.max(1, Math.abs(ya - yb))}
                          fill={alpha(palette.down, appearance.zoneOpacity)}
                          stroke={palette.down}
                          style={{
                            pointerEvents: "all",
                            cursor: d.locked ? "default" : "move",
                          }}
                        />
                        <rect
                          {...attrs}
                          x={left}
                          y={Math.min(ya, yt)}
                          width={w}
                          height={Math.max(1, Math.abs(ya - yt))}
                          fill={alpha(palette.up, appearance.zoneOpacity)}
                          stroke={palette.up}
                          style={{
                            pointerEvents: "all",
                            cursor: d.locked ? "default" : "move",
                          }}
                        />
                        <line
                          {...attrs}
                          x1={left}
                          y1={ya}
                          x2={left + w}
                          y2={ya}
                        />
                        {selected === d.id && (
                          <text
                            x={left + 6}
                            y={ya - 7}
                            fill={palette.text}
                            fontSize="11"
                          >
                            {d.kind === "long" ? "BUY" : "SELL"} · R:R{" "}
                            {rr.toFixed(2)}
                          </text>
                        )}
                        {selected === d.id && (
                          <text
                            x={left + 6}
                            y={yb + 14}
                            fill={palette.down}
                            fontSize="10"
                          >
                            SL {stop.toFixed(s.broker.specs.precision)}
                            {w > 230
                              ? ` · ${s.broker.specs.currency ?? "USD"} ${risk.toFixed(2)}`
                              : ""}
                          </text>
                        )}
                        {selected === d.id && (
                          <text
                            x={left + 6}
                            y={yt - 6}
                            fill={palette.up}
                            fontSize="10"
                          >
                            TP {target.toFixed(s.broker.specs.precision)}
                            {w > 230
                              ? ` · +${s.broker.specs.currency ?? "USD"} ${reward.toFixed(2)}`
                              : ""}
                          </text>
                        )}
                      </>
                    );
                  })()}
                {selected === d.id &&
                  !d.locked &&
                  drawingScreenHandles(d, x, y).map(({ x: hx, y: hy, key }) => (
                    <circle
                      key={key}
                      data-id={d.id}
                      data-handle={key}
                      cx={hx}
                      cy={hy}
                      r={6}
                      fill={palette.bg}
                      stroke={palette.accent}
                      strokeWidth={2}
                      style={{
                        pointerEvents: "all",
                        cursor: ["e", "w", "width", "left"].includes(key)
                          ? "ew-resize"
                          : ["n", "s", "b", "tp"].includes(key)
                            ? "ns-resize"
                            : ["nw", "se"].includes(key)
                              ? "nwse-resize"
                              : ["ne", "sw"].includes(key)
                                ? "nesw-resize"
                                : "grab",
                      }}
                    />
                  ))}
              </g>
            );
          })}
          {!secondary &&
            appearance.graphOrders &&
            visibleDraft &&
            (["entry", "sl", "tp"] as const)
              .filter(
                (role) =>
                  !(role === "entry" && visibleDraft.kind === "market") &&
                  Number.isFinite(visibleDraft[role]) &&
                  visibleDraft[role]! > 0,
              )
              .map((role) => {
                const price =
                    orderPreview?.role === role
                      ? orderPreview.price
                      : visibleDraft[role]!,
                  yy = y(price),
                  color =
                    role === "sl"
                      ? tradeColors.sl
                      : role === "tp"
                        ? tradeColors.tp
                        : visibleDraft.side === "sell"
                          ? tradeColors.sell
                          : tradeColors.buy;
                const cash =
                  role === "entry"
                    ? null
                    : Math.abs(price - visibleDraft.entry) *
                      visibleDraft.lots *
                      s.broker.specs.contract;
                return (
                  <g key={`draft:${role}`}>
                    <line
                      data-order-role={role}
                      x1={0}
                      x2={dims.w - 70}
                      y1={yy}
                      y2={yy}
                      stroke="transparent"
                      strokeWidth={14}
                      style={{ pointerEvents: "stroke", cursor: "ns-resize" }}
                    />
                    <line
                      data-order-role={role}
                      x1={0}
                      x2={dims.w - 70}
                      y1={yy}
                      y2={yy}
                      stroke={color}
                      strokeDasharray={
                        role === "sl"
                          ? "3 3"
                          : role === "tp"
                            ? "9 3 2 3"
                            : "7 4"
                      }
                      style={{ pointerEvents: "stroke", cursor: "ns-resize" }}
                      strokeWidth={1.5}
                    />
                    <rect
                      data-order-role={role}
                      x={Math.max(30, dims.w - 275)}
                      y={yy - 12}
                      width={197}
                      height={23}
                      rx={3}
                      fill={palette.panel}
                      stroke={color}
                      style={{ pointerEvents: "all", cursor: "ns-resize" }}
                    />
                    <text
                      x={Math.max(35, dims.w - 269)}
                      y={yy + 3}
                      fill={color}
                      fontSize={10}
                      style={{ pointerEvents: "none" }}
                    >
                      {role === "entry"
                        ? `${visibleDraft.side.toUpperCase()} ${price.toFixed(s.broker.specs.precision)} · ${visibleDraft.lots} ${s.broker.specs.unit ?? "lot"}`
                        : `${role.toUpperCase()} ${price.toFixed(s.broker.specs.precision)} · ${s.broker.specs.currency ?? "USD"} ${cash!.toFixed(2)}`}
                    </text>
                    {role === "entry" && onCancelDraft && (
                      <g
                        role="button"
                        aria-label="Cancel draft"
                        tabIndex={0}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={onCancelDraft}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            onCancelDraft();
                          }
                        }}
                        style={{ pointerEvents: "all", cursor: "pointer" }}
                      >
                        <title>Cancel draft</title>
                        <rect
                          x={dims.w - 101}
                          y={yy - 10}
                          width={21}
                          height={20}
                          fill={palette.panel}
                        />
                        <text
                          x={dims.w - 96}
                          y={yy + 4}
                          fill={palette.text}
                          fontSize={14}
                        >
                          ×
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
          {!secondary &&
            visiblePending.flatMap((p, pendingIndex) =>
              (
                [
                  { role: "entry", price: p.price },
                  { role: "sl", price: p.sl },
                  { role: "tp", price: p.tp },
                ] as const
              )
                .filter((level) => level.price !== undefined)
                .map((level) => {
                  const price = level.price!;
                  const color =
                      level.role === "sl"
                        ? tradeColors.sl
                        : level.role === "tp"
                          ? tradeColors.tp
                          : p.side === "sell"
                            ? tradeColors.sell
                            : tradeColors.buy,
                    yy = y(price);
                  return (
                    <g key={`${p.id}:${level.role}`}>
                      <line
                        data-pending={p.id}
                        data-kind={level.role}
                        x1={0}
                        x2={dims.w - 70}
                        y1={yy}
                        y2={yy}
                        stroke="transparent"
                        strokeWidth={14}
                        style={{ pointerEvents: "stroke", cursor: "ns-resize" }}
                      />
                      <line
                        data-pending={p.id}
                        data-kind={level.role}
                        x1={0}
                        x2={dims.w - 70}
                        y1={yy}
                        y2={yy}
                        stroke={color}
                        strokeDasharray="3 4"
                        style={{ pointerEvents: "stroke", cursor: "ns-resize" }}
                      />
                      <rect
                        data-pending={p.id}
                        data-kind={level.role}
                        x={Math.max(8, dims.w - 280 - (pendingIndex % 4) * 210)}
                        y={yy - 11}
                        width={200}
                        height={22}
                        rx={3}
                        fill={palette.panel}
                        stroke={color}
                        style={{ pointerEvents: "all", cursor: "ns-resize" }}
                      />
                      <text
                        x={Math.max(
                          13,
                          dims.w - 274 - (pendingIndex % 4) * 210,
                        )}
                        y={yy + 3}
                        fill={color}
                        fontSize={10}
                      >
                        {level.role === "entry"
                          ? levelLabel(p.side)
                          : level.role.toUpperCase()}{" "}
                        {price.toFixed(s.broker.specs.precision)} ·{" "}
                        {level.role === "entry"
                          ? p.lots + " " + (s.broker.specs.unit ?? "lot")
                          : (s.broker.specs.currency ?? "USD") +
                            " " +
                            (
                              Math.abs(price - p.price!) *
                              p.lots *
                              s.broker.specs.contract
                            ).toFixed(2)}
                      </text>
                      {level.role === "entry" && onCancelPending && (
                        <g
                          role="button"
                          aria-label="Cancel order"
                          tabIndex={0}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => onCancelPending(p.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              onCancelPending(p.id);
                            }
                          }}
                          style={{ pointerEvents: "all", cursor: "pointer" }}
                        >
                          <title>Cancel order</title>
                          <rect
                            x={dims.w - 103}
                            y={yy - 10}
                            width={21}
                            height={20}
                            fill={palette.panel}
                          />
                          <text
                            x={dims.w - 98}
                            y={yy + 4}
                            fill={palette.text}
                            fontSize={14}
                          >
                            ×
                          </text>
                        </g>
                      )}
                    </g>
                  );
                }),
            )}
          {!secondary &&
            s.broker.positions.flatMap((p) =>
              [
                { kind: "entry", price: p.entry },
                {
                  kind: "sl",
                  price:
                    protect?.id === p.id && protect.kind === "sl"
                      ? protect.price
                      : p.sl,
                },
                {
                  kind: "tp",
                  price:
                    protect?.id === p.id && protect.kind === "tp"
                      ? protect.price
                      : p.tp,
                },
              ]
                .filter((l) => l.price !== undefined)
                .map((l) => {
                  const price =
                    protect?.id === p.id && protect.kind === l.kind
                      ? protect.price
                      : l.price!;
                  const yy = y(price);
                  return (
                    <g key={p.id + l.kind}>
                      {l.kind !== "entry" && (
                        <line
                          data-position={p.id}
                          data-kind={l.kind}
                          x1={0}
                          x2={dims.w - 70}
                          y1={yy}
                          y2={yy}
                          stroke="transparent"
                          strokeWidth={14}
                          style={{
                            pointerEvents: "stroke",
                            cursor: "ns-resize",
                          }}
                        />
                      )}
                      <line
                        x1={0}
                        x2={dims.w - 70}
                        y1={yy}
                        y2={yy}
                        stroke={
                          l.kind === "sl"
                            ? tradeColors.sl
                            : l.kind === "tp"
                              ? tradeColors.tp
                              : tradeColors.buy
                        }
                        strokeDasharray="5 5"
                        data-position={l.kind === "entry" ? undefined : p.id}
                        data-kind={l.kind}
                        style={{
                          pointerEvents: l.kind === "entry" ? "none" : "stroke",
                          cursor: "ns-resize",
                        }}
                        strokeWidth={
                          protect?.id === p.id && protect.kind === l.kind
                            ? 3
                            : 1
                        }
                      />
                      <text
                        x={dims.w - 330}
                        y={yy - 5}
                        fill={
                          l.kind === "sl"
                            ? tradeColors.sl
                            : l.kind === "tp"
                              ? tradeColors.tp
                              : tradeColors.buy
                        }
                        fontSize="10"
                      >
                        {l.kind.toUpperCase()}{" "}
                        {price.toFixed(s.broker.specs.precision)} · {p.lots} ·{" "}
                        {l.kind !== "entry"
                          ? `${s.broker.specs.currency ?? "USD"} ${pnl(p.side, p.entry, price, p.lots, s.broker.specs.contract).toFixed(2)}`
                          : p.side}
                      </text>
                    </g>
                  );
                }),
            )}
          {!secondary &&
            appearance.graphOrders &&
            orderDraft &&
            protectionHandles(
              "draft",
              "draft",
              visibleDraft!.entry,
              visibleDraft!.side,
              orderDraft.sl,
              orderDraft.tp,
              Math.max(30, dims.w - 275),
            )}
          {!secondary &&
            s.broker.pending.map((p, index) =>
              protectionHandles(
                "pending",
                p.id,
                p.price!,
                p.side,
                p.sl,
                p.tp,
                Math.max(8, dims.w - 280 - (index % 4) * 210),
              ),
            )}
          {!secondary &&
            s.broker.positions.map((p) =>
              protectionHandles(
                "position",
                p.id,
                p.entry,
                p.side,
                p.sl,
                p.tp,
                dims.w - 330,
              ),
            )}
        </g>
        {snapPoint && (
          <circle
            cx={x(snapPoint.time)}
            cy={y(snapPoint.price)}
            r={5}
            fill="none"
            stroke={palette.accent}
            style={{ pointerEvents: "none" }}
          />
        )}
      </svg>
      {!bars.length && (
        <div className="chart-empty">
          No visible tick history at this replay point.
        </div>
      )}
      <div className="chart-foot">
        {secondary ? "Higher timeframe" : "Data through replay point"}{" "}
        <span
          title={
            s.layout.blind || !bars.length
              ? "Past history with explicit data gaps"
              : `Loaded from ${candleLabel(bars[0].time, timeframe, s.layout.timezone, false)}. Gaps are marked; incomplete candles are omitted. Tick-label spacing follows zoom; each candle represents ${timeframe}.`
          }
        >
          {bars.length} candles ·{" "}
          {bars.filter((b, i) => i > 0 && b.gapBefore).length} gaps ·{" "}
          {s.layout.timezone}
        </span>
      </div>
    </div>
  );
});
