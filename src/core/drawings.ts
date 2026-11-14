import type { Drawing } from "../types";
type Point = Drawing["a"];
export function planLevels(d: Drawing) {
  return {
    entry: d.a.price,
    sl: d.b.price,
    tp: d.target ?? d.a.price + (d.a.price - d.b.price) * 2,
  };
}
export function drawingHandles(d: Drawing) {
  if (d.kind === "horizontal") return [{ key: "a", point: d.a }];
  if (d.kind === "zone") {
    const left = Math.min(d.a.time, d.b.time),
      right = Math.max(d.a.time, d.b.time),
      top = Math.max(d.a.price, d.b.price),
      bottom = Math.min(d.a.price, d.b.price),
      midT = (left + right) / 2,
      midP = (top + bottom) / 2;
    return [
      { key: "nw", point: { time: left, price: top } },
      { key: "ne", point: { time: right, price: top } },
      { key: "se", point: { time: right, price: bottom } },
      { key: "sw", point: { time: left, price: bottom } },
      { key: "n", point: { time: midT, price: top } },
      { key: "e", point: { time: right, price: midP } },
      { key: "s", point: { time: midT, price: bottom } },
      { key: "w", point: { time: left, price: midP } },
    ];
  }
  if (d.kind === "long" || d.kind === "short")
    return [
      { key: "a", point: d.a },
      { key: "b", point: { time: d.a.time, price: d.b.price } },
      { key: "tp", point: { time: d.a.time, price: planLevels(d).tp } },
      { key: "width", point: { time: d.b.time, price: d.a.price } },
      {
        key: "left",
        point: { time: d.a.time, price: (d.a.price + planLevels(d).tp) / 2 },
      },
    ];
  const out = [
    { key: "a", point: d.a },
    { key: "b", point: d.b },
  ];
  return out;
}
export function drawingScreenHandles(
  d: Drawing,
  x: (time: number) => number,
  y: (price: number) => number,
) {
  if (d.kind !== "zone")
    return drawingHandles(d).map(({ key, point }) => ({
      key,
      x: x(point.time),
      y: y(point.price),
    }));
  // Edge grips belong halfway along the visible edge, including across market
  // closures. A midpoint in wall-clock time is not a midpoint on this chart.
  const left = Math.min(x(d.a.time), x(d.b.time)),
    right = Math.max(x(d.a.time), x(d.b.time)),
    top = Math.min(y(d.a.price), y(d.b.price)),
    bottom = Math.max(y(d.a.price), y(d.b.price)),
    midX = (left + right) / 2,
    midY = (top + bottom) / 2;
  return [
    { key: "nw", x: left, y: top },
    { key: "ne", x: right, y: top },
    { key: "se", x: right, y: bottom },
    { key: "sw", x: left, y: bottom },
    { key: "n", x: midX, y: top },
    { key: "e", x: right, y: midY },
    { key: "s", x: midX, y: bottom },
    { key: "w", x: left, y: midY },
  ];
}
export function moveDrawing(
  d: Drawing,
  point: Point,
  start: Point,
  handle?: string,
): Drawing {
  const plan = d.kind === "long" || d.kind === "short",
    target = plan ? planLevels(d).tp : d.target;
  if (
    d.kind === "zone" &&
    handle &&
    ["nw", "ne", "se", "sw", "n", "e", "s", "w"].includes(handle)
  ) {
    let left = Math.min(d.a.time, d.b.time),
      right = Math.max(d.a.time, d.b.time),
      top = Math.max(d.a.price, d.b.price),
      bottom = Math.min(d.a.price, d.b.price);
    if (handle.includes("w")) left = point.time;
    if (handle.includes("e")) right = point.time;
    if (handle.includes("n")) top = point.price;
    if (handle.includes("s")) bottom = point.price;
    return {
      ...d,
      a: { time: left, price: top },
      b: { time: right, price: bottom },
    };
  }
  if (plan && handle === "width")
    return { ...d, b: { ...d.b, time: point.time }, target };
  if (plan && handle === "left")
    return { ...d, a: { ...d.a, time: point.time }, target };
  if (plan && handle === "a")
    return { ...d, a: { ...d.a, price: point.price }, target };
  if (plan && handle === "b")
    return { ...d, b: { ...d.b, price: point.price }, target };
  if (handle === "tp") return { ...d, target: point.price };
  if (handle === "a")
    return d.kind === "horizontal"
      ? { ...d, a: point, b: point }
      : { ...d, a: point, target };
  if (handle === "b") return { ...d, b: point, target };
  const dt = point.time - start.time,
    dp = point.price - start.price;
  return {
    ...d,
    a: { time: d.a.time + dt, price: d.a.price + dp },
    b: { time: d.b.time + dt, price: d.b.price + dp },
    ...(target !== undefined ? { target: target + dp } : {}),
  };
}
export function finishDrawing(d: Drawing, point: Point): Drawing {
  if (d.kind === "horizontal") return { ...d, a: point, b: point };
  const b = {
    ...point,
    price:
      d.kind === "long"
        ? d.a.price - Math.abs(point.price - d.a.price)
        : d.kind === "short"
          ? d.a.price + Math.abs(point.price - d.a.price)
          : point.price,
  };
  return {
    ...d,
    b,
    ...(d.kind === "long" || d.kind === "short"
      ? { target: d.a.price + (d.a.price - b.price) * 2 }
      : {}),
  };
}
export function clipRay(
  a: { x: number; y: number },
  b: { x: number; y: number },
  bounds: { left: number; right: number; top: number; bottom: number },
) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  if (
    ![a.x, a.y, b.x, b.y].every(Number.isFinite) ||
    Math.hypot(dx, dy) < 0.001
  )
    return null;
  let from = 0,
    to = Infinity;
  for (const [origin, direction, min, max] of [
    [a.x, dx, bounds.left, bounds.right],
    [a.y, dy, bounds.top, bounds.bottom],
  ]) {
    if (Math.abs(direction) < 1e-9) {
      if (origin < min || origin > max) return null;
      continue;
    }
    const t1 = (min - origin) / direction,
      t2 = (max - origin) / direction;
    from = Math.max(from, Math.min(t1, t2));
    to = Math.min(to, Math.max(t1, t2));
  }
  return to < from || to < 0
    ? null
    : {
        x1: a.x + dx * from,
        y1: a.y + dy * from,
        x2: a.x + dx * to,
        y2: a.y + dy * to,
      };
}

// Choose the nearest screen axis: seconds and prices are different units, and
// time may be compressed across market closures. Keep the opposite anchor exact.
export function constrainLinePoint(
  d: Drawing,
  point: Point,
  shift: boolean,
  x: (time: number) => number,
  y: (price: number) => number,
  handle?: string,
): Point {
  if (
    !shift ||
    !["trend", "ray"].includes(d.kind) ||
    (handle !== "a" && handle !== "b")
  )
    return point;
  const anchor = handle === "a" ? d.b : d.a;
  const dx = Math.abs(x(point.time) - x(anchor.time));
  const dy = Math.abs(y(point.price) - y(anchor.price));
  if (![dx, dy].every(Number.isFinite)) return point;
  return dx >= dy
    ? { ...point, price: anchor.price }
    : { ...point, time: anchor.time };
}
