import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createWriteStream, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { holdout } from "./coach-holdout";
import { blindHoldout } from "./coach-blind-holdout";
import {
  COACH_PROFILE,
  promptSnapshot,
  validateGrounding,
} from "../src/ai/context";
import {
  coachEvidenceIssue,
  coachRuleIssue,
  coachEvidenceReply,
} from "../src/ai/coach-evidence";
import { fitContext } from "../src/ai/budget";
import { replyLanguage } from "../src/ai/intent";
const tag = process.argv[2] ?? "baseline",
  cpu = process.argv.includes("--cpu");
const root = path.resolve(
  process.env.RETRACE_COACH_EVIDENCE ?? "artifacts/coach-evaluation",
);
mkdirSync(root, { recursive: true });
const assets =
  process.env.RETRACE_COACH_ASSETS ??
  "F:/Projects/Retrace/artifacts/learning-20261116/ai-profile/local-ai";
const port = await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as any).port;
      server.close(() => resolve(port));
    });
  }),
  base = `http://127.0.0.1:${port}`;
const child = spawn(
  assets + "/runtime/b12374/vulkan/llama-server.exe",
  [
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--api-key",
    "isolated-holdout-eval",
    "--model",
    assets + "/models/Qwen3.5-4B-Q4_K_M.gguf",
    "--ctx-size",
    "8192",
    "--parallel",
    "1",
    "--threads",
    "6",
    "--n-gpu-layers",
    cpu ? "0" : "99",
    "--reasoning",
    "off",
    "--reasoning-budget",
    "0",
    "--no-webui",
  ],
  { windowsHide: true, cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);
const log = createWriteStream(path.join(root, tag + "-runtime.log"));
child.stdout.pipe(log);
child.stderr.pipe(log);
const results: any[] = [];
try {
  const start = performance.now();
  let ready = false;
  while (performance.now() - start < 120000) {
    try {
      const r = await fetch(base + "/health");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!ready) throw Error("isolated model did not become ready");
  for (const c of (process.argv.includes("--blind")
    ? blindHoldout()
    : holdout()
  ).filter(
    (x) =>
      (!cpu || x.id === "undefined-rules") &&
      (!process.argv.some((a) => a.startsWith("--case=")) ||
        process.argv.includes("--case=" + x.id)),
  )) {
    if (process.argv.includes("--production-context"))
      c.context = fitContext(c.context, 8192, 640, true);
    const t = performance.now();
    const r = await fetch(base + "/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer isolated-holdout-eval",
      },
      signal: AbortSignal.timeout(180000),
      body: JSON.stringify({
        model: "retrace-coach",
        messages: [
          {
            role: "system",
            content:
              COACH_PROFILE.system +
              " Reply in " +
              replyLanguage(c.question) +
              ".",
          },
          {
            role: "user",
            content: JSON.stringify({
              snapshot: promptSnapshot(c.context),
              request: c.question,
            }),
          },
        ],
        temperature: 0.3,
        seed: 71,
        max_tokens: 640,
        stream: false,
        chat_template_kwargs: { enable_thinking: false },
      }),
    });
    const raw = (await r.json()) as any;
    if (!r.ok) throw Error(JSON.stringify(raw));
    const text = raw.choices[0].message.content;
    let issue = coachRuleIssue(text) || coachEvidenceIssue(text, c.context);
    try {
      validateGrounding(text, c.context);
    } catch (e) {
      issue = String(e);
    }
    const dt = performance.now();
    const deterministic = coachEvidenceReply(c.context, c.question);
    const deterministicMs = performance.now() - dt;
    let repair: any = null;
    if (issue && process.argv.includes("--repair")) {
      const repairStart = performance.now();
      const response = await fetch(base + "/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer isolated-holdout-eval",
        },
        signal: AbortSignal.timeout(180000),
        body: JSON.stringify({
          model: "retrace-coach",
          temperature: 0.3,
          seed: 71,
          max_tokens: 640,
          stream: false,
          chat_template_kwargs: { enable_thinking: false },
          messages: [
            {
              role: "system",
              content:
                COACH_PROFILE.system +
                " Reply in " +
                replyLanguage(c.question) +
                ".",
            },
            {
              role: "user",
              content: JSON.stringify({
                snapshot: promptSnapshot(c.context),
                request: c.question,
              }),
            },
            { role: "assistant", content: text },
            {
              role: "user",
              content:
                "Correct this evidence error: " +
                issue +
                " Give a direct verdict, two observations, what is missing and one next action in 100–180 words. Never use a candle close as an automatic stop rule. Use only supplied facts.",
            },
          ],
        }),
      });
      const value = (await response.json()) as any;
      if (!response.ok) throw Error(JSON.stringify(value));
      const generated = value.choices[0].message.content;
      let repeated =
        coachRuleIssue(generated) || coachEvidenceIssue(generated, c.context);
      try {
        validateGrounding(generated, c.context);
      } catch (e) {
        repeated ??= String(e);
      }
      repair = {
        generated,
        generatedMs: performance.now() - repairStart,
        automaticIssue: repeated,
        final: repeated ? deterministic : generated,
        evidenceFallback: !!repeated,
      };
    }
    results.push({
      repair,
      id: c.id,
      question: c.question,
      expected: "expected" in c ? c.expected : undefined,
      context: c.context,
      generated: text,
      generatedMs: dt - t,
      usage: raw.usage,
      finishReason: raw.choices[0].finish_reason,
      automaticIssue: issue,
      deterministic,
      deterministicMs,
    });
    writeFileSync(
      path.join(root, tag + ".json"),
      JSON.stringify(
        {
          tag,
          cpu,
          model: "Qwen3.5-4B-Q4_K_M",
          temperature: 0.3,
          seed: 71,
          elapsedMs: performance.now() - start,
          results,
        },
        null,
        2,
      ),
    );
    console.log(c.id, Math.round(dt - t), issue ?? "automatic checks passed");
  }
} finally {
  child.kill();
  if (child.exitCode === null && child.signalCode === null)
    await new Promise((r) => child.once("exit", r));
  log.end();
}
