import { spawn } from "node:child_process";
import { build } from "esbuild";
await import("./build.mjs");
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
  windowsHide: true,
  stdio: "inherit",
});
await new Promise((r) => setTimeout(r, 1500));
const { default: electron } = await import("electron");
const app = spawn(electron, ["."], {
  windowsHide: true,
  stdio: "inherit",
  env: { ...process.env, XAU_REPLAY_DEV: "1" },
});
app.on("exit", () => vite.kill());
process.on("SIGINT", () => {
  app.kill();
  vite.kill();
});
