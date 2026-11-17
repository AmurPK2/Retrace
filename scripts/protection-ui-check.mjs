import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync, backup } from "node:sqlite";
const sourceRoot = path.resolve(import.meta.dirname, "..");
const require = createRequire(sourceRoot + "/package.json");
const { _electron: electron } = require("playwright");
const root = process.argv[2] || sourceRoot;
const name = process.argv[3] || "public";
const out = sourceRoot + "/artifacts/protection-ui";
fs.mkdirSync(out, { recursive: true });
const profile = out + "/" + name + "-profile-" + Date.now();
fs.mkdirSync(profile, { recursive: true });
if (!process.env.RETRACE_MARKET_FIXTURE)
  throw Error(
    "Set RETRACE_MARKET_FIXTURE to a prepared historical demo/test database with 15 January 2026 XAUUSD ticks. Never use your private session database.",
  );
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
let app, p;
const errors = [],
  checks = [];
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
await launch();
const call = (c) => p.evaluate((c) => window.replay.call(c), c),
  state = () => call({ type: "state" }),
  pause = () => p.waitForTimeout(350);
async function fresh(label) {
  await call({
    type: "sessions.new",
    timestamp: Date.parse("2026-01-15T16:00:00Z"),
  });
  const s = (await state()).session;
  await call({ type: "sessions.rename", name: "Protection test · " + label });
  await call({
    type: "ui",
    value: {
      layout: {
        ...s.layout,
        ai: false,
        bottom: 140,
        timeframe: "15m",
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
  await pause();
  const close = p.getByRole("button", { name: "Lukk dialog", exact: true });
  if (await close.count()) await close.click();
  return (await state()).session;
}
function handle(owner, id, role) {
  return p.getByRole("button", {
    name: "Add " + role.toUpperCase() + " to " + owner + " " + id,
    exact: true,
  });
}
async function dragHandle(owner, id, role, dy, assertDuring) {
  const target = handle(owner, id, role);
  await target.hover();
  const b = await target.boundingBox();
  assert.ok(b, "Handle must be visible");
  assert.ok(
    await p.evaluate(
      ({ x, y }) =>
        !!document
          .elementFromPoint(x, y)
          ?.closest('[data-create-protection="true"]'),
      { x: b.x + b.width / 2, y: b.y + b.height / 2 },
    ),
    "Handle must be inside the visible chart and hit-testable",
  );
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await p.mouse.down();
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + dy, { steps: 15 });
  await pause();
  await assertDuring?.();
  await p.mouse.up();
  await pause();
}
function report(label, details = {}) {
  checks.push({ label, pass: true, ...details });
  console.log("PASS " + label);
}
function sameRange(a, b) {
  if (!a || !b) return;
  for (const k of ["from", "to", "priceFrom", "priceTo"])
    if (typeof a[k] === "number" && typeof b[k] === "number")
      assert.ok(Math.abs(a[k] - b[k]) < 1e-6, "Viewport changed: " + k);
  for (const k of ["fromTime", "toTime"])
    if (a[k] !== undefined) assert.equal(a[k], b[k]);
}
try {
  for (const side of ["buy", "sell"]) {
    await fresh(side + " draft");
    await p.getByRole("button", { name: "Ny ordre", exact: true }).click();
    const entry = side === "buy" ? 4610 : 4620,
      direction = side === "buy" ? 1 : -1;
    await p.getByLabel("Inngangspris", { exact: true }).fill(String(entry));
    await p.getByLabel("Stop loss", { exact: true }).fill("");
    await p.getByLabel("Take profit", { exact: true }).fill("");
    await pause();
    await p.getByLabel("Skjul ordredetaljer", { exact: true }).click();
    await pause();
    const entryLine = p.locator('line[data-order-role="entry"]').first(),
      initialY = await entryLine.getAttribute("y1"),
      before = (await state()).session;
    // A click without a drag must not create an at-entry stop.
    await handle("draft", "draft", "sl").click();
    await pause();
    assert.equal(await p.locator('line[data-order-role="sl"]').count(), 0);
    const b = await handle("draft", "draft", "sl").boundingBox();
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await p.mouse.down();
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 40 * direction, {
      steps: 8,
    });
    await p.keyboard.press("Escape");
    await p.mouse.up();
    await pause();
    assert.equal(await p.locator('line[data-order-role="sl"]').count(), 0);
    for (const role of ["sl", "tp"]) {
      await dragHandle(
        "draft",
        "draft",
        role,
        (role === "sl" ? 65 : -65) * direction,
        async () => {
          assert.equal(await entryLine.getAttribute("y1"), initialY);
          assert.ok(
            await p.locator('line[data-order-role="' + role + '"]').count(),
          );
        },
      );
      assert.equal(await entryLine.getAttribute("y1"), initialY);
      assert.equal(await handle("draft", "draft", role).count(), 0);
    }
    const after = (await state()).session;
    assert.equal(after.tick.t, before.tick.t);
    sameRange(before.layout.range, after.layout.range);
    await p.locator(".chart-more > summary").click();
    await p.getByRole("menuitem", { name: /^Ordredetaljer/ }).click();
    if (await p.locator(".chart-more[open]").count())
      await p.locator(".chart-more > summary").click();
    assert.equal(
      Number(await p.getByLabel("Inngangspris", { exact: true }).inputValue()),
      entry,
    );
    const sl = Number(
        await p.getByLabel("Stop loss", { exact: true }).inputValue(),
      ),
      tp = Number(
        await p.getByLabel("Take profit", { exact: true }).inputValue(),
      );
    assert.ok(
      side === "buy" ? sl < entry && tp > entry : sl > entry && tp < entry,
    );
    report(
      side +
        " draft: create SL/TP independently, no entry or viewport change; click/Escape cancel",
      { entry, sl, tp },
    );
    await p.getByLabel("Skjul ordredetaljer", { exact: true }).click();
    if (side === "buy")
      await p.screenshot({
        path: out + "/" + name + "-dragged-protection.png",
      });
    await p.getByRole("button", { name: "Cancel draft", exact: true }).click();
  }
  for (const owner of ["pending", "position"])
    for (const side of ["buy", "sell"]) {
      const initial = await fresh(side + " " + owner),
        direction = side === "buy" ? 1 : -1;
      await call({
        type: "order",
        order: {
          side,
          kind: owner === "pending" ? "limit" : "market",
          price: side === "buy" ? 4610 : 4620,
          lots: 0.01,
          thesis: "Protection control test",
          tags: [],
          strategy: "test",
        },
      });
      await pause();
      const before = (await state()).session,
        item = (
          owner === "pending" ? before.broker.pending : before.broker.positions
        ).at(-1),
        entry = owner === "pending" ? item.price : item.entry;
      const values = {};
      for (const role of ["sl", "tp"]) {
        await dragHandle(
          owner,
          item.id,
          role,
          (role === "sl" ? 60 : -60) * direction,
          async () => {
            const s = (await state()).session,
              v = (
                owner === "pending" ? s.broker.pending : s.broker.positions
              ).find((x) => x.id === item.id);
            assert.equal(owner === "pending" ? v.price : v.entry, entry);
            assert.equal(v[role], undefined, "No write until release");
            assert.ok(
              await p
                .locator(
                  "line[data-" +
                    (owner === "pending" ? "pending" : "position") +
                    '="' +
                    item.id +
                    '"][data-kind="' +
                    role +
                    '"]',
                )
                .count(),
              "New line previews during drag",
            );
          },
        );
        const now = (await state()).session,
          v = (
            owner === "pending" ? now.broker.pending : now.broker.positions
          ).find((x) => x.id === item.id);
        assert.equal(owner === "pending" ? v.price : v.entry, entry);
        assert.ok(Number.isFinite(v[role]));
        values[role] = v[role];
        if (role === "tp") assert.equal(v.sl, values.sl);
        sameRange(before.layout.range, now.layout.range);
        assert.equal(now.tick.t, initial.tick.t);
      }
      assert.ok(
        side === "buy"
          ? values.sl < entry && values.tp > entry
          : values.sl > entry && values.tp < entry,
      );
      report(
        side +
          " " +
          owner +
          ": both missing levels can be dragged out; entry and other protection remain fixed",
        { entry, ...values },
      );
    }
  const last = (await state()).session;
  await app.close();
  app = null;
  await launch();
  const restored = (await state()).session;
  assert.equal(restored.id, last.id);
  assert.deepEqual(
    restored.broker.positions,
    JSON.parse(JSON.stringify(last.broker.positions)),
  );
  assert.equal(restored.tick.t, last.tick.t);
  report("Protection survives app restart without replay advancement");
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
  await p.screenshot({ path: out + "/" + name + "-failure.png" });
  console.log((await p.locator("body").innerText()).slice(-1800));
  throw e;
} finally {
  if (app) await app.close();
}
