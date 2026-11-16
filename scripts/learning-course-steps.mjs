import { _electron as electron, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const evidence = path.resolve("artifacts/learning-checks");
const env = {
  ...process.env,
  XAU_REPLAY_DATA: path.join(evidence, "ui-profile"),
  XAU_REPLAY_PROJECT_ROOT: process.cwd(),
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  executablePath: path.resolve("node_modules/electron/dist/electron.exe"),
  args: ["."],
  cwd: process.cwd(),
  env,
});
const result = { stages: [], guides: [], zeroNewFills: false };
try {
  const page = await app.firstWindow();
  await page.locator(".challenge-entry").click();
  const hub = page.locator(".learning-hub");
  const before = await page.evaluate(() =>
    window.replay.call({ type: "state" }),
  );
  for (const stage of [
    "candles",
    "pair",
    "frames",
    "level",
    "wait",
    "invalidation",
    "risk",
    "compare",
    "two",
    "reflect",
  ]) {
    await hub.getByLabel("Learning step").selectOption(stage);
    await hub
      .getByRole("button", { name: "Start oppgaven / prøv igjen", exact: true })
      .click();
    let state = await page.evaluate(() =>
      window.replay.call({ type: "state" }),
    );
    const c = state.session.learning.active,
      last = c.htf.at(-1),
      first = c.htf.at(-2);
    const fill = async (name, value) =>
      hub.getByLabel(name, { exact: true }).fill(String(value));
    if (stage === "candles" || stage === "level") await fill("Pris", last.high);
    if (stage === "frames") await fill("Antall perioder", 16);
    if (stage === "pair")
      await hub
        .getByLabel("Challenge classification")
        .selectOption(
          last.close > first.high
            ? "close-above"
            : last.close < first.low
              ? "close-below"
              : last.high > first.high || last.low < first.low
                ? "wick"
                : "inside",
        );
    if (stage === "compare")
      await hub.getByLabel("Challenge classification").selectOption("B");
    if (stage === "wait")
      await fill(
        "Challenge confirmation",
        `Jeg venter på en ferdig 15m-close over det lagrede 4H-high ${last.high}.`,
      );
    if (["invalidation", "risk", "two"].includes(stage)) {
      await hub.getByLabel("Challenge decision").selectOption("buy");
      const entry = Number(state.session.tick.bid.toFixed(c.specs.precision));
      await fill("Inngang 1", entry);
      await fill("SL", Number((entry - 1).toFixed(c.specs.precision)));
      if (stage !== "invalidation") {
        await fill("TP 1", Number((entry + 2).toFixed(c.specs.precision)));
        await fill("Størrelse per inngang", c.specs.minLot);
      }
      if (stage === "two") {
        await fill(
          "Inngang 2",
          Number((entry - 0.2).toFixed(c.specs.precision)),
        );
        await fill("TP 2", Number((entry + 3).toFixed(c.specs.precision)));
      }
    }
    const reasons = {
      candles: `Kroppen går fra open til close, og veken viser høyeste pris ${last.high}. Perioden er slutt før låst replay-tid.`,
      pair: `Jeg sammenligner C2-close ${last.close} med C1-high ${first.high} og C1-low ${first.low}. Veke og ferdig sluttbrudd er ulike observasjoner, og C3 er ukjent.`,
      frames:
        "Fire timer er 240 minutter. 240 delt på 15 gir 16. Lavere tidsramme viser rekkefølgen inne i samme periode uten senere priser.",
      level: `Jeg bruker den siste ferdige 4H-toppen ${last.high} som referanse, men toppen alene garanterer ingen reaksjon.`,
      wait: `Den siste ferdige 4H-candlen har high ${last.high}. Jeg venter fordi den valgte 15m-bekreftelsen ikke er dokumentert ennå.`,
      invalidation:
        "SL under inngangen begrenser risikoen. Jeg må fortsatt knytte nivået til en observasjon som motsier kjøpsideen.",
      risk: "Jeg velger minste størrelse og en liten stopavstand for å holde beregnet risiko med kostnader innenfor budsjettet. Gyldig geometri beviser ikke strategien.",
      compare:
        "B har mål på to ganger risikoen, A én gang, ved lik entry og SL. Høyere R:R alene beviser ingen høyere vinnersjanse.",
      two: "Begge inngangene bidrar til samlet risiko selv med felles SL. Jeg må begrunne hvert mål og kreve dokumentert bekreftelse før en virkelig simulert inngang.",
      reflect:
        "I mitt forrige to-inngangssvar manglet en konkret bekreftelse. Neste gang skriver jeg nivå, tidsramme og ferdigstatus før låsing, uavhengig av gevinst eller tap.",
    };
    await fill("Challenge reasoning", reasons[stage]);
    await hub
      .getByRole("button", { name: "Lås svar og kontroller", exact: true })
      .click();
    state = await page.evaluate(() => window.replay.call({ type: "state" }));
    const saved = state.session.learning.active;
    assert.ok(saved.answer && saved.committedAt);
    assert.ok(
      saved.checks.every((x) => x.pass === true),
      JSON.stringify({ stage, checks: saved.checks }),
    );
    assert.equal(saved.feedback.source, "checks");
    await expect(
      hub.getByText("0 / 10 trinn med demonstrert mestring"),
    ).toBeVisible();
    result.stages.push({
      stage,
      checks: saved.checks.length,
      committed: true,
      factual: true,
      mastery: false,
      reason: "AI disabled: form alone cannot pass reasoning",
    });
  }
  await hub
    .getByRole("button", {
      name: "Bibliotek: alle seks offline-guider",
      exact: true,
    })
    .click();
  for (let i = 0; i < 6; i++) {
    const buttons = page.locator(".rr-guide-dialog nav button");
    await buttons.nth(i).click();
    await page.waitForFunction(
      () => document.querySelector("dialog video")?.readyState >= 1,
    );
    const media = await page.locator("dialog video").evaluate(async (v) => {
      v.muted = true;
      await v.play();
      const result = {
        src: v.currentSrc,
        duration: v.duration,
        captions: v.textTracks.length,
      };
      return result;
    });
    assert.ok(media.duration > 0);
    assert.equal(media.captions, 1);
    await page.waitForFunction(
      () => document.querySelector("dialog video")?.currentTime > 0.1,
    );
    result.guides.push(media);
  }
  await page.getByRole("button", { name: "Lukk videoguidene" }).click();
  const after = await page.evaluate(() =>
    window.replay.call({ type: "state" }),
  );
  assert.deepEqual(after.session.broker.fills, before.session.broker.fills);
  assert.deepEqual(
    after.session.broker.positions,
    before.session.broker.positions,
  );
  assert.deepEqual(after.session.broker.pending, before.session.broker.pending);
  result.zeroNewFills = true;
  await hub
    .getByRole("button", {
      name: "Tilbake til fri øving · behold forsøket",
      exact: true,
    })
    .click();
  result.success = true;
  writeFileSync(
    path.join(evidence, "all-ten-steps-and-six-guides.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify({
      success: true,
      stages: result.stages.length,
      guides: result.guides.length,
      zeroNewFills: true,
    }),
  );
} finally {
  await app.close();
}
