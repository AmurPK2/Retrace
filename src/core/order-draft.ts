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
  return {
    ...d,
    entry: price,
    side,
    kind: d.autoSide ? "limit" : d.kind,
    // Protection is an absolute price, never an attached offset.
    sl: d.sl,
    tp: d.tp,
  };
}
export function resolveLevelDraft(d: OrderDraft, bid: number): OrderDraft {
  const side = limitSide(d.entry, bid);
  // Direction changes must keep the selected absolute protection prices.
  return side === d.side
    ? { ...d, side, kind: "limit", autoSide: true }
    : moveDraftEntry({ ...d, autoSide: true }, d.entry, bid);
}
export function levelLabel(side: "buy" | "sell") {
  return side === "buy" ? "Buy level" : "Sell level";
}
