import type { OrderDraft } from "./order-draft";
import type { Specs } from "../types";
export function draftIssues(d: OrderDraft, spec: Specs): string[] {
  const issues: string[] = [];
  if (!Number.isFinite(d.entry) || d.entry <= 0)
    issues.push("Enter a positive entry price.");
  if (
    !Number.isFinite(d.lots) ||
    d.lots < spec.minLot ||
    Math.abs(d.lots / spec.lotStep - Math.round(d.lots / spec.lotStep)) > 1e-8
  )
    issues.push(
      "Size must be at least " +
        spec.minLot +
        " in steps of " +
        spec.lotStep +
        ".",
    );
  for (const key of ["sl", "tp"] as const) {
    const price = d[key];
    if (price === undefined) continue;
    const below = d.side === "buy" ? key === "sl" : key === "tp";
    if (
      !Number.isFinite(price) ||
      price <= 0 ||
      (below ? price >= d.entry : price <= d.entry)
    )
      issues.push(
        key.toUpperCase() +
          " must be " +
          (below ? "below" : "above") +
          " ENTRY for " +
          d.side.toUpperCase() +
          ". Your selected price has been kept.",
      );
  }
  return issues;
}
export function combinedPlanRisk(
  plans: { id: string; entry: number; sl?: number; lots: number }[],
  spec: Specs,
) {
  const unique = [...new Map(plans.map((p) => [p.id, p])).values()];
  if (unique.some((p) => p.sl === undefined)) return null;
  return unique.reduce(
    (n, p) =>
      n +
      (Math.abs(p.entry - p.sl!) * spec.contract +
        2 * spec.commission +
        2 * spec.slippage * spec.contract) *
        p.lots,
    0,
  );
}

export function planEvidence(
  s: import("../types").Session,
  proposal?: Record<string, unknown>,
) {
  const executed = [...s.broker.pending, ...s.broker.positions];
  const linked = new Set(
    [...executed, ...s.broker.fills].map((p) => p.planId).filter(Boolean),
  );
  if (proposal?.planId) linked.add(String(proposal.planId));
  const entries: {
    id: string;
    setupId?: string;
    source: string;
    side: "buy" | "sell";
    kind: "limit";
    entry: number;
    sl?: number;
    tp?: number;
    lots: number;
  }[] = [];
  for (const p of executed)
    entries.push({
      id: p.id,
      setupId: p.setupId,
      source: "entry" in p ? "open position" : "pending order",
      side: p.side,
      kind: "limit",
      entry: "entry" in p ? Number(p.entry) : p.price!,
      sl: p.sl,
      tp: p.tp,
      lots: p.lots,
    });
  for (const d of s.drawings.filter(
    (d) =>
      (d.kind === "long" || d.kind === "short") &&
      !d.hidden &&
      !linked.has(d.id),
  ))
    entries.push({
      id: d.id,
      source: "drawing plan",
      side: d.kind === "long" ? "buy" : "sell",
      kind: "limit",
      entry: d.a.price,
      sl: d.b.price,
      tp: d.target ?? d.a.price + 2 * (d.a.price - d.b.price),
      lots: d.lots ?? s.broker.specs.minLot,
    });
  if (proposal && typeof proposal.entry === "number")
    entries.push({
      id: "draft",
      setupId:
        typeof proposal.setupId === "string" ? proposal.setupId : undefined,
      source: "unplaced draft",
      side: proposal.side === "sell" ? "sell" : "buy",
      kind: "limit",
      entry: proposal.entry,
      sl: typeof proposal.sl === "number" ? proposal.sl : undefined,
      tp: typeof proposal.tp === "number" ? proposal.tp : undefined,
      lots: Number(proposal.lots),
    });
  const facts = entries.map((p) => {
    const risk = combinedPlanRisk([p], s.broker.specs);
    const reward =
      p.tp === undefined
        ? null
        : Math.abs(p.tp - p.entry) * p.lots * s.broker.specs.contract -
          2 *
            p.lots *
            (s.broker.specs.commission +
              s.broker.specs.slippage * s.broker.specs.contract);
    const issues = draftIssues(p, s.broker.specs);
    return {
      ...p,
      geometry: issues.length ? "invalid" : "valid",
      slRelation:
        p.sl === undefined
          ? "missing"
          : p.sl < p.entry
            ? "below entry"
            : "above entry",
      tpRelation:
        p.tp === undefined
          ? "missing"
          : p.tp > p.entry
            ? "above entry"
            : "below entry",
      risk: risk === null ? null : Math.round(risk * 100) / 100,
      reward: reward === null ? null : Math.round(reward * 100) / 100,
      rr:
        !issues.length && risk && reward !== null
          ? Math.round((reward / risk) * 100) / 100
          : null,
      issues,
    };
  });
  return {
    entries: facts,
    combinedRisk: combinedPlanRisk(entries, s.broker.specs),
    currency: s.broker.specs.currency ?? "USD",
    note: "One actual pending/open entry or unplaced plan per ID; linked drawings are excluded to avoid counting the same entry twice. Closed trades do not add current risk.",
  };
}
