import test from "node:test";
import assert from "node:assert/strict";
import { discordSettings, discordActivity, tradesTaken, completedWins } from "../src/core/discord-presence";
import { DiscordPresence, type DiscordTransport } from "../electron/discord";
import type { Session } from "../src/types";
const session = () => ({ tick: { t: 9000 }, broker: {
  balance: 512.4, positions: [{ id: "a", opened: 1000 }],
  fills: [{ id: "a-1", positionId: "a", opened: 1000, closed: 2000, net: 1 }, { id: "b-1", positionId: "b", opened: 3000, closed: 4000, net: 3 }, { id: "b-2", positionId: "b", opened: 3000, closed: 5000, net: -1 }, { id: "f-1", positionId: "future", opened: 10000, closed: 12000, net: 10 }],
  pending: [{ id: "pending" }],
} }) as unknown as Session;
test("Discord counts unique actual entries across open, closed and partial exits, excludes pending and future", () => {
  assert.equal(tradesTaken(session()), 2);
  assert.equal(discordActivity(session(), 123456, "retrace").details, "Balance: $512.40");
  assert.equal(discordActivity(session(), 123456, "retrace").state, "Wins: 1");
  assert.equal("timestamps" in discordActivity(session(), 123456, "retrace"), false);
  assert.equal("timestamps" in discordActivity({ ...session(), tick: { t: 123456789, bid: 1, ask: 2 } }, 123456, "retrace"), false);
});
test("Discord settings accept only an actual-shaped ID and bounded image asset key", () => {
  assert.throws(() => discordSettings({ enabled: true, applicationId: "made-up" }));
  assert.throws(() => discordSettings({ imageKey: "https://untrusted.example/image" }));
  assert.equal(discordSettings({ enabled: true }).applicationId, "");
});
test("Discord adapter throttles ticks, restores session numbers, reconnects, clears only own activity, and closes", async () => {
  let now = 100000, connectCount = 0, closes = 0, lost = () => {};
  const sent: any[] = [];
  const factory = (): DiscordTransport => ({ async connect(_id, callback) { connectCount++; lost = callback; }, async activity(value) { sent.push(value); }, close() { closes++; } });
  const controller = new DiscordPresence(() => {}, 10000, factory, () => now);
  const settings = { enabled: true, applicationId: "123456789012345678", imageKey: "retrace" };
  const settle = async () => { await new Promise(r => setImmediate(r)); await controller.flush(); };
  try {
    controller.update(settings, session()); await settle();
    assert.equal(sent.length, 1); assert.equal(controller.status.state, "connected");
    for (let i = 0; i < 100; i++) controller.update(settings, session());
    await settle(); assert.equal(sent.length, 1);
    const changed = session(); changed.broker.balance = 499.33;
    controller.update(settings, changed); await settle(); assert.equal(sent.length, 1);
    now += 15000; await controller.flush(); assert.match(sent.at(-1).details, /499\.33/);
    const newSession = session(); newSession.broker.fills = []; newSession.broker.positions = []; newSession.broker.balance = 500;
    now += 15000; controller.update(settings, newSession); await settle();
    assert.equal(sent.at(-1).details, "Balance: $500.00"); assert.equal(sent.at(-1).state, "Wins: 0");
    assert.equal("timestamps" in sent.at(-1), false);
    lost(); assert.equal(controller.status.state, "waiting");
    now += 15000; await controller.flush(); assert.equal(connectCount, 2);
    controller.update({ ...settings, enabled: false }, session()); await settle();
    assert.equal(sent.at(-1), null); assert.equal(controller.status.state, "off");
    controller.update(settings, session()); await settle();
    await controller.shutdown(); assert.equal(sent.at(-1), null); assert.ok(closes >= 3);
    const count = sent.length; await controller.flush(); assert.equal(sent.length, count);
  } finally { await controller.shutdown(); }
});
test("Discord unavailable and missing configuration do not prevent replay or save and retry is bounded", async () => {
  let attempts = 0, now = 100000;
  const controller = new DiscordPresence(() => {}, now, () => ({ async connect() { attempts++; throw Error("Discord absent"); }, async activity() {}, close() {} }), () => now);
  try {
    controller.update({ enabled: true, applicationId: "", imageKey: "" }, null);
    await new Promise(r => setImmediate(r)); assert.equal(attempts, 0); assert.equal(controller.status.state, "setup");
    controller.update({ enabled: true, applicationId: "123456789012345678", imageKey: "" }, session());
    await new Promise(r => setImmediate(r)); assert.equal(attempts, 1); assert.equal(controller.status.state, "waiting");
    await controller.flush(); assert.equal(attempts, 1);
    now += 15000; await controller.flush(); assert.equal(attempts, 2);
  } finally { await controller.shutdown(); }
});

test("Discord project button links only to the owner's real RETRACE repository", () => {
  assert.deepEqual(discordActivity(session(), 123456, "retrace").buttons, [{ label: "Check out the project", url: "https://github.com/AmurPK2/Retrace" }]);
});

test("Wins count completed profitable entries after all partial exits, without duplicates, future outcomes or break-even", () => {
  const s = session();
  assert.equal(completedWins(s), 1);
  const base = { side: "buy", entry: 2000, exit: 2001, lots: .01, gross: 1, fees: 0, swap: 0, r: 1, initialRisk: 1, thesis: "", tags: [], strategy: "test", reason: "test", opened: 1000, closed: 2000 } as const;
  s.broker.fills.push({ ...base, id: "zero", positionId: "zero", net: 0 } as any, { ...base, id: "loss", positionId: "loss", net: -4 } as any);
  s.broker.fills.push(s.broker.fills[1]);
  assert.equal(completedWins(s), 1);
  s.broker.positions = [];
  assert.equal(completedWins(s), 2);
  const payload = discordActivity(s, 123, "retrace_milestone");
  assert.deepEqual(Object.keys(payload).sort(), ["assets", "buttons", "details", "instance", "state"]);
  assert.doesNotMatch(JSON.stringify(payload), /Paper trading|Trades taken|timestamps|XAUUSD/);
});
