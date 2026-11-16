import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { writeFileSync, createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { initialBroker } from "../src/core/broker";
import {
  beginChallenge,
  commitChallenge,
  challengeProgress,
} from "../src/core/challenges";
import {
  CHALLENGE_COACH_SYSTEM,
  challengeSnapshot,
  challengeFeedbackSchema,
  parseChallengeFeedback,
  challengeFallback,
} from "../src/ai/challenge-feedback";
import type { Session } from "../src/types";
const evidence = path.resolve("artifacts/learning-checks");
mkdirSync(evidence, { recursive: true });
const runtime = process.env.RETRACE_MODEL_FIXTURE;
if (!runtime)
  throw Error(
    "Set RETRACE_MODEL_FIXTURE to an existing local-ai cache. This test never downloads a model.",
  );
const binary = runtime + "/runtime/b12374/vulkan/llama-server.exe";
const port = await new Promise<number>((resolve, reject) => {
  const s = createServer();
  s.once("error", reject);
  s.listen(0, "127.0.0.1", () => {
    const p = (s.address() as any).port;
    s.close(() => resolve(p));
  });
});
const log = createWriteStream(path.join(evidence, "local-model-runtime.log"));
const child = spawn(
  binary,
  [
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--model",
    runtime + "/models/Qwen3.5-4B-Q4_K_M.gguf",
    "--ctx-size",
    "8192",
    "--parallel",
    "1",
    "--threads",
    "6",
    "--n-gpu-layers",
    "99",
    "--no-webui",
    "--reasoning",
    "off",
    "--reasoning-budget",
    "0",
  ],
  {
    windowsHide: true,
    cwd: path.dirname(binary),
    stdio: ["ignore", "pipe", "pipe"],
  },
);
child.stdout.pipe(log);
child.stderr.pipe(log);
const cutoff = Date.UTC(2026, 10, 2, 12),
  results: any[] = [];
function session() {
  return {
    id: "eval",
    dataset: "dukascopy",
    tick: { t: cutoff, bid: 2005, ask: 2005.5 },
    broker: initialBroker(),
    layout: { timeframe: "15m" },
    drawings: [],
    notebook: { text: "No universal stop rule.", rules: [] },
  } as unknown as Session;
}
const htf = [-8, -4].map((h) => ({
  time: (cutoff + h * 3600000) / 1000,
  open: 2000,
  high: 2010,
  low: 1990,
  close: 2005,
  count: 120,
}));
const cases = [
  {
    id: "correct",
    stage: "frames",
    answer: {
      value: 16,
      reason:
        "Fire timer er 240 minutter. 240 delt på 15 er 16 perioder. På 15m ser jeg rekkefølgen på mindre bevegelser inne i samme 4H-periode, men ikke senere priser.",
    },
    expected: "checked",
  },
  {
    id: "incorrect",
    stage: "frames",
    answer: {
      value: 8,
      reason:
        "Jeg er helt sikker på at fire timer bare har åtte perioder på 15 minutter. Flere detaljer garanterer bedre inngang.",
    },
    expected: "needs-practice",
  },
  {
    id: "vague",
    stage: "frames",
    answer: {
      value: 16,
      reason: "Jeg er helt sikker på at dette er riktig fordi det ser bra ut.",
    },
    expected: "unclear",
  },
  {
    id: "rule-breaking",
    stage: "invalidation",
    answer: {
      decision: "buy",
      entry: 2006,
      sl: 2005,
      reason:
        "Jeg legger alltid SL ved 4H-close fordi det er en universell regel for alle kjøp. Jeg trenger ingen annen ugyldiggjøring.",
    },
    expected: "needs-practice",
  },
] as const;
try {
  for (let i = 0; i < 200; i++) {
    if (child.exitCode !== null) throw Error("Runtime exited");
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
    if (i === 199) throw Error("Runtime loading timeout");
  }
  for (const item of cases) {
    const s = session(),
      c = beginChallenge(s, [], htf, item.stage);
    commitChallenge(c, item.answer as any, s);
    const start = performance.now();
    const messages = [
      { role: "system", content: CHALLENGE_COACH_SYSTEM },
      { role: "user", content: JSON.stringify(challengeSnapshot(c)) },
    ];
    let raw = "",
      feedback: any,
      error = "";
    for (let retry = 0; retry < 2; retry++) {
      const r = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "local",
          messages,
          stream: false,
          temperature: 0.3,
          max_tokens: 1400,
          chat_template_kwargs: { enable_thinking: false },
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "learning",
              strict: true,
              schema: challengeFeedbackSchema(c),
            },
          },
        }),
        signal: AbortSignal.timeout(180000),
      });
      if (!r.ok) throw Error(await r.text());
      const data: any = await r.json();
      raw = data.choices?.[0]?.message?.content ?? "";
      try {
        feedback = parseChallengeFeedback(raw, c);
        break;
      } catch (e) {
        error = String(e);
        messages.push(
          { role: "assistant", content: raw },
          {
            role: "user",
            content:
              "Correct the response using only frozen evidence. Return JSON. Validation problem: " +
              error,
          },
        );
      }
    }
    feedback ??= challengeFallback(c, true, error);
    c.feedback = feedback;
    const record = {
      id: item.id,
      expected: item.expected,
      actual: feedback.assessment,
      source: feedback.source,
      elapsedMs: Math.round(performance.now() - start),
      mastered: challengeProgress(c).mastered,
      error,
      raw,
      feedback,
    };
    results.push(record);
    writeFileSync(
      path.join(evidence, "local-model-evaluation.json"),
      JSON.stringify(
        { model: "Qwen3.5-4B-Q4_K_M", syntheticUnitEvidence: true, results },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        id: item.id,
        actual: feedback.assessment,
        source: feedback.source,
        ms: record.elapsedMs,
        mastered: record.mastered,
        error,
      }),
    );
  }
  assert.ok(
    results.every((x) => x.actual === x.expected),
    "Actual model must distinguish correct, incorrect, vague and rule-breaking reasoning",
  );
  assert.ok(
    results.every(
      (x) =>
        x.source === "model" ||
        (x.id === "rule-breaking" &&
          x.source === "checks" &&
          x.error.includes("illustrative rules")),
    ),
    "Only independently corrected rule violations may use the safety fallback",
  );
} finally {
  child.kill();
  log.end();
}
