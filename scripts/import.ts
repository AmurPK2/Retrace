import { Store } from "../src/data/store";
import { Importer } from "../src/data/importer";
const args = process.argv.slice(2);
const value = (k: string) => args[args.indexOf(k) + 1];
const root = args.includes("--storage")
  ? value("--storage")
  : "F:/Projects/xauusd-replay/data";
const store = new Store(root);
let last = 0;
const importer = new Importer(store, (p) => {
  if (Date.now() - last > 2000 || !p.running) {
    console.log(JSON.stringify(p));
    last = Date.now();
  }
});
process.on("SIGINT", () => importer.stop());
try {
  if (args.includes("--year")) await importer.year();
  else {
    if (!args.includes("--from") || !args.includes("--to"))
      throw Error(
        "Usage: npm run import:range -- --from 2026-11-02 --to 2026-11-07 [--storage F:/...]",
      );
    await importer.range(
      Date.parse(value("--from")),
      Date.parse(value("--to")),
    );
  }
} finally {
  store.close();
}
