import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Store } from "../src/data/store";
import { Importer } from "../src/data/importer";
import { dataQuality } from "../src/data/quality";
const evidence = path.resolve(
  process.env.RETRACE_COACH_EVIDENCE ?? "artifacts/coach-evaluation",
);
const root = path.join(evidence, "data-profile");
mkdirSync(root, { recursive: true });
const store = new Store(root);
const hour = Date.UTC(2026, 0, 14, 12),
  importer = new Importer(store);
const deadline = setTimeout(() => importer.stop(), 45000);
try {
  await importer.range(hour, hour + 3600000);
  const c = store.chunk("dukascopy", hour)!;
  if (c.status !== "ready")
    throw Error("Original source unavailable: " + c.provenance);
  const original = store.readTicks(c),
    source = JSON.parse(c.provenance);
  writeFileSync(c.path, "deliberately damaged isolated test cache");
  let network = 0;
  importer.fetch = async () => {
    network++;
    throw Error("Recovery must use verified original bytes");
  };
  await importer.range(hour, hour + 3600000);
  const fixed = store.chunk("dukascopy", hour)!,
    restored = store.readTicks(fixed);
  const report = {
    sourceUrl: source.url,
    sourceSha256: source.sourceSha256,
    sourceBytes: c.bytes,
    ticks: restored.length,
    sameTicks: JSON.stringify(original) === JSON.stringify(restored),
    sameStoredSHA: c.sha === fixed.sha,
    recoveryNetworkCalls: network,
    recoveredSource: JSON.parse(fixed.provenance).recoveredSource,
    quality: dataQuality(store, "dukascopy", hour, restored.at(-1)!.t),
  };
  writeFileSync(
    path.join(evidence, "real-source-recovery.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} catch (error) {
  writeFileSync(
    path.join(evidence, "real-source-recovery.json"),
    JSON.stringify(
      {
        status: "unavailable",
        error: String(error),
        note: "No original public source file was obtained; original-byte recovery is verified by isolated fixtures only.",
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  clearTimeout(deadline);
  store.close();
}
