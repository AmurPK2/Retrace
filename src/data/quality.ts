import {
  instrumentForDataset,
  openGapMillis,
  closedHour,
} from "../core/instruments";
import type { InstrumentId } from "../core/instruments";
import type { Tick } from "../types";
import type { Store } from "./store";
const HOUR = 3600000;
// Conservative quality threshold, not a claim that a quiet feed had trades.
export function tickGaps(
  ticks: Tick[],
  hour: number,
  instrument: InstrumentId,
) {
  const points = [hour, ...ticks.map((q) => q.t), hour + HOUR];
  return points.flatMap((to, i) =>
    i &&
    to - points[i - 1] > 300000 &&
    openGapMillis(points[i - 1], to, instrument) > 300000
      ? [{ from: points[i - 1], to }]
      : [],
  );
}
export type DataQuality = {
  status: "sufficient" | "insufficient";
  from: number;
  cutoff: number;
  checkedHours: number;
  knownClosedHours: number;
  issues: { from: number; to: number; reason: string }[];
  scope: string;
};
export function dataQuality(
  store: Store,
  dataset: string,
  from: number,
  cutoff: number,
): DataQuality {
  const quality: DataQuality = {
    status: "sufficient",
    from,
    cutoff,
    checkedHours: 0,
    knownClosedHours: 0,
    issues: [],
    scope:
      "Only supplied decision-time evidence; no claim about full dataset coverage.",
  };
  const instrument = instrumentForDataset(dataset);
  const issue = (a: number, b: number, reason: string) =>
    quality.issues.push({
      from: Math.max(a, from),
      to: Math.min(b, cutoff),
      reason,
    });
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(cutoff) ||
    from > cutoff ||
    cutoff - from > 90 * 86400000
  ) {
    quality.status = "insufficient";
    quality.issues = [
      { from, to: cutoff, reason: "Invalid or excessive evidence window" },
    ];
    return quality;
  }
  for (let h = Math.floor(from / HOUR) * HOUR; h <= cutoff; h += HOUR) {
    quality.checkedHours++;
    const c = store.chunk(dataset, h);
    if (c?.status === "closure") {
      // Imported CSV has an explicitly labelled simulator schedule, never holiday proof.
      if (closedHour(h, instrument)) {
        quality.knownClosedHours++;
        continue;
      }
      issue(h, h + HOUR, "Unverified closure metadata");
      continue;
    }
    if (!c || c.status !== "ready") {
      issue(h, h + HOUR, "Missing or incomplete tick hour");
      continue;
    }
    try {
      const ticks = store.readTicks(c),
        meta = JSON.parse(c.provenance || "{}");
      if (meta.invalid > 0)
        issue(h, h + HOUR, "Source contained invalid ticks");
      // Recompute edges too: older imports only recorded gaps between adjacent ticks.
      for (const g of tickGaps(ticks, h, instrument)) {
        const end = Math.min(g.to, cutoff),
          begin = Math.max(g.from, from);
        if (end > begin && openGapMillis(begin, end, instrument) > 300000)
          issue(begin, end, "Unverified open-market tick gap");
      }
    } catch {
      issue(h, h + HOUR, "Corrupt tick cache or provenance");
    }
  }
  quality.status = quality.issues.length ? "insufficient" : "sufficient";
  return quality;
}
