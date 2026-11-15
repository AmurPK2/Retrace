import { DEFAULT_SPECS, type Specs } from "../types";
export type InstrumentId = "XAUUSD" | "EURAUD" | "NAS100" | "NQ";
export const INSTRUMENTS: Record<
  InstrumentId,
  {
    name: string;
    symbol: string;
    dataset: string;
    divisor: number;
    currency: string;
    unit: string;
    available: boolean;
    specs: Specs;
  }
> = {
  XAUUSD: {
    name: "Gold / US dollar",
    symbol: "XAUUSD",
    dataset: "dukascopy",
    divisor: 1000,
    currency: "USD",
    unit: "lot (100 oz)",
    available: true,
    specs: { ...DEFAULT_SPECS, currency: "USD", unit: "lot", tickSize: 0.001 },
  },
  EURAUD: {
    name: "Euro / Australian dollar",
    symbol: "EURAUD",
    dataset: "dukascopy:EURAUD",
    divisor: 100000,
    currency: "AUD",
    unit: "lot (100,000 EUR)",
    available: true,
    specs: {
      ...DEFAULT_SPECS,
      contract: 100000,
      leverage: 30,
      precision: 5,
      currency: "AUD",
      unit: "lot",
      tickSize: 0.00001,
    },
  },
  NAS100: {
    name: "US 100 Tech · Dukascopy CFD",
    symbol: "USATECHIDXUSD",
    dataset: "dukascopy:NAS100",
    divisor: 1000,
    currency: "USD",
    unit: "CFD unit ($1 / index point)",
    available: true,
    specs: {
      ...DEFAULT_SPECS,
      contract: 1,
      minLot: 1,
      lotStep: 1,
      leverage: 20,
      precision: 3,
      currency: "USD",
      unit: "CFD units",
      tickSize: 0.001,
    },
  },
  NQ: {
    name: "NQ futures · data required",
    symbol: "NQ",
    dataset: "NQ",
    divisor: 1,
    currency: "USD",
    unit: "contract ($20 / index point)",
    available: false,
    specs: {
      ...DEFAULT_SPECS,
      contract: 20,
      minLot: 1,
      lotStep: 1,
      leverage: 1,
      precision: 2,
      currency: "USD",
      unit: "contracts",
      tickSize: 0.25,
    },
  },
};
export function instrumentForDataset(dataset: string): InstrumentId {
  return (
    (Object.keys(INSTRUMENTS) as InstrumentId[]).find(
      (k) => INSTRUMENTS[k].dataset === dataset,
    ) ?? "XAUUSD"
  );
}
function ny(t: number) {
  const a = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(t)
      .map((p) => [p.type, p.value]),
  );
  return { day: a.weekday, min: Number(a.hour) * 60 + Number(a.minute) };
}
export function marketClosed(t: number, id: InstrumentId) {
  const { day, min } = ny(t);
  const reopen = id === "EURAUD" ? 17 * 60 : 18 * 60;
  const close = id === "NAS100" ? 16 * 60 + 15 : 17 * 60;
  return (
    day === "Sat" ||
    (day === "Fri" && min >= close) ||
    (day === "Sun" && min < reopen) ||
    (id !== "EURAUD" && min >= close && min < reopen)
  );
}
export function closedHour(hour: number, id: InstrumentId) {
  return marketClosed(hour, id) && marketClosed(hour + 3599999, id);
}
export function openGapMillis(from: number, to: number, id: InstrumentId) {
  let open = 0;
  for (let t = from; t < to;) {
    const next = Math.min(to, (Math.floor(t / 60000) + 1) * 60000);
    if (!marketClosed(t, id)) open += next - t;
    t = next;
  }
  return open;
}
