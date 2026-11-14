import { build } from "esbuild";
import { mkdirSync, copyFileSync } from "node:fs";
mkdirSync("dist-electron", { recursive: true });
await build({
  entryPoints: ["electron/main.ts"],
  outfile: "dist-electron/main.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  sourcemap: true,
});
await build({
  entryPoints: ["electron/preload.ts"],
  outfile: "dist-electron/preload.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
});
await build({
  entryPoints: ["electron/worker.ts"],
  outfile: "dist-electron/worker.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["node:sqlite"],
  sourcemap: true,
});
await build({
  entryPoints: ["electron/watchdog.ts"],
  outfile: "dist-electron/watchdog.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
});
await build({
  entryPoints: ["electron/import-worker.ts"],
  outfile: "dist-electron/import-worker.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["node:sqlite"],
});

await build({entryPoints:["electron/managed-host.ts"],outfile:"dist-electron/managed-host.cjs",bundle:true,platform:"node",format:"cjs"});
