import { parentPort, workerData } from "node:worker_threads";
import { Store } from "../src/data/store";
import { Importer } from "../src/data/importer";
import { importCSV } from "../src/data/csv";
const store = new Store(workerData.root);
const importer = new Importer(store, (p) =>
  parentPort!.postMessage({ type: "progress", value: p }),
);
parentPort!.on("message", (m) => {
  if (m.type === "stop") importer.stop();
});
void (async () => {
  try {
    let result;
    if (workerData.csv)
      result = await importCSV(
        store,
        workerData.csv,
        workerData.mapping,
        (p) => parentPort!.postMessage({ type: "progress", value: p }),
        () => importer.paused,
      );
    else if (workerData.starter) {
      const end = await importer.latestCompleteDay() + 86400000;
      result = await importer.range(end - 8 * 86400000, end, { replayFrom: end - 6 * 86400000, replayTo: end, warmupDays: 2 });
    } else
      result = workerData.year
        ? await importer.year()
        : await importer.range(workerData.from, workerData.to);
    parentPort!.postMessage({ type: "done", value: result });
  } catch (e) {
    parentPort!.postMessage({ type: "error", error: String(e) });
  } finally {
    store.close();
    parentPort!.close();
  }
})();
