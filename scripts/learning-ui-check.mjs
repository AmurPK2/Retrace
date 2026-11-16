import { _electron as electron, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const evidence = path.resolve("artifacts/learning-checks"),
  root = path.join(evidence, "ui-profile");
const seed = JSON.parse(
  readFileSync(path.join(evidence, "ui-seed.json"), "utf8"),
);
const env = {
  ...process.env,
  XAU_REPLAY_DATA: root,
  XAU_REPLAY_PROJECT_ROOT: process.cwd(),
};
delete env.ELECTRON_RUN_AS_NODE;
let app;
const result = {
  profile: root,
  productionBuild: true,
  realHistoricalMarketOnly: true,
  checks: [],
};
async function open() {
  app = await electron.launch({
    executablePath: path.resolve("node_modules/electron/dist/electron.exe"),
    args: ["."],
    cwd: process.cwd(),
    env,
  });
  const page = await app.firstWindow();
  await page.waitForSelector(".challenge-entry", { timeout: 30000 });
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setSize(1500, 1100);
  });
  await page.locator(".challenge-entry").click();
  await page.locator(".learning-hub").waitFor();
  return page;
}
try {
  let page = await open(),
    hub = page.locator(".learning-hub");
  await expect(
    hub.getByText("0 / 10 trinn med demonstrert mestring"),
  ).toBeVisible();
  result.checks.push("Legacy checked/revealed attempt grants zero mastery");
  await hub.getByLabel("Learning step").selectOption("candles");
  await expect(
    hub.getByRole("heading", { name: "1. Les prisene: kropp og veke" }),
  ).toBeVisible();
  await hub
    .getByRole("button", { name: "Se guiden til dette trinnet", exact: true })
    .click();
  const video = page.locator("dialog video");
  await expect(video).toBeVisible();
  await page.waitForFunction(() => {
    const v = document.querySelector("dialog video");
    return v?.readyState >= 1;
  });
  const media = await video.evaluate(async (v) => {
    v.muted = true;
    await v.play();
    return {
      src: v.currentSrc,
      duration: v.duration,
      tracks: v.textTracks.length,
      fullscreen: document.fullscreenEnabled,
    };
  });
  assert.ok(media.src.includes("RETRACE-candles-norsk"));
  assert.ok(media.duration > 0);
  assert.equal(media.tracks, 1);
  result.media = media;
  await page.waitForFunction(
    () => document.querySelector("dialog video")?.currentTime > 0.2,
  );
  await page
    .getByRole("button", { name: "Lukk videoguidene", exact: true })
    .click();
  result.checks.push(
    "Relevant offline candle guide loads and actually plays with caption track",
  );
  await hub.getByLabel("Learning language", { exact: true }).selectOption("en");
  await expect(
    hub.getByRole("heading", { name: "1. Read prices: body and wick" }),
  ).toBeVisible();
  await hub.getByLabel("Learning language", { exact: true }).selectOption("nb");
  result.checks.push("Optional English and Norwegian course text switch");
  await hub.getByLabel("Learning step").selectOption("frames");
  await hub
    .getByRole("button", { name: "Start oppgaven / prøv igjen", exact: true })
    .click();
  await hub.getByLabel("Antall perioder", { exact: true }).fill("16");
  await hub
    .getByLabel("Challenge reasoning", { exact: true })
    .fill(
      "Fire timer er 240 minutter. 240 delt på 15 gir 16 perioder. 15m viser mindre bevegelser i samme periode, uten senere priser.",
    );
  const before = await page.evaluate(() =>
    window.replay.call({ type: "state" }),
  );
  await hub
    .getByRole("button", { name: "Lås svar og kontroller", exact: true })
    .click();
  await expect(
    hub.getByText("Svar gjennomført · mestring ikke dokumentert ennå", {
      exact: true,
    }),
  ).toBeVisible();
  let state = await page.evaluate(() => window.replay.call({ type: "state" }));
  const locked = structuredClone(state.session.learning.active);
  assert.equal(locked.revealedAt, undefined);
  assert.equal(locked.cutoff, before.session.tick.t);
  assert.equal(state.session.learning.history.length, 1);
  assert.deepEqual(
    state.session.learning.history[0],
    seed.legacyLearning.active,
  );
  assert.deepEqual(state.session.study, seed.legacyStudy);
  result.checks.push(
    "New answer locked before reveal, previous v2 answer and RR study unchanged",
  );
  await page.screenshot({
    path: path.join(evidence, "learning_locked_answer.png"),
    fullPage: true,
  });
  await app.close();
  app = null;
  page = await open();
  hub = page.locator(".learning-hub");
  state = await page.evaluate(() => window.replay.call({ type: "state" }));
  assert.deepEqual(state.session.learning.active, locked);
  assert.deepEqual(
    state.session.learning.history[0],
    seed.legacyLearning.active,
  );
  assert.deepEqual(state.session.study, seed.legacyStudy);
  result.checks.push(
    "Real app restart preserves locked new answer and legacy histories exactly",
  );
  await hub
    .getByRole("button", { name: "Vis neste candle", exact: true })
    .click();
  state = await page.evaluate(() => window.replay.call({ type: "state" }));
  assert.ok(state.session.learning.active.revealedAt);
  assert.deepEqual(state.session.learning.active.answer, locked.answer);
  await expect(
    hub.getByText("0 / 10 trinn med demonstrert mestring"),
  ).toBeVisible();
  result.checks.push("Reveal advances real replay but cannot earn mastery");
  await hub
    .getByRole("button", {
      name: "Prøv samme trinn igjen · behold forsøket",
      exact: true,
    })
    .click();
  state = await page.evaluate(() => window.replay.call({ type: "state" }));
  assert.equal(state.session.learning.history.length, 2);
  assert.equal(state.session.learning.active.stage, "frames");
  assert.equal(state.session.learning.active.answer, undefined);
  result.checks.push(
    "Retry creates distinct attempt and keeps both previous answers",
  );
  await hub
    .getByRole("button", {
      name: "Tilbake til fri øving · behold forsøket",
      exact: true,
    })
    .click();
  const t = state.session.tick.t;
  await page.evaluate(() =>
    window.replay.call({ type: "step", kind: "candle" }),
  );
  state = await page.evaluate(() => window.replay.call({ type: "state" }));
  assert.ok(state.session.tick.t > t);
  result.checks.push(
    "Return to free practice unblocks chart replay without deleting attempts",
  );
  await hub
    .getByText("Tidligere C1/C2-studier · bevart historikk", { exact: false })
    .click();
  await expect(
    hub.getByText("Gamle lese- og studiemarkeringer er bevart.", {
      exact: false,
    }),
  ).toBeVisible();
  await hub.getByLabel("Learning step").selectOption("two");
  await expect(
    hub.getByRole("heading", {
      name: "9. Et komplett oppsett med to innganger",
    }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(evidence, "learning_course_and_history.png"),
    fullPage: true,
  });
  result.checks.push(
    "One course reaches two-entry plan and exposes retained legacy study history",
  );
  result.success = true;
  writeFileSync(
    path.join(evidence, "ui-acceptance.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (app) await app.close();
}
