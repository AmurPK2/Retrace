import { spawn, type ChildProcess } from "node:child_process";
const parent = Number(process.argv[2]);
let child: ChildProcess | null = null,
  stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill();
    await Promise.race([
      new Promise<void>((r) => child!.once("exit", () => r())),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  }
  process.exit(0);
}
process.on("message", (value: any) => {
  if (value?.type === "stop") {
    void stop();
    return;
  }
  if (value?.type !== "start" || child || stopping) return;
  child = spawn(String(value.binary), value.args, {
    windowsHide: true,
    cwd: String(value.cwd),
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (b) => process.stdout.write(b));
  child.stderr?.on("data", (b) => process.stderr.write(b));
  child.on("error", (e) => {
    process.stderr.write(String(e));
    process.exit(1);
  });
  child.on("exit", (code) => {
    if (!stopping) process.exit(code ?? 1);
  });
  process.send?.({ type: "started", pid: child.pid });
});
process.on("disconnect", () => void stop());
setInterval(() => {
  try {
    process.kill(parent, 0);
  } catch {
    void stop();
  }
}, 1000).unref();
