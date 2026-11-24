import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync, backup } from "node:sqlite";
const sourceRoot =
  process.env.RETRACE_SOURCE_ROOT || path.resolve(import.meta.dirname, "..");
const root = process.argv[2] || sourceRoot,
  name = process.argv[3] || "public";
const out = sourceRoot + "/artifacts/timeframes-20261124";
fs.mkdirSync(out, { recursive: true });
if (!process.env.RETRACE_MARKET_FIXTURE)
  throw Error(
    "Set RETRACE_MARKET_FIXTURE to an isolated historical demo database, never your private session database.",
  );
const profile = out + "/" + name + "-profile-" + Date.now();
fs.mkdirSync(profile);
const fixture = new DatabaseSync(process.env.RETRACE_MARKET_FIXTURE, {
  readOnly: true,
});
await backup(fixture, profile + "/replay.sqlite");
fixture.close();
const db = new DatabaseSync(profile + "/replay.sqlite");
db.prepare("UPDATE meta SET value=? WHERE key='discordSettings'").run(
  JSON.stringify({ enabled: false }),
);
db.close();
const { _electron } = createRequire(sourceRoot + "/package.json")("playwright");
let app, p;
const errors = [],
  checks = [];
const pause = () => p.waitForTimeout(700);
const call = (c) => p.evaluate((c) => window.replay.call(c), c),
  state = () => call({ type: "state" });
async function launch() {
  app = await _electron.launch({
    executablePath: root + "/release/win-unpacked/RETRACE.exe",
    env: {
      ...process.env,
      XAU_REPLAY_DATA: profile,
      XAU_REPLAY_PROJECT_ROOT: root,
    },
    timeout: 30000,
  });
  p = await app.firstWindow();
  await p.waitForFunction(() => window.replay);
  p.on("pageerror", (e) => errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows())
      w.webContents.setBackgroundThrottling(false);
  });
}
const width = (r) => r.to - r.from;
const near = (a, b, label) =>
  assert.ok(Math.abs(a - b) < 0.03, label + ": " + a + " vs " + b);
const report = (label, details = {}) => {
  checks.push({ label, pass: true, ...details });
  console.log("PASS " + label);
};
async function frame(tf) {
  await p.getByRole("button", { name: tf, exact: true }).click();
  await pause();
  const v = await state();
  assert.equal(v.session.layout.timeframe, tf);
  assert.equal(v.session.layout.range.timeframe, tf);
  return v;
}
async function zoom(secondary = false) {
  const b = await p
    .locator(".chart-canvas")
    .nth(secondary ? 1 : 0)
    .boundingBox();
  await p.mouse.move(b.x + b.width * 0.9, b.y + b.height * 0.5);
  await p.mouse.wheel(0, -240);
  await pause();
  return (await state()).session.layout[secondary ? "secondRange" : "range"];
}
try {
  await launch();
  await call({
    type: "sessions.new",
    timestamp: Date.parse("2026-01-15T16:00:00Z"),
  });
  let v = await state(),
    s = v.session;
  await call({
    type: "ui",
    value: {
      layout: {
        ...s.layout,
        timeframe: "30m",
        ai: false,
        bottom: 140,
        range: {
          version: 3,
          from: 964,
          to: 3303,
          fromTime: s.tick.t / 1000 - 2339 * 1800,
          toTime: s.tick.t / 1000 + 100 * 1800,
        },
      },
    },
  });
  await p.waitForTimeout(1200);
  v = await state();
  near(width(v.session.layout.range), 147, "Legacy compressed view repair");
  assert.equal(v.session.layout.range.timeframe, "30m");
  s = v.session;
  report("Already compressed legacy views open with readable spacing");

  await call({
    type: "ui",
    value: {
      layout: {
        ...s.layout,
        timeframe: "4H",
        ai: false,
        bottom: 140,
        dual: false,
        htf: {
          timeframe: "4H",
          count: 1,
          width: 56,
          gap: 18,
          up: "#ff9b4a",
          down: "#a0a0a0",
          levels: true,
          ...s.layout.htf,
          enabled: false,
        },
      },
    },
  });
  const close = p.getByRole("button", { name: "Lukk dialog", exact: true });
  if (await close.count()) await close.click();
  await pause();
  v = await state();
  const tick = v.session.tick.t,
    broker = structuredClone(v.session.broker);
  const bar = v.bars.at(-2);
  const drawing = {
    id: "timeframe-proof",
    kind: "zone",
    a: { time: bar.time, price: bar.high },
    b: { time: bar.time + 14400, price: bar.low },
    color: "#ff9b4a",
    locked: true,
    label: "4H reference",
    levels: [],
    createdCursor: tick,
  };
  await call({ type: "drawings", value: [drawing] });
  await pause();
  const h4 = (await state()).session.layout.range;
  await p.screenshot({ path: out + "/" + name + "-4H.png" });
  const drawingWidth = async () =>
    Number(
      await p
        .locator('rect[data-id="timeframe-proof"]')
        .first()
        .getAttribute("width"),
    );
  const h4DrawingWidth = await drawingWidth();
  console.log(JSON.stringify({ h4, width: width(h4), h4DrawingWidth }));
  v = await frame("15m");
  near(width(v.session.layout.range), width(h4), "15m candle count");
  const m15DrawingWidth = await drawingWidth();
  near(
    m15DrawingWidth / h4DrawingWidth,
    16,
    "4H zone retains its actual duration on 15m",
  );
  report(
    "4H → 15m keeps readable candle spacing; zone stays anchored to the same four hours",
    { h4Bars: width(h4), m15Bars: width(v.session.layout.range) },
  );
  await p.screenshot({ path: out + "/" + name + "-15m.png" });
  v = await frame("1m");
  near(width(v.session.layout.range), width(h4), "1m candle count");
  assert.ok(
    v.session.layout.range.to < v.bars.length + 50,
    "Replay remains visible instead of far-future whitespace",
  );
  report("15m → 1m keeps candle spacing and visible replay");
  const m1 = await zoom();
  assert.ok(width(m1) < width(h4) * 0.95, "Wheel must actually zoom the chart");
  v = await frame("4H");
  near(width(v.session.layout.range), width(h4), "4H saved zoom");
  v = await frame("1m");
  near(width(v.session.layout.range), width(m1), "1m saved zoom");
  report("Each timeframe restores its own manually selected zoom", {
    h4Bars: width(h4),
    m1Bars: width(m1),
  });
  for (const tf of ["4H", "15m", "1m", "4H", "15m"])
    await p.getByRole("button", { name: tf, exact: true }).click();
  await pause();
  v = await state();
  assert.equal(v.session.layout.range.timeframe, "15m");
  near(
    width(v.session.layout.range),
    width(h4),
    "Rapid switching retains target view",
  );
  const prior = structuredClone(v.session.layout.range);
  await call({
    type: "viewport",
    value: {
      version: 3,
      timeframe: "1D",
      from: 0,
      to: 100,
      fromTime: 1,
      toTime: 2,
    },
  });
  assert.deepEqual((await state()).session.layout.range, prior);
  await call({
    type: "viewport",
    sessionId: "departed-session",
    value: { version: 3, timeframe: "15m", from: 0, to: 50 },
  });
  assert.deepEqual((await state()).session.layout.range, prior);

  report(
    "Rapid switches and delayed events cannot overwrite a different timeframe or session",
  );
  v = await state();
  await call({
    type: "ui",
    value: { layout: { ...v.session.layout, dual: true, second: "1H" } },
  });
  await pause();
  const secondBefore = (await state()).session.layout.secondRange;
  await p.getByLabel("Second timeframe", { exact: true }).selectOption("15m");
  await pause();
  let second = (await state()).session.layout.secondRange;
  near(width(second), width(secondBefore), "Secondary candle spacing");
  const secondZoom = await zoom(true);
  await p.getByLabel("Second timeframe", { exact: true }).selectOption("4H");
  await pause();
  await p.getByLabel("Second timeframe", { exact: true }).selectOption("15m");
  await pause();
  v = await state();
  near(
    width(v.session.layout.secondRange),
    width(secondZoom),
    "Secondary saved zoom",
  );
  near(width(v.session.layout.range), width(h4), "Primary view unaffected");
  report(
    "Second chart remembers its own views independently of the main chart",
  );
  assert.deepEqual(v.session.drawings, [drawing]);
  assert.equal(v.session.tick.t, tick);
  assert.deepEqual(v.session.broker, broker);
  report(
    "All drawing times/prices, replay clock, and simulated orders stay unchanged",
  );
  const id = v.session.id;
  await call({
    type: "ui",
    value: { layout: { ...v.session.layout, dual: false } },
  });
  await pause();
  const beforeRestart = (await state()).session;
  await app.close();
  app = null;
  await launch();
  await pause();
  v = await state();
  assert.equal(v.session.id, id);
  near(
    width(v.session.layout.range),
    width(beforeRestart.layout.range),
    "Restart active zoom",
  );
  v = await frame("4H");
  near(width(v.session.layout.range), width(h4), "Restart cached 4H zoom");
  v = await frame("1m");
  near(width(v.session.layout.range), width(m1), "Restart cached 1m zoom");
  report("Active and per-timeframe zoom survive app restart");
  await p.screenshot({ path: out + "/" + name + "-1m.png" });
  // Opening another session must not borrow this session's view cache.
  await call({
    type: "sessions.new",
    timestamp: Date.parse("2026-01-15T16:00:00Z"),
  });
  await pause();
  const other = (await state()).session;
  assert.notEqual(other.id, id);
  assert.equal(other.layout.ranges?.["4H"], undefined);
  await call({ type: "sessions.continue", id });
  await pause();
  v = await frame("4H");
  near(width(v.session.layout.range), width(h4), "Session-local view");
  report("Separate sessions keep separate timeframe views");
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    out + "/" + name + "-ui-proof.json",
    JSON.stringify(
      { at: new Date().toISOString(), root, profile, checks, errors },
      null,
      2,
    ),
  );
} catch (e) {
  if (p) {
    await p.screenshot({ path: out + "/" + name + "-failure.png" });
    console.log((await p.locator("body").innerText()).slice(-1300));
  }
  throw e;
} finally {
  if (app) await app.close();
}
