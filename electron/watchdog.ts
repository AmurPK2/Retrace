import { readFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
const parent = Number(process.argv[2]),
  root = process.argv[3];
let finished = false,
  cleaning = false;
const log = (event: string, detail: object = {}) => {
  try {
    appendFileSync(
      path.join(root, "watchdog.log"),
      JSON.stringify({
        at: Date.now(),
        event,
        parent,
        pid: process.pid,
        ...detail,
      }) + "\n",
    );
  } catch {}
};
log("ready");
process.on("message", (m) => {
  if ((m as any).type === "finished") {
    finished = true;
    log("normal-finished");
    process.exit(0);
  }
});
async function cleanup() {
  if (cleaning) return;
  cleaning = true;
  log("parent-gone");
  try {
    const owned = JSON.parse(
      readFileSync(path.join(root, "runtime-ownership.json"), "utf8"),
    );
    if (owned.parentPid !== parent) {
      log("ownership-changed");
      return;
    }
    if (owned.provider === "managed") {
      log("managed-host-owns-child");
      return;
    }
    if (
      owned.ownedModel &&
      owned.instance &&
      /^http:\/\/127\.0\.0\.1:\d+$/.test(owned.base)
    ) {
      const result = await fetch(owned.base + "/api/v1/models/unload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instance_id: owned.instance }),
        signal: AbortSignal.timeout(30000),
      });
      if (!result.ok) throw Error("Model unload returned " + result.status);
      log("unload-requested", { instance: owned.instance });
    }
    if (
      owned.ownedRuntime &&
      owned.cli &&
      path
        .resolve(owned.cli)
        .startsWith(path.resolve(root, "../runtime") + path.sep)
    ) {
      const health = (await fetch(owned.base + "/api/v1/models", {
        signal: AbortSignal.timeout(5000),
      }).then((r) => r.json())) as any;
      if (
        (health.models ?? []).some((m: any) =>
          (m.loaded_instances ?? []).some((i: any) => i.id !== owned.instance),
        )
      ) {
        log("shared-runtime-preserved");
        return;
      }
      await new Promise<void>((resolve) => {
        const child = spawn(owned.cli, ["daemon", "down"], {
          windowsHide: true,
          stdio: "ignore",
        });
        child.on("exit", () => resolve());
        child.on("error", () => resolve());
        setTimeout(() => {
          child.kill();
          resolve();
        }, 30000).unref();
      });
      log("runtime-stop-finished");
    }
  } catch (e) {
    log("cleanup-error", { error: String(e) });
  } finally {
    process.exit(0);
  }
}
setInterval(() => {
  if (finished) return;
  try {
    process.kill(parent, 0);
  } catch {
    void cleanup();
  }
}, 1500);
