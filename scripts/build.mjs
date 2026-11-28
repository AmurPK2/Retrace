import { build } from "esbuild";
import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
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

// Expose only the phone entry and its actual dependencies to the private gateway.
const phoneManifest=JSON.parse(readFileSync('dist/.vite/manifest.json','utf8'));
const phoneFiles=new Set(),phoneVisited=new Set();
function phoneEntry(key){if(phoneVisited.has(key))return;phoneVisited.add(key);const entry=phoneManifest[key];if(!entry)throw Error('Missing phone manifest dependency');phoneFiles.add('/'+entry.file);for(const file of [...(entry.css??[]),...(entry.assets??[])])phoneFiles.add('/'+file);for(const key of entry.imports??[])phoneEntry(key);}
phoneEntry('phone.html');writeFileSync('dist/phone-assets.json',JSON.stringify([...phoneFiles]));
