import { FRAMES, type Bar, type ChartRange, type TF } from "../types";

// One slot per real candle. Missing prices and market breaks are marked by a
// separator; they never create dummy candles or change replay eligibility.
export function chartTimeline(bars: Bar[], _tf: TF): Bar[] {
  return bars;
}
export function chartBreaks(bars: Bar[], tf: TF) {
  return bars.flatMap((bar, i) => {
    const previous = bars[i - 1];
    if (!previous || (!bar.gapBefore && bar.time - previous.time <= FRAMES[tf]))
      return [];
    return [
      {
        before: previous.time,
        after: bar.time,
        from: bar.gapBefore?.from ?? (previous.time + FRAMES[tf]) * 1000,
        to: bar.gapBefore?.to ?? bar.time * 1000,
        missing: !!bar.gapBefore,
      },
    ];
  });
}
export function timeAtLogical(times: number[], logical: number, step: number) {
  if (!times.length) return 0;
  const i = Math.floor(logical);
  if (i < 0) return times[0] + logical * step;
  if (i >= times.length - 1)
    return times.at(-1)! + (logical - times.length + 1) * step;
  return times[i] + (logical - i) * (times[i + 1] - times[i]);
}
export function logicalAtTime(times: number[], time: number, step: number) {
  if (!times.length) return 0;
  if (time < times[0]) return (time - times[0]) / step;
  if (time >= times.at(-1)!)
    return times.length - 1 + (time - times.at(-1)!) / step;
  let lo = 0,
    hi = times.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (times[mid] < time) lo = mid + 1;
    else hi = mid;
  }
  if (times[lo] === time) return lo;
  return lo - 1 + (time - times[lo - 1]) / (times[lo] - times[lo - 1]);
}
// Capture the candle count as well as timestamps. A wall-clock span must not
// become thousands of compressed candles when selecting a lower timeframe.
export function captureChartRange(
  times: number[],
  step: number,
  timeframe: TF,
  range: { from: number; to: number },
): ChartRange {
  const last = times.length - 1;
  return {
    ...range,
    version: 3,
    timeframe,
    anchor: times[0],
    fromTime: timeAtLogical(times, range.from, step),
    toTime: timeAtLogical(times, range.to, step),
    ...(range.from <= last && range.to >= last
      ? { rightOffset: range.to - last }
      : {}),
  };
}

export function selectTimeframeRange(
  current: TF,
  next: TF,
  visible: ChartRange | undefined,
  saved: Partial<Record<TF, ChartRange>> = {},
) {
  const ranges = { ...saved };
  if (visible) ranges[current] = { ...visible, timeframe: current };
  const cached = ranges[next];
  const source = ranges[current];
  if (cached || !source) return { ranges, range: cached };
  const width = Math.max(4, source.to - source.from);
  if (Number.isFinite(source.fromTime) && Number.isFinite(source.toTime)) {
    // Give history loading a target-frame estimate, rather than requesting
    // the entire higher-timeframe span before the new chart can initialise.
    const center = (source.fromTime! + source.toTime!) / 2;
    const replay = source.toTime! - (source.rightOffset ?? 0) * FRAMES[current];
    return {
      ranges,
      range: {
        ...source,
        fromTime:
          source.rightOffset === undefined
            ? center - (width / 2) * FRAMES[next]
            : replay + (source.rightOffset - width) * FRAMES[next],
        toTime:
          source.rightOffset === undefined
            ? center + (width / 2) * FRAMES[next]
            : replay + source.rightOffset * FRAMES[next],
      },
    };
  }
  return { ranges, range: source };
}

export function initialChartRange(
  times: number[],
  step: number,
  saved?: ChartRange,
  timeframe?: TF,
): ChartRange {
  if (
    saved?.version === 3 &&
    saved.timeframe &&
    timeframe &&
    Number.isFinite(saved.from) &&
    Number.isFinite(saved.to) &&
    saved.to > saved.from
  ) {
    const width = Math.max(4, saved.to - saved.from);
    // Views that included the replay candle continue following it, including
    // when returning to a cached frame after the replay has advanced.
    if (Number.isFinite(saved.rightOffset)) {
      const to = Math.max(0, times.length - 1) + saved.rightOffset!;
      return { from: to - width, to };
    }
    if (
      saved.timeframe !== timeframe &&
      Number.isFinite(saved.fromTime) &&
      Number.isFinite(saved.toTime)
    ) {
      const center = Math.max(
        0,
        Math.min(
          times.length - 1,
          logicalAtTime(times, (saved.fromTime! + saved.toTime!) / 2, step),
        ),
      );
      return { from: center - width / 2, to: center + width / 2 };
    }
  }
  if (
    saved?.version === 3 &&
    Number.isFinite(saved.fromTime) &&
    Number.isFinite(saved.toTime)
  ) {
    const from = logicalAtTime(times, saved.fromTime!, step),
      to = logicalAtTime(times, saved.toTime!, step);
    // Pre-fix saves have no timeframe identity. Repair excessively compressed
    // legacy views once; explicitly zoomed new views are never capped.
    if (
      timeframe &&
      !saved.timeframe &&
      Math.max(saved.to - saved.from, to - from) > 600
    ) {
      const last = Math.max(0, times.length - 1);
      if (from <= last && to >= last) return { from: last - 139, to: last + 8 };
      const center = Math.max(0, Math.min(last, (from + to) / 2));
      return { from: center - 73.5, to: center + 73.5 };
    }
    if (to > from && from < times.length && to > 0)
      return to - from >= 4
        ? { ...saved, from, to }
        : { ...saved, from: (from + to) / 2 - 2, to: (from + to) / 2 + 2 };
  }
  if (
    saved?.version === 3 &&
    Number.isFinite(saved.from) &&
    Number.isFinite(saved.to) &&
    saved.to > saved.from
  ) {
    const shift =
      saved.anchor === undefined ? 0 : logicalAtTime(times, saved.anchor, step);
    return { ...saved, from: saved.from + shift, to: saved.to + shift };
  }
  const last = Math.max(0, times.length - 1);
  return { from: Math.max(-2, last - 139), to: last + 8 };
}
export function axisLabel(
  time: number,
  tf: TF,
  zone: string,
  blind: boolean,
  kind = 3,
) {
  const date = new Date(time * 1000);
  if (blind)
    return tf === "1D"
      ? "Day"
      : new Intl.DateTimeFormat("en-GB", {
          timeZone: zone,
          hour: "2-digit",
          minute: "2-digit",
        }).format(date);
  // Daily buckets are UTC days. Intraday labels use the selected display zone.
  const daily = tf === "1D";
  const options: Intl.DateTimeFormatOptions =
    daily || kind <= 2
      ? kind === 0
        ? { year: "numeric" }
        : kind === 1
          ? { month: "short", year: "2-digit" }
          : { day: "numeric", month: "short" }
      : { hour: "2-digit", minute: "2-digit" };
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: daily ? "UTC" : zone,
    ...options,
  }).format(date);
}
export function candleLabel(
  time: number,
  tf: TF,
  zone: string,
  blind: boolean,
) {
  if (tf === "1D")
    return blind
      ? "Daily candle · UTC"
      : new Intl.DateTimeFormat("en-GB", {
          timeZone: "UTC",
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(time * 1000) + " · daily candle UTC";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    ...(blind ? {} : { day: "2-digit", month: "short" }),
    hour: "2-digit",
    minute: "2-digit",
  }).format(time * 1000);
}
