import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync, backup } from "node:sqlite";
const sourceRoot =
    process.env.RETRACE_SOURCE_ROOT || path.resolve(import.meta.dirname, ".."),
  root = process.argv[2] || sourceRoot,
  name = process.argv[3] || "public",
  out = sourceRoot + "/artifacts/box-20261125";
fs.mkdirSync(out, { recursive: true });
if (!process.env.RETRACE_MARKET_FIXTURE)
  throw Error(
    "Use a prepared historical demo database, never a private owner session database.",
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
const checks = [],
  errors = [];
const call = (c) => p.evaluate((c) => window.replay.call(c), c),
  state = () => call({ type: "state" }),
  pause = () => p.waitForTimeout(650);
async function launch() {
  app = await _electron.launch({
    executablePath: root + "/release/win-unpacked/RETRACE.exe",
    env: {
      ...process.env,
      XAU_REPLAY_DATA: profile,
      XAU_REPLAY_PROJECT_ROOT: root,
    },
  });
  p = await app.firstWindow();
  await p.waitForFunction(() => window.replay);
  p.on("pageerror", (e) => errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows())
      w.webContents.setBackgroundThrottling(false);
  });
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.005, a + " vs " + b),
  report = (label) => {
    checks.push({ label, pass: true });
    console.log("PASS " + label);
  };
async function frame(tf) {
  await p.getByRole("button", { name: tf, exact: true }).click();
  await pause();
}
async function dragAt(x, y, dx, dy, id) {
  const hit = await p.evaluate(
    ({ x, y }) =>
      document
        .elementFromPoint(x, y)
        ?.closest("[data-id]")
        ?.getAttribute("data-id"),
    { x, y },
  );
  assert.equal(hit, id, "Pointer must hit the drawing itself");
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.move(x + dx, y + dy, { steps: 15 });
  await p.mouse.up();
  await pause();
}
async function bodyDrag(id) {
  const canvas = await p.locator(".chart-canvas").first().boundingBox();
  for (const rect of await p.locator('rect[data-id="' + id + '"]').all()) {
    const b = await rect.boundingBox(),
      left = Math.max(b.x, canvas.x + 15),
      right = Math.min(b.x + b.width, canvas.x + canvas.width - 100),
      top = Math.max(b.y, canvas.y + 50),
      bottom = Math.min(b.y + b.height, canvas.y + canvas.height - 65);
    if (right - left < 8 || bottom - top < 15) continue;
    await dragAt((left + right) / 2, (top + bottom) / 2, 37, 17, id);
    return;
  }
  throw Error("No visible draggable box body");
}
async function handleDrag(id, key, dx, dy) {
  const h = p.locator(
      'circle[data-id="' + id + '"][data-handle="' + key + '"]',
    ),
    b = await h.boundingBox();
  assert.ok(b, "Selected drawing handle must exist");
  await dragAt(b.x + b.width / 2, b.y + b.height / 2, dx, dy, id);
}
try {
  await launch();
  await call({
    type: "sessions.new",
    timestamp: Date.parse("2026-01-15T16:00:00Z"),
  });
  await pause();
  let v = await state();
  await call({
    type: "ui",
    value: {
      layout: {
        ...v.session.layout,
        timeframe: "15m",
        ai: false,
        dual: false,
        bottom: 140,
        htf: {
          timeframe: "4H",
          count: 1,
          width: 56,
          gap: 18,
          up: "#ff9b4a",
          down: "#a0a0a0",
          levels: true,
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
    broker = structuredClone(v.session.broker),
    entry = v.bars.at(-8).close;
  for (const kind of ["long", "short"]) {
    await frame("15m");
    v = await state();
    // The 15m anchor is deliberately midway between two 30m candles.
    const base = Math.floor(v.bars.at(-8).time / 1800) * 1800 + 900,
      dir = kind === "long" ? 1 : -1;
    const drawing = {
      id: "box-" + kind,
      kind,
      a: { time: base, price: entry },
      b: { time: base + 4.5 * 3600, price: entry - dir * 5 },
      target: entry + dir * 8,
      color: "#aaaaaa",
      locked: false,
      label: "Projection check",
      levels: [],
      createdCursor: tick,
    };
    await call({ type: "drawings", value: [drawing] });
    await pause();
    await frame("30m");
    assert.deepEqual(
      (await state()).session.drawings,
      [drawing],
      "Frame switch must not change drawing anchors",
    );
    const rect = await p
        .locator('rect[data-id="' + drawing.id + '"]')
        .last()
        .boundingBox(),
      canvas = await p.locator(".chart-canvas").first().boundingBox();
    assert.ok(
      rect.x > canvas.x + 30 && rect.width > 8,
      "Between-candle anchors must not collapse at the chart edge",
    );
    await bodyDrag(drawing.id);
    let moved = (await state()).session.drawings[0];
    assert.notEqual(moved.a.time, drawing.a.time);
    assert.notEqual(moved.a.price, drawing.a.price);
    near(moved.b.time - moved.a.time, drawing.b.time - drawing.a.time);
    near(moved.a.price - moved.b.price, drawing.a.price - drawing.b.price);
    near(moved.target - moved.a.price, drawing.target - drawing.a.price);
    report(
      kind +
        ": 15m → 30m keeps true anchors and the box body remains draggable",
    );
    await frame("15m");
    assert.deepEqual((await state()).session.drawings, [moved]);
    await bodyDrag(drawing.id);
    moved = (await state()).session.drawings[0];
    report(
      kind +
        ": arbitrary moved anchors remain draggable after returning to 15m",
    );
    const beforeWidth = structuredClone(moved);
    await handleDrag(drawing.id, "width", 29, 0);
    moved = (await state()).session.drawings[0];
    assert.notEqual(moved.b.time, beforeWidth.b.time);
    near(moved.a.price, beforeWidth.a.price);
    near(moved.b.price, beforeWidth.b.price);
    near(moved.target, beforeWidth.target);
    const beforeStop = structuredClone(moved);
    await handleDrag(drawing.id, "b", 0, 12);
    moved = (await state()).session.drawings[0];
    assert.notEqual(moved.b.price, beforeStop.b.price);
    near(moved.a.price, beforeStop.a.price);
    near(moved.target, beforeStop.target);
    report(
      kind +
        ": width and stop handles remain independently editable after switching",
    );
    if (kind === "long")
      await p.screenshot({ path: out + "/" + name + "-draggable-box.png" });
  }
  v = await state();
  assert.equal(v.session.tick.t, tick);
  assert.deepEqual(v.session.broker, broker);
  report(
    "Moving drawings never advances replay or creates/changes simulated orders",
  );
  const last = v.session;
  await app.close();
  app = null;
  await launch();
  await pause();
  assert.deepEqual((await state()).session.drawings, last.drawings);
  await frame("30m");
  await bodyDrag(last.drawings[0].id);
  report(
    "Saved box reopens with working drag targets and survives another 30m switch",
  );
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    out + "/" + name + "-box-proof.json",
    JSON.stringify(
      { at: new Date().toISOString(), root, profile, checks, errors },
      null,
      2,
    ),
  );
} catch (e) {
  if (p) await p.screenshot({ path: out + "/" + name + "-box-failure.png" });
  throw e;
} finally {
  if (app) await app.close();
}
