import type { Session } from "../types";

export type DiscordSettings = {
  enabled: boolean;
  applicationId: string;
  imageKey: string;
};
export const DEFAULT_DISCORD: DiscordSettings = {
  enabled: true,
  applicationId: "1570985832955908156",
  imageKey: "retrace_rt",
};
export function discordSettings(value: unknown): DiscordSettings {
  const v = value as Partial<DiscordSettings> | null;
  const applicationId = String(v?.applicationId ?? "").trim();
  const imageKey = String(v?.imageKey ?? "retrace").trim();
  if (applicationId && !/^\d{17,20}$/.test(applicationId))
    throw Error("Use the Application ID from Discord Developer Portal (digits only).");
  if (imageKey && !/^[a-z0-9_-]{1,64}$/.test(imageKey))
    throw Error("Use the image asset name, for example retrace.");
  return { enabled: v?.enabled === true, applicationId, imageKey };
}
export function tradesTaken(session: Session) {
  return new Set([
    ...session.broker.positions.filter(p => p.opened <= session.tick.t).map(p => p.id),
    ...session.broker.fills.filter(f => f.opened <= session.tick.t && f.closed <= session.tick.t).map(f => f.positionId),
  ]).size;
}
export function completedWins(session: Session) {
  const open = new Set(session.broker.positions.filter(p => p.opened <= session.tick.t).map(p => p.id));
  const netCents = new Map<string, number>();
  const seen = new Set<string>();
  for (const fill of session.broker.fills) {
    if (fill.opened > session.tick.t || fill.closed > session.tick.t || seen.has(fill.id)) continue;
    seen.add(fill.id);
    netCents.set(fill.positionId, (netCents.get(fill.positionId) ?? 0) + Math.round(fill.net * 100));
  }
  return [...netCents].filter(([id, cents]) => !open.has(id) && cents > 0).length;
}
export function discordActivity(session: Session | null, _startedAt: number, imageKey: string) {
  return {
    details: session ? "Balance: $" + session.broker.balance.toFixed(2) : "Balance: —",
    state: "Wins: " + (session ? completedWins(session) : 0),
    ...(imageKey ? { assets: { large_image: imageKey, large_text: "RETRACE" } } : {}),
    buttons: [{ label: "Check out the project", url: "https://github.com/AmurPK2/Retrace" }],
    instance: false,
  };
}
