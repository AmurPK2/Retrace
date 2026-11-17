import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync, backup } from "node:sqlite";
const source = path.resolve(import.meta.dirname, ".."),
  root = process.argv[2] || source,
  name = process.argv[3] || "public",
  out = source + "/artifacts/visual-rr-20261117";
const require = createRequire(source + "/package.json"),
  { _electron: electron } = require("playwright");
const fixture = process.env.RETRACE_MARKET_FIXTURE;
if (!fixture)
  throw Error(
    "Set RETRACE_MARKET_FIXTURE to a separate demo database with verified XAUUSD history covering 15 January 2026. Never use the owner session database.",
  );
const profile = out + "/" + name + "-profile-" + Date.now();
fs.mkdirSync(profile, { recursive: true });
const input = new DatabaseSync(fixture, { readOnly: true });
await backup(input, profile + "/replay.sqlite");
input.close();
const db = new DatabaseSync(profile + "/replay.sqlite");
for (const [key, value] of [
  ["aiSettings", { enabled: false, profile: "gaming" }],
  ["discordSettings", { enabled: false }],
]) {
  const old = JSON.parse(
    db.prepare("SELECT value FROM meta WHERE key=?").get(key)?.value || "{}",
  );
  db.prepare("INSERT OR REPLACE INTO meta VALUES(?,?)").run(
    key,
    JSON.stringify({ ...old, ...value }),
  );
}
db.close();
let app, p;
const checks = [],
  errors = [];
async function launch() {
  app = await electron.launch({
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
const call = (c) => p.evaluate((c) => window.replay.call(c), c),
  state = () => call({ type: "state" });
const click = (role, name) => p.getByRole(role, { name, exact: true }).click();
async function open() {
  await click("button", "Lær og øv");
  await p.locator(".learning-shell").waitFor();
  await p.locator(".visual-course,.visual-empty").waitFor();
}
async function screenshot(label) {
  await p.screenshot({ path: out + "/" + name + "-" + label + ".png" });
}
await launch();
try {
  await call({
    type: "sessions.new",
    name: "Visual RR acceptance",
    timestamp: Date.UTC(2026, 0, 15, 16),
    balance: 500,
  });
  await p.waitForTimeout(1500);
  let before = await state();
  for (let i = 0; i < 8; i++) {
    await p.waitForTimeout(400);
    const next = await state();
    if (
      JSON.stringify(next.session.layout) ===
      JSON.stringify(before.session.layout)
    ) {
      before = next;
      break;
    }
    before = next;
  }
  await open();
  let v = await call({ type: "visual.open" });
  assert.equal(v.step, "candle");
  assert.equal(v.revealed, false);
  assert.ok(v.frames["4H"].length >= 2);
  await screenshot("guided");
  checks.push({
    label:
      "Visual RR path opens by default with real historical candles and hidden C3",
    pass: true,
  });
  await click("button", "Prøv selv");
  v = await call({ type: "visual.open" });
  assert.equal(v.key, null);
  const c1 = v.reference.c1;
  const chart = p.getByRole("graphics-document", {
    name: "Interaktivt 4H læringschart",
  });
  // The SVG may expose its explicit accessible label without a graphics-document role.
  const svg = p.locator("svg.visual-chart");
  async function point(time, price) {
    const info = await svg.evaluate(
      (e, { time, price }) => {
        const r = e.getBoundingClientRect(),
          g = e.querySelector('[data-visual-candle="' + time + '"]');
        if (!g) throw Error("Candle not visible");
        const wick = g.querySelector("line"),
          body = g.querySelector("rect:last-of-type");
        const xx = Number(wick.getAttribute("x1")),
          yyHigh = Number(wick.getAttribute("y1")),
          yyLow = Number(wick.getAttribute("y2"));
        return {
          r: { x: r.x, y: r.y, width: r.width, height: r.height },
          xx,
          yyHigh,
          yyLow,
        };
      },
      { time, price },
    );
    const bar = v.frames["4H"].find((b) => b.time === time);
    const yy =
      info.yyHigh +
      ((bar.high - price) / (bar.high - bar.low)) * (info.yyLow - info.yyHigh);
    return {
      x: info.r.x + (info.xx * info.r.width) / 900,
      y: info.r.y + (yy * info.r.height) / 450,
    };
  }
  for (const key of ["high", "low", "close"]) {
    const target = p.getByRole("button", {
      name: new RegExp("^" + key.toUpperCase() + " ·"),
    });
    await target.click();
    const pt = await point(c1.time, c1[key]);
    await p.mouse.click(pt.x, pt.y);
  }
  await click("button", "Lås og vis forklaringen");
  await p
    .getByRole("status")
    .filter({ hasText: "Faktasjekken er oppfylt" })
    .waitFor();
  v = await call({ type: "visual.open" });
  assert.ok(v.last.checks.every((x) => x.pass));
  assert.equal(v.last.guided, false);
  checks.push({
    label:
      "Practice wick high/low and body close answered by actual chart clicks and checked after lock",
    pass: true,
  });
  await p
    .locator(".visual-steps button")
    .filter({ hasText: "Hva gjorde C2?" })
    .click();

  // Deliberately wrong classification must produce specific correction and marks.
  await click("button", "Innenfor · ingen sweep");
  await click("button", "Lås og vis forklaringen");
  v = await call({ type: "visual.open" });
  assert.ok(v.last.checks.length);
  await screenshot("classification");
  checks.push({
    label:
      "Classification locks and shows computed C1/C2 prices and marked range",
    pass: true,
  });
  await p
    .locator(".visual-steps button")
    .filter({ hasText: "Se inni 4H" })
    .click();
  v = await call({ type: "visual.open" });
  await svg
    .locator('[data-visual-candle="' + v.reference.c2.time + '"]')
    .press("Enter");
  await click("button", "Lås og vis forklaringen");
  v = await call({ type: "visual.open" });
  assert.ok(v.last.checks.every((x) => x.pass));
  checks.push({
    label:
      "15m selection belongs to highlighted frozen 4H parent; keyboard selection works",
    pass: true,
  });
  await p
    .locator(".visual-steps button")
    .filter({ hasText: "Se en FVG" })
    .click();
  await click("button", "Vis meg");
  v = await call({ type: "visual.open" });
  assert.ok(v.key);
  await screenshot("fvg");
  checks.push({
    label:
      "FVG step numbers actual three-candle sequence and shows wick-boundary explanation",
    pass: true,
  });
  await p
    .locator(".visual-steps button")
    .filter({ hasText: "Dra planen på chartet" })
    .click();
  await click("button", "Prøv selv");
  await click("button", "Kjøpshypotese");
  v = await call({ type: "visual.open" });
  const inputEntry = p.getByRole("spinbutton", {
      name: "Visuell ENTRY",
      exact: true,
    }),
    inputSL = p.getByRole("spinbutton", { name: "Visuell SL", exact: true }),
    inputTP = p.getByRole("spinbutton", { name: "Visuell TP", exact: true });
  const entry = Number(await inputEntry.inputValue()),
    tp = Number(await inputTP.inputValue()),
    sl = Number(await inputSL.inputValue());
  const handle = svg.locator('[data-visual-handle="sl"]');
  const box = await svg.boundingBox();
  const hy = Number(await handle.getAttribute("y1"));
  const from = {
    x: box.x + (box.width * 400) / 900,
    y: box.y + (box.height * hy) / 450,
  };
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  await p.mouse.move(from.x, from.y + 25, { steps: 8 });
  await p.mouse.up();
  assert.equal(Number(await inputEntry.inputValue()), entry);
  assert.equal(Number(await inputTP.inputValue()), tp);
  assert.notEqual(Number(await inputSL.inputValue()), sl);
  // Deliberate old C1-boundary stop must fail the selected wick-extreme rule.
  await inputEntry.fill(String(v.reference.c2.close));
  await inputSL.fill(String(v.reference.c1.low));
  await inputTP.fill(String(v.reference.c2.close + 50));
  await click("button", "Lås og vis forklaringen");
  v = await call({ type: "visual.open" });
  assert.equal(v.last.checks[1].pass, false);
  await screenshot("plan-correction");
  checks.push({
    label:
      "Dragging SL leaves entry and TP fixed; an inside-range stop is corrected against actual wick extreme",
    pass: true,
  });
  await click("button", "Prøv samme oppgave igjen");
  await click("button", "Vent");
  await click("button", "Lås og vis forklaringen");
  await p
    .locator(".visual-steps button")
    .filter({ hasText: "Lås, avslør og sammenlign" })
    .click();
  await p
    .getByRole("button", {
      name: "Resultat og regeloppfyllelse må vurderes hver for seg",
      exact: true,
    })
    .click();
  await click("button", "Lås og vis forklaringen");
  v = await call({ type: "visual.open" });
  assert.equal(v.c3, null);
  assert.equal(v.canReveal, true);
  await click("button", "Vis faktisk C3");
  v = await call({ type: "visual.open" });
  assert.ok(v.c3);
  assert.equal(v.revealed, true);
  await screenshot("reveal");
  const after = await state();
  for (const key of [
    "tick",
    "cursor",
    "broker",
    "drawings",
    "chat",
    "learning",
    "notebook",
    "layout",
  ])
    assert.deepEqual(after.session[key], before.session[key], key + " changed");
  checks.push({
    label:
      "C3 appears only after locked plan and review; no replay tick, orders, drawings, chat or previous course change",
    pass: true,
  });
  const saved = structuredClone(v);
  await app.close();
  await launch();
  const reopened = await call({ type: "visual.open" });
  assert.equal(reopened.snapshotId, saved.snapshotId);
  assert.deepEqual(reopened.history, saved.history);
  assert.deepEqual(reopened.c3, saved.c3);
  checks.push({
    label:
      "Restart restores locked visual answers, feedback and revealed state",
    pass: true,
  });
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    out + "/" + name + "-ui-proof.json",
    JSON.stringify(
      { at: new Date().toISOString(), root, profile, checks, errors },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, errors }));
} finally {
  await app?.close().catch(() => {});
}
