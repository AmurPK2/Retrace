import { spawn, type ChildProcess } from "node:child_process";
import { availableParallelism } from "node:os";
import { createServer } from "node:net";
import path from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { LMStudioProvider } from "./provider";
import {
  verifiedDownload,
  extractRuntime,
  fileHash,
  type DownloadSpec,
} from "./managed-download";
import manifest from "./managed-manifest.json";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
export class ManagedLocalProvider extends LMStudioProvider {
  private child: ChildProcess | null = null;
  private setup: AbortController | null = null;
  private closed = false;
  private async runtime(kind: "cpu" | "vulkan", signal: AbortSignal) {
    const spec = manifest.runtime[kind];
    const zip = path.join(this.project, "downloads", spec.name);
    await verifiedDownload(
      spec,
      zip,
      (m) => this.report({ state: "starting", message: m }),
      signal,
    );
    const folder = path.join(
      this.project,
      "runtime",
      manifest.runtime.release,
      kind,
    );
    const receipt = path.join(folder, "ready.json");
    try {
      const saved = JSON.parse(readFileSync(receipt, "utf8"));
      const base = path.resolve(folder) + path.sep;
      if (
        saved.zip === spec.sha256 &&
        path.resolve(saved.server).startsWith(base) &&
        existsSync(saved.server) &&
        (await fileHash(saved.server)) === saved.sha256
      )
        return saved.server as string;
    } catch {}
    const server = await extractRuntime(zip, folder);
    writeFileSync(
      receipt,
      JSON.stringify({
        zip: spec.sha256,
        server,
        sha256: await fileHash(server),
      }),
    );
    return server;
  }
  async health() {
    const r = await fetch(this.base + "/health", {
      headers: this.authHeaders,
      signal: AbortSignal.timeout(1500),
    });
    if (!r.ok) throw Error("The local chart coach is still loading.");
    return r.json();
  }
  async models() {
    return [
      {
        id: this.settings.model || "qwen3.5-4b",
        vision: true,
        loaded: !!this.instance,
      },
    ];
  }
  async load() {
    if (this.closed) throw Error("Local AI has been shut down.");
    if (this.child && this.instance) {
      try {
        await this.health();
        return;
      } catch {
        await this.stopChild();
      }
    }
    if (this.loadPromise) return this.loadPromise;
    this.setup = new AbortController();
    this.loadPromise = this.prepare(this.setup.signal);
    try {
      await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }
  private async prepare(signal: AbortSignal) {
    if (process.platform !== "win32" || process.arch !== "x64")
      throw Error(
        "Automatic AI currently supports Windows x64. Replay works independently.",
      );
    this.report({
      state: "starting",
      message:
        "Preparing your local chart coach automatically. First download is about " +
        (/9b/i.test(this.settings.model) ? "6.6" : "3.4") +
        " GB. Replay stays available.",
    });
    const selectedManifest = /9b/i.test(this.settings.model)
      ? manifest.quality
      : manifest;
    const models: string[] = [];
    for (const spec of selectedManifest.models as DownloadSpec[])
      models.push(
        await verifiedDownload(
          spec,
          path.join(this.project, "models", spec.name),
          (m) => this.report({ state: "starting", message: m }),
          signal,
        ),
      );
    let failure: unknown;
    const choices: ("vulkan" | "cpu")[] =
      this.settings.gpu === "off" ? ["cpu"] : ["vulkan", "cpu"];
    for (const kind of choices) {
      signal.throwIfAborted();
      try {
        const binary = await this.runtime(kind, signal);
        const port = await new Promise<number>((resolve, reject) => {
          const s = createServer();
          s.once("error", reject);
          s.listen(0, "127.0.0.1", () => {
            const value = (s.address() as any).port;
            s.close(() => resolve(value));
          });
        });
        this.base = "http://127.0.0.1:" + port;
        this.authHeaders = {
          Authorization: "Bearer " + randomBytes(32).toString("hex"),
        };
        const key = this.authHeaders.Authorization.slice(7);
        this.report({
          state: "loading",
          message:
            "Loading chart vision locally · " +
            (kind === "vulkan" ? "automatic GPU" : "CPU fallback") +
            ". No chart leaves this PC.",
        });
        const args = [
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
          "--api-key",
          key,
          "--model",
          models[0],
          "--mmproj",
          models[1],
          "--alias",
          "retrace-coach",
          "--ctx-size",
          String(Math.max(8192, this.settings.context)),
          "--parallel",
          "1",
          "--threads",
          String(Math.min(6, Math.max(2, availableParallelism() - 2))),
          "--n-gpu-layers",
          kind === "vulkan" ? "99" : "0",
          "--no-webui",
          "--reasoning",
          /9b/i.test(this.settings.model) && !/fast/i.test(this.settings.model)
            ? "on"
            : "off",
          "--reasoning-budget",
          /9b/i.test(this.settings.model) && !/fast/i.test(this.settings.model)
            ? "768"
            : "0",
          "--image-max-tokens",
          "1024",
        ];
        const host = path.join(
          typeof __dirname === "string"
            ? __dirname
            : path.resolve("dist-electron"),
          "managed-host.cjs",
        );
        if (!existsSync(host))
          throw Error("The local AI lifecycle host is missing.");
        const child = spawn(process.execPath, [host, String(process.pid)], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe", "ipc"],
        });
        child.send({ type: "start", binary, args, cwd: path.dirname(binary) });
        this.child = child;
        let exited = false,
          exitMessage = "";
        child.stdout?.resume();
        child.stderr?.on("data", (b) => {
          exitMessage = (exitMessage + b.toString())
            .slice(-1200)
            .split(key)
            .join("[redacted]");
        });
        child.on("error", (e) => {
          exited = true;
          exitMessage = String(e);
        });
        child.on("exit", () => {
          exited = true;
        });
        const until = Date.now() + 240000;
        while (Date.now() < until) {
          signal.throwIfAborted();
          if (exited)
            throw Error(
              "Local runtime could not start: " + exitMessage.slice(-400),
            );
          try {
            await this.health();
            this.instance = "retrace-coach";
            this.ownedModel = true;
            this.ownedRuntime = true;
            this.ownership({
              provider: "managed",
              ownedModel: true,
              ownedRuntime: true,
              runtimePid: child.pid,
              binary,
              base: this.base,
            });
            this.report({
              state: "ready",
              owned: true,
              message: "Chart coach ready · local vision · " + kind,
            });
            return;
          } catch {}
          await delay(300);
        }
        throw Error("Local AI loading timed out.");
      } catch (e) {
        failure = e;
        await this.stopChild();
        if (signal.aborted) throw e;
        this.report({
          state: "starting",
          message: "Trying the compatible CPU runtime…",
        });
      }
    }
    throw failure;
  }
  private async stopChild() {
    const child = this.child;
    this.child = null;
    this.instance = "";
    if (child && child.exitCode === null && child.signalCode === null) {
      if (child.connected) child.send({ type: "stop" });
      await Promise.race([
        new Promise<void>((r) => child.once("exit", () => r())),
        delay(3000),
      ]);
      if (child.exitCode === null && child.signalCode === null)
        throw Error("The app-owned local AI process has not stopped.");
    }
    this.ownedModel = false;
    this.ownedRuntime = false;
    this.ownership({
      provider: "managed",
      ownedModel: false,
      ownedRuntime: false,
    });
  }
  async unload() {
    this.setup?.abort();
    if (this.loadPromise) await this.loadPromise.catch(() => {});
    await this.stopChild();
  }
  async shutdown() {
    this.closed = true;
    await this.unload();
  }
}
