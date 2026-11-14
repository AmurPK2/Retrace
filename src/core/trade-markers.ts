import type { Session } from "../types";
import { sessionTrades } from "./trade-evidence";

export function tradeMarkers(s: Session) {
  const entries = sessionTrades(s).map(t => ({
    id: `${t.id}:entry`, tradeId: t.id, kind: "entry" as const, side: t.side,
    time: t.opened / 1000, price: t.entry, lots: t.lots,
    label: `${t.side.toUpperCase()} entry · ${t.lots.toFixed(2)} @ ${t.entry.toFixed(s.broker.specs.precision)}`,
  }));
  const exits = s.broker.fills.filter(f => f.opened <= s.tick.t && f.closed <= s.tick.t).map(f => ({
    id: f.id, tradeId: f.positionId, kind: "exit" as const,
    side: f.side === "buy" ? "sell" as const : "buy" as const,
    time: f.closed / 1000, price: f.exit, lots: f.lots,
    label: `${f.reason} exit · ${f.lots.toFixed(2)} @ ${f.exit.toFixed(s.broker.specs.precision)}`,
  }));
  const links = s.broker.fills.filter(f => f.opened <= s.tick.t && f.closed <= s.tick.t).map(f => ({
    id: f.id, from: { time: f.opened / 1000, price: f.entry }, to: { time: f.closed / 1000, price: f.exit }, side: f.side,
  }));
  return { arrows: [...entries, ...exits], links };
}
