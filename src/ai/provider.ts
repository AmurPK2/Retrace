import { spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AISettings, AIStatus } from "../types";
import { COACH_SCHEMA, COACH_PROFILE, groundedSchema } from "./context";
export function loopbackURL(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  )
    throw Error("The AI address must be a local HTTP base address (loopback).");
  return url.origin;
}
export interface CoachProvider {
  health(): Promise<any>;
  models(): Promise<AIStatus["models"]>;
  load(): Promise<void>;
  unload(): Promise<void>;
  chat(
    messages: any[],
    onToken: (text: string) => void,
    signal: AbortSignal,
    outputSchema?: object,
  ): Promise<string>;
  shutdown(): Promise<void>;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export class LMStudioProvider implements CoachProvider {
  base: string;
  authHeaders: Record<string, string> = {};
  instance = "";
  ownedModel = false;
  ownedRuntime = false;
  generation: AbortController | null = null;
  loadPromise: Promise<void> | null = null;
  constructor(
    public settings: AISettings,
    public project: string,
    public report: (state: Partial<AIStatus>) => void,
    public ownership: (value: object) => void = () => {},
  ) {
    this.base = loopbackURL(settings.url);
  }
  async request(route: string, body?: object, timeout = 15000) {
    const r = await fetch(this.base + route, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
    if (!r.ok)
      throw Error(`LM Studio ${r.status}: ${(await r.text()).slice(0, 500)}`);
    return r.json() as Promise<any>;
  }
  cli(args: string[], timeout = 180000) {
    const binary =
      this.settings.runtime ||
      path.join(this.project, "runtime/lmstudio/bin/lms.exe");
    if (!existsSync(binary))
      throw Error("LM Studio is missing. Check the initial setup in Settings.");
    return new Promise<string>((resolve, reject) => {
      const child = spawn(binary, args, {
        windowsHide: true,
        env: { ...process.env, LMS_NO_MODIFY_PATH: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let text = "";
      child.stdout.on("data", (b) => {
        text += b.toString();
        this.report({
          message: b
            .toString()
            .replace(/\x1b\[[0-9;]*m/g, "")
            .slice(-300),
        });
      });
      child.stderr.on("data", (b) => (text += b.toString()));
      const timer = setTimeout(() => {
        child.kill();
        reject(Error("The LM Studio command timed out."));
      }, timeout);
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        code === 0
          ? resolve(text)
          : reject(Error(text.slice(-1500) || "LM Studio command failed"));
      });
    });
  }
  async start() {
    try {
      await this.health();
      return;
    } catch {}
    this.report({
      state: "starting",
      message: "Starting the local LM Studio service.",
    });
    const status = await this.cli(["daemon", "status", "--json"], 10000);
    const wasRunning = /"status"\s*:\s*"running"/.test(status);
    if (!wasRunning) {
      const wrapper = path.join(this.project, "scripts/runtime-hidden.js");
      if (!existsSync(wrapper))
        throw Error(
          "The hidden runtime launcher is missing. Run the project setup again.",
        );
      const child = spawn(
        path.join(
          process.env.SystemRoot || "C:/Windows",
          "System32/wscript.exe",
        ),
        ["//B", "//NoLogo", "//E:JScript", wrapper],
        { windowsHide: true, stdio: "ignore" },
      );
      child.on("error", (e) =>
        this.report({ state: "error", message: String(e) }),
      );
      child.unref();
      this.ownedRuntime = true;
      this.ownership({
        provider: "lmstudio",
        ownedRuntime: true,
        cli:
          this.settings.runtime ||
          path.join(this.project, "runtime/lmstudio/bin/lms.exe"),
        base: this.base,
      });
      let running = false;
      for (let i = 0; i < 60; i++) {
        try {
          const result = await this.cli(["daemon", "status", "--json"], 3000);
          if (/"status"\s*:\s*"running"/.test(result)) {
            running = true;
            break;
          }
        } catch {}
        await sleep(300);
      }
      if (!running)
        throw Error(
          "The hidden local runtime did not start. See data/runtime-logs.",
        );
    }
    await this.cli(
      [
        "server",
        "start",
        "--port",
        new URL(this.base).port || "12355",
        "--bind",
        "127.0.0.1",
      ],
      30000,
    );
    await this.health();
  }
  async health() {
    return this.request("/api/v1/models");
  }
  async load() {
    if (this.loadPromise) return this.loadPromise;
    if (this.instance) {
      const models = await this.health();
      if (
        models.models.some((m: any) =>
          (m.loaded_instances ?? []).some((i: any) => i.id === this.instance),
        )
      )
        return;
      this.instance = "";
      this.ownedModel = false;
    }
    this.loadPromise = this.loadInternal();
    try {
      await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }
  async models() {
    const data = await this.health();
    return (data.models ?? [])
      .filter((m: any) => m.type === "llm")
      .map((m: any) => ({
        id: m.key,
        vision: !!m.capabilities?.vision,
        loaded: !!m.loaded_instances?.length,
      }));
  }
  private async loadInternal() {
    await this.start();
    if (!this.settings.model)
      throw Error("Select a downloaded model in Settings.");
    const data = await this.health();
    const found = data.models?.find((m: any) => m.key === this.settings.model);
    if (!found)
      throw Error(
        "The selected model is not installed. Download it once in Settings.",
      );
    this.report({
      state: "loading",
      message: "Loading the local model. Replay remains available.",
    });
    const context =
      this.settings.profile === "light"
        ? Math.min(this.settings.context, 4096)
        : this.settings.context;
    const cli =
      this.settings.runtime ||
      path.join(this.project, "runtime/lmstudio/bin/lms.exe");
    if (existsSync(cli) && new URL(this.base).port === "12355") {
      this.instance = "xauusd-replay-" + randomUUID().slice(0, 12);
      this.ownedModel = true;
      this.ownership({
        provider: "lmstudio",
        ownedRuntime: this.ownedRuntime,
        ownedModel: true,
        instance: this.instance,
        cli,
        base: this.base,
      });
      await this.cli([
        "load",
        this.settings.model,
        "--identifier",
        this.instance,
        "--context-length",
        String(context),
        "--parallel",
        "1",
        "--gpu",
        this.settings.profile === "light" ? "0.25" : this.settings.gpu,
        "--ttl",
        String(this.settings.idleMinutes * 120),
      ]);
      this.ownedModel = true;
    } else {
      const before = new Set(
        data.models.flatMap((m: any) =>
          m.loaded_instances.map((i: any) => i.id),
        ),
      );
      if (found.loaded_instances?.length) {
        this.instance = found.loaded_instances[0].id;
        this.ownedModel = false;
      } else {
        const r = await this.request(
          "/api/v1/models/load",
          {
            model: this.settings.model,
            context_length: context,
            flash_attention: true,
            echo_load_config: true,
          },
          180000,
        );
        this.instance = r.instance_id;
        this.ownedModel = !before.has(this.instance);
      }
    }
    this.ownership({
      provider: "lmstudio",
      ownedRuntime: this.ownedRuntime,
      ownedModel: this.ownedModel,
      instance: this.instance,
      cli,
      base: this.base,
    });
    const ready = await this.health();
    const all = ready.models.flatMap((m: any) => m.loaded_instances ?? []);
    if (!all.some((i: any) => i.id === this.instance))
      throw Error("Could not confirm that the model is loaded.");
    this.report({
      state: "ready",
      message: this.ownedModel
        ? "Chart Assistant is ready."
        : "Using an already loaded shared model; other owners are preserved.",
      owned: this.ownedModel,
      models: await this.models(),
    });
  }
  async unload() {
    if (this.loadPromise) await this.loadPromise;
    if (this.instance && this.ownedModel) {
      this.report({
        state: "unloading",
        message: "Releasing model memory.",
      });
      const before = await this.health();
      if (
        before.models.some((m: any) =>
          (m.loaded_instances ?? []).some((i: any) => i.id === this.instance),
        )
      )
        await this.request(
          "/api/v1/models/unload",
          { instance_id: this.instance },
          45000,
        );
      const info = await this.health();
      if (
        info.models.some((m: any) =>
          (m.loaded_instances ?? []).some((i: any) => i.id === this.instance),
        )
      )
        throw Error("The model is still loaded; unloading is not confirmed.");
    }
    this.instance = "";
    this.ownedModel = false;
    this.report({
      state: "off",
      message: "AI unloaded. Conversations and model files are saved.",
      owned: false,
    });
    this.ownership({
      provider: "lmstudio",
      ownedRuntime: this.ownedRuntime,
      ownedModel: false,
      base: this.base,
      cli:
        this.settings.runtime ||
        path.join(this.project, "runtime/lmstudio/bin/lms.exe"),
    });
  }
  async chat(
    messages: any[],
    onToken: (text: string) => void,
    signal: AbortSignal,
    outputSchema?: object,
  ) {
    if (!this.instance) await this.load();
    let responseSchema: any = outputSchema ?? COACH_SCHEMA;
    if (this.settings.structured && !outputSchema) {
      try {
        const content = messages.at(-1).content;
        const raw =
          typeof content === "string"
            ? content
            : content.find((p: any) => p.type === "text").text;
        responseSchema = groundedSchema(JSON.parse(raw).snapshot);
      } catch {
        throw Error("Structured review requires a valid app snapshot.");
      }
    }
    const combined = AbortSignal.any([signal, AbortSignal.timeout(180000)]);
    const response = await fetch(this.base + "/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.authHeaders },
      signal: combined,
      body: JSON.stringify({
        model: this.instance,
        messages,
        stream: true,
        temperature:
          this.settings.provider === "managed" &&
          /9b/i.test(this.settings.model) &&
          !/fast/i.test(this.settings.model)
            ? 0.6
            : 0.3,
        max_tokens:
          this.settings.maxTokens +
          (this.settings.provider === "managed" &&
          /9b/i.test(this.settings.model) &&
          !/fast/i.test(this.settings.model)
            ? 768
            : 0),
        reasoning_effort:
          this.settings.provider === "managed" &&
          /9b/i.test(this.settings.model) &&
          !/fast/i.test(this.settings.model)
            ? "medium"
            : "none",
        chat_template_kwargs: {
          enable_thinking:
            this.settings.provider === "managed" &&
            /9b/i.test(this.settings.model) &&
            !/fast/i.test(this.settings.model),
        },
        ...(this.settings.structured || outputSchema
          ? {
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "coaching",
                  strict: true,
                  schema: responseSchema,
                },
              },
            }
          : {}),
      }),
    });
    if (!response.ok)
      throw Error(
        `Inference ${response.status}: ${(await response.text()).slice(0, 500)}`,
      );
    if (!response.body) throw Error("The AI returned an empty response.");
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let pending = "",
      all = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop()!;
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        const json = JSON.parse(payload);
        const text = json.choices?.[0]?.delta?.content ?? "";
        if (text) {
          all += text;
          onToken(text);
        }
      }
    }
    if (!all.trim())
      throw Error(
        "The model did not return any completed text. Try a smaller context or a larger response budget.",
      );
    return all;
  }
  async shutdown() {
    await this.unload();
    if (this.ownedRuntime) {
      const live = await this.health();
      const otherModels = (live.models ?? []).flatMap(
        (m: any) => m.loaded_instances ?? [],
      );
      if (otherModels.length) {
        this.report({
          message:
            "The app's model is unloaded. The runtime is being retained because another model is in use.",
        });
        this.ownedRuntime = false;
        this.ownership({
          ownedRuntime: false,
          ownedModel: false,
          reason: "independent models still loaded",
        });
        return;
      }
      await this.cli(["server", "stop"], 20000);
      await this.cli(["daemon", "down"], 30000);
      let stopped = false;
      for (let i = 0; i < 20; i++) {
        try {
          const status = await this.cli(["daemon", "status", "--json"], 3000);
          if (/not-running/.test(status)) {
            stopped = true;
            break;
          }
        } catch {}
        await sleep(200);
      }
      if (!stopped)
        throw Error("The app's AI process has not confirmed shutdown.");
      this.ownedRuntime = false;
      this.ownership({ ownedRuntime: false, ownedModel: false });
    }
  }
}
// A separate adapter boundary. Existing user-owned Ollama instances are never stopped.
export class OllamaProvider implements CoachProvider {
  base: string;
  owned = false;
  constructor(public settings: AISettings) {
    this.base = loopbackURL(settings.url);
  }
  async health() {
    const r = await fetch(this.base + "/api/tags", {
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw Error("Ollama is not responding.");
    return r.json() as Promise<any>;
  }
  async models() {
    return (await this.health()).models.map((m: any) => ({
      id: m.name,
      vision: false,
      loaded: false,
    }));
  }
  async load() {
    throw Error(
      "Ollama is a prepared adapter boundary. Select LM Studio for managed startup, unloading and image input.",
    );
  }
  async unload() {}
  async chat(): Promise<string> {
    throw Error("Select LM Studio for Chart Assistant in this version.");
  }
  async shutdown() {}
}
