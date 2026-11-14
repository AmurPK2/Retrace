export function limitSide(price: number, bid: number): "buy" | "sell" {
  if (
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isFinite(bid) ||
    bid <= 0
  )
    throw Error("Invalid draft price.");
  return price > bid ? "sell" : "buy";
}
export type OrderDraft = {
  side: "buy" | "sell";
  kind: "market" | "limit" | "stop";
  entry: number;
  sl?: number;
  tp?: number;
  lots: number;
  autoSide?: boolean;
};
export function moveDraftEntry(
  d: OrderDraft,
  price: number,
  bid: number,
): OrderDraft {
  const side = d.autoSide ? limitSide(price, bid) : d.side;
  const sign = side === "buy" ? 1 : -1;
  return {
    ...d,
    entry: price,
    side,
    kind: d.autoSide ? "limit" : d.kind,
    sl:
      d.sl === undefined ? undefined : price - sign * Math.abs(d.entry - d.sl),
    tp:
      d.tp === undefined ? undefined : price + sign * Math.abs(d.tp - d.entry),
  };
}
export function resolveLevelDraft(d: OrderDraft, bid: number): OrderDraft {
  const side = limitSide(d.entry, bid);
  // Preserve deliberate SL/TP edits on the same side. Only flip attached
  // distances when the automatically determined direction actually changes.
  return side === d.side
    ? { ...d, side, kind: "limit", autoSide: true }
    : moveDraftEntry({ ...d, autoSide: true }, d.entry, bid);
}
export function levelLabel(side: "buy" | "sell") {
  return side === "buy" ? "Buy level" : "Sell level";
}
