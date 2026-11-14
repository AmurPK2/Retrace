import test from "node:test";
test("fractional partial-close risk preserves the original denominator without rounding it twice", () => {
  const s = initialBroker();
  place(s, q(2000, 2000.5), order("buy", { sl: 1995.495 }));
  const p = s.positions[0];
  assert.equal(p.initialRisk, 10.01);
  close(s, q(2005.505, 2006), p.id, 0.01);
  close(s, q(2005.505, 2006), p.id, 0.01);
  assert.equal(s.fills[0].initialRisk, 5.005);
  assert.equal(s.fills[1].initialRisk, 5.005);
  assert.equal(s.fills[0].initialRisk! + s.fills[1].initialRisk!, 10.01);
});
import assert from "node:assert/strict";
import {
  initialBroker,
  place,
  close,
  account,
  processTick,
  sizeForRisk,
  editPosition,
  statistics,
} from "../src/core/broker";
const q = (bid: number, ask: number, t = 1700000000000) => ({ bid, ask, t });
const order = (side: "buy" | "sell", extra: any = {}) => ({
  side,
  kind: "market" as const,
  lots: 0.02,
  thesis: "test synthetic only",
  tags: [],
  strategy: "test",
  ...extra,
});
test("long buys ask, marks/closes bid; independently $9.00 gross", () => {
  const s = initialBroker();
  place(s, q(2000, 2000.5), order("buy"));
  assert.equal(s.positions[0].entry, 2000.5);
  assert.equal(account(s, q(2000, 2000.5)).floating, -1);
  close(s, q(2005, 2005.4), s.positions[0].id);
  assert.equal(s.fills[0].gross, 9);
  assert.equal(s.balance, 509);
});
test("short opens bid, marks/closes ask; independently $7.20 gross", () => {
  const s = initialBroker();
  place(s, q(2000, 2000.5), order("sell"));
  close(s, q(1996, 1996.4), s.positions[0].id);
  assert.equal(s.fills[0].gross, 7.2);
  assert.equal(s.balance, 507.2);
});
test("leverage affects margin, not P/L", () => {
  const a = initialBroker(),
    b = initialBroker({ ...a.specs, leverage: 100 });
  place(a, q(2000, 2000.5), order("buy"));
  place(b, q(2000, 2000.5), order("buy"));
  assert.equal(account(a, q(2010, 2010.5)).floating, 19);
  assert.equal(account(b, q(2010, 2010.5)).floating, 19);
  assert.equal(account(a, q(2010, 2010.5)).usedMargin, 8);
  assert.equal(account(b, q(2010, 2010.5)).usedMargin, 40.01);
});
test("buy limit triggers on subsequent ask, not bid; gap gets actual favorable quote", () => {
  const s = initialBroker();
  place(
    s,
    q(2001, 2001.5),
    order("buy", { kind: "limit", price: 2000, sl: 1990, tp: 2010 }),
  );
  assert.equal(s.positions.length, 0);
  processTick(s, q(1999.8, 2000.2));
  assert.equal(s.positions.length, 0);
  processTick(s, q(1998.5, 1999));
  assert.equal(s.positions[0].entry, 1999);
});
test("sell stop triggers bid, buy stop triggers ask", () => {
  const a = initialBroker();
  place(a, q(2000, 2000.5), order("sell", { kind: "stop", price: 1999 }));
  processTick(a, q(1998.5, 1999.2));
  assert.equal(a.positions[0].entry, 1998.5);
  const b = initialBroker();
  place(b, q(2000, 2000.5), order("buy", { kind: "stop", price: 2001 }));
  processTick(b, q(2000.8, 2001.3));
  assert.equal(b.positions[0].entry, 2001.3);
});
test("SL uses first executable gap quote, never unavailable stop level", () => {
  const s = initialBroker();
  place(s, q(2000, 2000.5), order("buy", { sl: 1995, tp: 2010 }));
  processTick(s, q(1990, 1990.6));
  assert.equal(s.fills[0].exit, 1990);
  assert.equal(s.fills[0].net, -21);
});
test("tick order resolves both boundaries within a candle", () => {
  const a = initialBroker(),
    b = initialBroker();
  place(a, q(2000, 2000.5), order("buy", { sl: 1995, tp: 2005 }));
  place(b, q(2000, 2000.5), order("buy", { sl: 1995, tp: 2005 }));
  for (const quote of [q(2005, 2005.5), q(1994, 1994.5)]) processTick(a, quote);
  for (const quote of [q(1994, 1994.5), q(2005, 2005.5)]) processTick(b, quote);
  assert.equal(a.fills[0].reason, "TP");
  assert.equal(a.fills[0].net, 9);
  assert.equal(b.fills[0].reason, "SL");
  assert.equal(b.fills[0].net, -13);
});
test("partial close allocates entry/exit commissions exactly", () => {
  const s = initialBroker();
  s.specs.commission = 3;
  place(s, q(2000, 2000.5), order("buy"));
  assert.equal(s.balance, 499.94);
  const id = s.positions[0].id;
  close(s, q(2010, 2010.5), id, 0.01);
  close(s, q(2010, 2010.5), id, 0.01);
  assert.equal(s.fills[0].gross, 9.5);
  assert.equal(s.fills[0].fees, 0.06);
  assert.equal(s.fills[0].net, 9.44);
  assert.equal(s.balance, 518.88);
  assert.equal(
    s.fills.reduce((v, f) => v + f.net, 0),
    18.88,
  );
});
test("original cash R is unchanged by BE and partial close", () => {
  const s = initialBroker();
  place(s, q(2000, 2000.5), order("buy", { sl: 1995.5 }));
  const p = s.positions[0];
  assert.equal(p.initialRisk, 10);
  editPosition(s, q(2004, 2004.5), p.id, p.entry, 2010);
  assert.equal(p.initialRisk, 10);
  close(s, q(2005.5, 2006), p.id, 0.01);
  assert.equal(s.fills[0].initialRisk, 5);
  assert.equal(s.fills[0].r, 1);
});
test("risk sizing floors, never rounds up minimum lot", () => {
  const s = initialBroker();
  assert.equal(sizeForRisk(10, 2000, 1995, s.specs), 0.02);
  assert.equal(sizeForRisk(2, 2000, 1995, s.specs), 0);
  assert.equal(sizeForRisk(14.99, 2000, 1995, s.specs), 0.02);
  s.specs.commission = 3;
  assert.equal(sizeForRisk(10, 2000, 1995, s.specs), 0.01);
});
test("insufficient margin, lot step and invalid stops reject", () => {
  const s = initialBroker();
  assert.throws(
    () => place(s, q(2000, 2000.5), order("buy", { lots: 2 })),
    /margin/,
  );
  assert.throws(
    () => place(s, q(2000, 2000.5), order("buy", { lots: 0.015 })),
    /steps/,
  );
  assert.throws(
    () => place(s, q(2000, 2000.5), order("buy", { sl: 2010 })),
    /loss side/,
  );
});
test("pending reservations prevent overcommitment", () => {
  const s = initialBroker();
  place(
    s,
    q(2000, 2000.5),
    order("buy", { kind: "limit", price: 1999, lots: 1 }),
  );
  assert.throws(
    () =>
      place(
        s,
        q(2000, 2000.5),
        order("buy", { kind: "limit", price: 1998, lots: 1 }),
      ),
    /margin/,
  );
});
test("stopout liquidates by executable side, swap accrues once", () => {
  const s = initialBroker();
  s.specs.swapLong = 1;
  place(
    s,
    q(2000, 2000.5, Date.UTC(2026, 0, 5, 20)),
    order("buy", { lots: 1 }),
  );
  processTick(s, q(2000, 2000.5, Date.UTC(2026, 0, 5, 21)));
  processTick(s, q(2000, 2000.5, Date.UTC(2026, 0, 6, 1)));
  assert.equal(s.positions[0].swap, 1);
  processTick(s, q(1996, 1996.5, Date.UTC(2026, 0, 6, 2)));
  assert.equal(s.positions.length, 0);
  assert.equal(s.fills[0].reason, "Stop-out");
  assert.equal(s.balance, 49);
});
test("no initial SL means no invented R and empty denominators are null", () => {
  const s = initialBroker();
  place(s, q(2000, 2000.5), order("buy"));
  close(s, q(2001, 2001.5), s.positions[0].id);
  assert.equal(s.fills[0].r, null);
  assert.equal(statistics([]).winRate, null);
  assert.equal(statistics(s.fills).profitFactor, null);
});
