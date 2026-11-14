import type { Bar, Indicator } from "../types";
import { zonedParts } from "./bars";
export type Level = {
  price: number;
  label: string;
  cutoff: number;
  complete: boolean;
};
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const localDate = (t: number, zone: string) => {
  if (!dateFormatters.has(zone))
    dateFormatters.set(
      zone,
      new Intl.DateTimeFormat("sv-SE", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    );
  return dateFormatters.get(zone)!.format(t);
};
export function calculateLevels(
  bars: Bar[],
  cutoff: number,
  zone: string,
  indicators: Indicator[],
  completeDay: (day: number) => boolean = () => true,
): Level[] {
  const levels: Level[] = [],
    midnight = Math.floor(cutoff / 86400000) * 86400000;
  const previous = bars.filter((b) => b.time * 1000 < midnight);
  if (
    indicators.some((i) => i.kind === "previous" && i.enabled) &&
    previous.length
  ) {
    const day = Math.floor(previous.at(-1)!.time / 86400) * 86400000;
    const selected = previous.filter((b) => b.time * 1000 >= day);
    const complete = completeDay(day);
    levels.push(
      {
        price: Math.max(...selected.map((b) => b.high)),
        label: complete ? "PDH" : "PDH · incomplete",
        cutoff,
        complete,
      },
      {
        price: Math.min(...selected.map((b) => b.low)),
        label: complete ? "PDL" : "PDL · incomplete",
        cutoff,
        complete,
      },
    );
  }
  const asian = indicators.find((i) => i.kind === "asian" && i.enabled);
  if (asian) {
    const start = asian.start ?? 0,
      end = asian.end ?? 6,
      today = localDate(cutoff, zone),
      prevDate = new Date(Date.parse(today + "T00:00:00Z") - 86400000)
        .toISOString()
        .slice(0, 10);
    const currentHour = zonedParts(cutoff, zone).hour;
    const selected = bars.filter((b) => {
      const date = localDate(b.time * 1000, zone),
        hour = zonedParts(b.time * 1000, zone).hour;
      if (start < end) return date === today && hour >= start && hour < end;
      if (currentHour >= start) return date === today && hour >= start;
      return (
        (date === prevDate && hour >= start) || (date === today && hour < end)
      );
    });
    if (selected.length)
      levels.push(
        {
          price: Math.max(...selected.map((b) => b.high)),
          label: "Asia H",
          cutoff,
          complete: true,
        },
        {
          price: Math.min(...selected.map((b) => b.low)),
          label: "Asia L",
          cutoff,
          complete: true,
        },
      );
  }
  return levels;
}
