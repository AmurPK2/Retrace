import Decimal from "decimal.js";
import { resolveLevelDraft } from "./order-draft";
const randomUUID = () => globalThis.crypto.randomUUID();
import {
  DEFAULT_SPECS,
  type BrokerState,
  type Tick,
  type Order,
  type Position,
  type Specs,
} from "../types";
const D = (v: Decimal.Value) => new Decimal(v);
export const cash = (n: Decimal.Value) =>
  D(n).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
export function pnl(
  side: "buy" | "sell",
  entry: number,
  exit: number,
  lots: number,
  contract: number,
) {
  return D(side === "buy" ? exit : entry)
    .minus(side === "buy" ? entry : exit)
    .times(lots)
    .times(contract)
    .toNumber();
}
export function margin(entry: number, lots: number, specs: Specs) {
  return D(entry)
    .times(lots)
    .times(specs.contract)
    .div(specs.leverage)
    .toNumber();
}
export function initialBroker(specs: Specs = DEFAULT_SPECS): BrokerState {
  return {
    balance: 500,
    positions: [],
    pending: [],
    fills: [],
    events: [],
    seq: 0,
    peak: 500,
    maxDrawdown: 0,
    lastSwapDay: "",
    specs: { ...specs },
  };
}
export function account(s: BrokerState, q: Tick) {
  let floating = D(0),
    used = D(0),
    reserved = D(0);
  for (const p of s.positions) {
    floating = floating
      .plus(
        cash(
          pnl(
            p.side,
            p.entry,
            p.side === "buy" ? q.bid : q.ask,
            p.lots,
            s.specs.contract,
          ),
        ),
      )
      .minus(p.swap);
    used = used.plus(margin(p.entry, p.lots, s.specs));
  }
  for (const p of s.pending)
    reserved = reserved.plus(margin(p.price!, p.lots, s.specs));
  const equity = D(s.balance).plus(floating);
  return {
    balance: s.balance,
    equity: cash(equity),
    floating: cash(floating),
    usedMargin: cash(used),
    reservedMargin: cash(reserved),
    freeMargin: cash(equity.minus(used).minus(reserved)),
    marginLevel: used.gt(0) ? equity.div(used).times(100).toNumber() : null,
  };
}
export function sizeForRisk(risk: number, entry: number, sl: number, s: Specs) {
  const cost = D(entry)
    .minus(sl)
    .abs()
    .plus(D(s.slippage).times(2))
    .times(s.contract)
    .plus(D(s.commission).times(2));
  if (!cost.gt(0) || risk <= 0) return 0;
  const lots = D(risk).div(cost).div(s.lotStep).floor().times(s.lotStep);
  return lots.gte(s.minLot) ? lots.toNumber() : 0;
}
function lotCheck(n: number, s: Specs) {
  if (!Number.isFinite(n) || n < s.minLot || !D(n).div(s.lotStep).isInteger())
    throw Error(
      `Volume must be at least ${s.minLot} in steps of ${s.lotStep}.`,
    );
}
function protect(
  side: "buy" | "sell",
  entry: number,
  sl?: number,
  tp?: number,
) {
  if (
    sl !== undefined &&
    (!Number.isFinite(sl) ||
      sl <= 0 ||
      (side === "buy" ? sl >= entry : sl <= entry))
  )
    throw Error("SL must be on the loss side of entry.");
  if (
    tp !== undefined &&
    (!Number.isFinite(tp) ||
      tp <= 0 ||
      (side === "buy" ? tp <= entry : tp >= entry))
  )
    throw Error("TP must be on the profit side of entry.");
}
function log(s: BrokerState, t: number, message: string) {
  s.events.push({ t, message });
  if (s.events.length > 500) s.events.shift();
}
export function place(
  s: BrokerState,
  q: Tick,
  input: Omit<Order, "id" | "at" | "seq">,
) {
  if (input.automaticLevel) {
    const level = resolveLevelDraft({ ...input, entry: input.price! }, q.bid);
    input = {
      ...input,
      side: level.side,
      kind: "limit",
      sl: level.sl,
      tp: level.tp,
    };
  }
  lotCheck(input.lots, s.specs);
  if (
    !["buy", "sell"].includes(input.side) ||
    !["market", "limit", "stop"].includes(input.kind)
  )
    throw Error("Unknown order type.");
  const current = input.side === "buy" ? q.ask : q.bid;
  const price = input.kind === "market" ? current : input.price!;
  if (!Number.isFinite(price) || price <= 0)
    throw Error("Enter a valid entry price.");
  protect(input.side, price, input.sl, input.tp);
  if (
    input.kind === "limit" &&
    (input.side === "buy" ? price >= q.ask : price <= q.bid)
  )
    throw Error("Buy Limits must be below ask; Sell Limits must be above bid.");
  if (
    input.kind === "stop" &&
    (input.side === "buy" ? price <= q.ask : price >= q.bid)
  )
    throw Error("Buy Stops must be above ask; Sell Stops must be below bid.");
  const need =
    margin(price, input.lots, s.specs) + input.lots * s.specs.commission;
  if (need > account(s, q).freeMargin)
    throw Error(
      "Insufficient free margin; pending orders also reserve margin.",
    );
  const order: Order = { ...input, id: randomUUID(), at: q.t, seq: s.seq };
  if (order.kind === "market") open(s, q, order);
  else {
    s.pending.push(order);
    log(s, q.t, `${order.side} ${order.kind} ${order.lots} @ ${price}`);
  }
  updateDrawdown(s, q);
  return order.id;
}
function open(s: BrokerState, q: Tick, o: Order) {
  const slip = s.specs.slippage;
  let entry = D(o.side === "buy" ? q.ask : q.bid)
    .plus(o.side === "buy" ? slip : -slip)
    .toNumber();
  if (o.kind === "limit")
    entry =
      o.side === "buy" ? Math.min(entry, o.price!) : Math.max(entry, o.price!);
  const fee = cash(D(o.lots).times(s.specs.commission));
  if (margin(entry, o.lots, s.specs) + fee > account(s, q).freeMargin) {
    log(s, q.t, "Order rejected at trigger: insufficient margin.");
    return;
  }
  const risk =
    o.sl === undefined
      ? null
      : cash(
          D(entry)
            .minus(o.sl)
            .abs()
            .plus(s.specs.slippage)
            .times(o.lots)
            .times(s.specs.contract)
            .plus(fee)
            .plus(D(o.lots).times(s.specs.commission)),
        );
  s.balance = cash(D(s.balance).minus(fee));
  s.positions.push({
    ...o,
    entry,
    opened: q.t,
    initialLots: o.lots,
    initialRisk: risk,
    initialSl: o.sl,
    initialTp: o.tp,
    changes: [{ t: q.t, sl: o.sl, tp: o.tp }],
    entryFee: fee,
    swap: 0,
  });
  log(s, q.t, `Filled ${o.side} ${o.lots} @ ${entry}`);
}
export function close(
  s: BrokerState,
  q: Tick,
  id: string,
  lots?: number,
  reason = "Manual",
) {
  const p = s.positions.find((x) => x.id === id);
  if (!p) throw Error("Position not found.");
  const amount = lots ?? p.lots;
  lotCheck(amount, s.specs);
  if (amount > p.lots) throw Error("Cannot close more than the open volume.");
  const remaining = D(p.lots).minus(amount).toNumber();
  if (remaining > 0) lotCheck(remaining, s.specs);
  const ratio = D(amount).div(p.lots);
  const exit = D(p.side === "buy" ? q.bid : q.ask)
    .plus(p.side === "buy" ? -s.specs.slippage : s.specs.slippage)
    .toNumber();
  const gross = cash(pnl(p.side, p.entry, exit, amount, s.specs.contract));
  const entryFee = cash(D(p.entryFee).times(ratio));
  const exitFee = cash(D(amount).times(s.specs.commission));
  const swap = cash(D(p.swap).times(ratio));
  const fees = cash(D(entryFee).plus(exitFee));
  const net = cash(D(gross).minus(fees).minus(swap));
  const risk =
    p.initialRisk === null
      ? null
      : D(p.initialRisk).times(amount).div(p.initialLots).toNumber();
  s.balance = cash(D(s.balance).plus(gross).minus(exitFee).minus(swap));
  s.fills.push({
    id: p.id + ":close:" + s.seq + ":" + s.fills.length,
    positionId: p.id,
    side: p.side,
    entry: p.entry,
    exit,
    lots: amount,
    opened: p.opened,
    closed: q.t,
    gross,
    fees,
    swap,
    net,
    r: risk !== null && risk > 0 ? D(net).div(risk).toNumber() : null,
    initialRisk: risk,
    reason,
    thesis: p.thesis,
    tags: p.tags,
    strategy: p.strategy,
    screenshot: p.screenshot,
    initialSl: p.initialSl,
    initialTp: p.initialTp,
    changes: structuredClone(p.changes ?? []),
  });
  p.lots = remaining;
  p.entryFee = cash(D(p.entryFee).minus(entryFee));
  p.swap = cash(D(p.swap).minus(swap));
  if (!remaining) s.positions = s.positions.filter((x) => x.id !== id);
  log(s, q.t, `${reason}: ${p.side} ${amount}, netto $${net.toFixed(2)}`);
  updateDrawdown(s, q);
}
export function editPosition(
  s: BrokerState,
  q: Tick,
  id: string,
  sl?: number,
  tp?: number,
) {
  const p = s.positions.find((x) => x.id === id);
  if (!p) throw Error("Position not found.");
  const mark = p.side === "buy" ? q.bid : q.ask;
  if (
    sl !== undefined &&
    (sl <= 0 ||
      !Number.isFinite(sl) ||
      (p.side === "buy" ? sl >= mark : sl <= mark))
  )
    throw Error("SL cannot be placed at or beyond the current exit price.");
  if (
    tp !== undefined &&
    (tp <= 0 ||
      !Number.isFinite(tp) ||
      (p.side === "buy" ? tp <= mark : tp >= mark))
  )
    throw Error("TP cannot be placed at or beyond the current exit price.");
  p.sl = sl;
  p.tp = tp;
  (p.changes ??= []).push({ t: q.t, sl, tp });
  log(
    s,
    q.t,
    `SL/TP updated: ${id.slice(0, 8)} · SL ${sl ?? "none"}, TP ${tp ?? "none"} (opprinnelig R beholdt)`,
  );
}
export function editPending(
  s: BrokerState,
  q: Tick,
  id: string,
  changes: Partial<Order>,
) {
  const old = s.pending.find((p) => p.id === id);
  if (!old) throw Error("Order not found.");
  const index = s.pending.indexOf(old);
  s.pending.splice(index, 1);
  try {
    place(s, q, { ...old, ...changes, kind: old.kind, side: old.side });
  } catch (error) {
    s.pending.splice(index, 0, old);
    throw error;
  }
  log(s, q.t, `Pending order replaced: ${id.slice(0, 8)}`);
}
export function processTick(s: BrokerState, q: Tick) {
  s.seq++;
  const day = new Date(q.t).toISOString().slice(0, 10);
  if (s.lastSwapDay && s.lastSwapDay !== day) {
    for (const p of s.positions) {
      const from = Math.max(
        Date.parse(s.lastSwapDay),
        Math.floor(p.opened / 86400000) * 86400000,
      );
      const days = Math.max(0, Math.round((Date.parse(day) - from) / 86400000));
      p.swap = cash(
        D(p.swap).plus(
          D(p.lots)
            .times(p.side === "buy" ? s.specs.swapLong : s.specs.swapShort)
            .times(days),
        ),
      );
    }
  }
  s.lastSwapDay = day;
  const check = () => {
    for (const p of [...s.positions]) {
      const price = p.side === "buy" ? q.bid : q.ask;
      if (
        p.sl !== undefined &&
        (p.side === "buy" ? price <= p.sl : price >= p.sl)
      )
        close(s, q, p.id, undefined, "SL");
      else if (
        p.tp !== undefined &&
        (p.side === "buy" ? price >= p.tp : price <= p.tp)
      )
        close(s, q, p.id, undefined, "TP");
    }
  };
  check();
  for (const o of [...s.pending]) {
    if (o.seq >= s.seq) continue;
    const quote = o.side === "buy" ? q.ask : q.bid;
    const triggered =
      o.kind === "limit"
        ? o.side === "buy"
          ? quote <= o.price!
          : quote >= o.price!
        : o.side === "buy"
          ? quote >= o.price!
          : quote <= o.price!;
    if (triggered) {
      s.pending = s.pending.filter((x) => x.id !== o.id);
      open(s, q, o);
    }
  }
  check();
  let a = account(s, q);
  while (
    s.positions.length &&
    a.marginLevel !== null &&
    a.marginLevel <= s.specs.stopOut
  ) {
    const worst = [...s.positions].sort(
      (x, y) =>
        pnl(
          x.side,
          x.entry,
          x.side === "buy" ? q.bid : q.ask,
          x.lots,
          s.specs.contract,
        ) -
        pnl(
          y.side,
          y.entry,
          y.side === "buy" ? q.bid : q.ask,
          y.lots,
          s.specs.contract,
        ),
    )[0];
    close(s, q, worst.id, undefined, "Stop-out");
    a = account(s, q);
  }
  if (a.equity > s.peak) s.peak = a.equity;
  s.maxDrawdown = Math.max(s.maxDrawdown, cash(s.peak - a.equity));
}
export function statistics(fills: BrokerState["fills"]) {
  const nets = fills.map((x) => x.net),
    wins = nets.filter((x) => x > 0),
    losses = nets.filter((x) => x < 0);
  const sum = (a: number[]) => cash(a.reduce((s, n) => s + n, 0));
  const rs = fills.flatMap((x) => (x.r === null ? [] : [x.r]));
  return {
    count: fills.length,
    net: sum(nets),
    winRate: fills.length ? wins.length / fills.length : null,
    meanR: rs.length ? rs.reduce((s, n) => s + n, 0) / rs.length : null,
    expectancy: fills.length ? sum(nets) / fills.length : null,
    profitFactor: losses.length ? sum(wins) / Math.abs(sum(losses)) : null,
    rCount: rs.length,
  };
}
export function tradeStatistics(
  fills: BrokerState["fills"],
  openIds: string[] = [],
) {
  const grouped = new Map<string, typeof fills>();
  for (const f of fills) {
    if (openIds.includes(f.positionId)) continue;
    grouped.set(f.positionId, [...(grouped.get(f.positionId) ?? []), f]);
  }
  const trades = [...grouped.values()].map((rows) => {
    const net = cash(rows.reduce((n, f) => n + f.net, 0)),
      risk = rows.every((f) => f.initialRisk !== null)
        ? cash(rows.reduce((n, f) => n + f.initialRisk!, 0))
        : null;
    return { net, r: risk ? net / risk : null };
  });
  const gains = trades.filter((t) => t.net > 0).reduce((n, t) => n + t.net, 0),
    losses = trades.filter((t) => t.net < 0).reduce((n, t) => n - t.net, 0),
    rs = trades.filter((t) => t.r !== null);
  return {
    ...statistics(fills),
    tradeCount: trades.length,
    winRate: trades.length
      ? trades.filter((t) => t.net > 0).length / trades.length
      : null,
    meanR: rs.length ? rs.reduce((n, t) => n + t.r!, 0) / rs.length : null,
    expectancy: trades.length
      ? cash(trades.reduce((n, t) => n + t.net, 0)) / trades.length
      : null,
    profitFactor: losses > 0 ? gains / losses : null,
  };
}
function updateDrawdown(s: BrokerState, q: Tick) {
  const equity = account(s, q).equity;
  s.peak = Math.max(s.peak, equity);
  s.maxDrawdown = Math.max(s.maxDrawdown, cash(s.peak - equity));
}
