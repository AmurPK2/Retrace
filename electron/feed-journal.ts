import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
export const TELEGRAM_GROUPS: Record<string, string> = {};
export type FeedGroup = string;
export function configureFeedGroups(groups: Record<string, string>) {
  for (const k of Object.keys(TELEGRAM_GROUPS)) delete TELEGRAM_GROUPS[k];
  Object.assign(TELEGRAM_GROUPS, groups);
}
const message = z.object({
  id: z.number().int().positive(),
  text: z.string().max(6000),
  time: z.number().finite(),
  editedAt: z.number().finite().nullable(),
  hasMedia: z.boolean(),
  outgoing: z.boolean().optional(),
});
const frame = z.object({
  group: z.string().refine((g) => Object.hasOwn(TELEGRAM_GROUPS, g)),
  pts: z.number().int().positive(),
  at: z.number().finite(),
  seed: z.boolean().optional(),
  gap: z.boolean().optional(),
  changes: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.enum(["new", "edit", "seed"]), message }),
        z.object({
          kind: z.literal("delete"),
          id: z.number().int().positive(),
        }),
      ]),
    )
    .max(1000),
});
export class FeedJournal {
  readonly db: DatabaseSync;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS states(group_id TEXT PRIMARY KEY,pts INTEGER,seen INTEGER DEFAULT 0,gap INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS messages(group_id TEXT,id INTEGER,payload TEXT,PRIMARY KEY(group_id,id));
    CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,group_id TEXT,message_id INTEGER,kind TEXT,at INTEGER,previous TEXT,payload TEXT);
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT);`);
  }
  close() {
    this.db.close();
  }
  identity(value?: string) {
    const old = String(
      this.db.prepare("SELECT value FROM meta WHERE key='owner'").get()
        ?.value ?? "",
    );
    if (value) {
      if (!/^[a-f0-9]{64}$/.test(value) || (old && old !== value))
        throw Error("Telegram owner identity mismatch");
      this.db
        .prepare("INSERT OR IGNORE INTO meta VALUES('owner',?)")
        .run(value);
    }
    return old || value || "";
  }
  cursors() {
    return Object.fromEntries(
      this.db
        .prepare("SELECT group_id,pts FROM states")
        .all()
        .map((r) => [String(r.group_id), Number(r.pts)]),
    );
  }
  apply(value: unknown) {
    const f = frame.parse(value),
      old = this.cursors()[f.group] ?? 0;
    if (f.pts <= old) return false;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const change of f.changes) {
        const id = change.kind === "delete" ? change.id : change.message.id;
        const row = this.db
          .prepare("SELECT payload FROM messages WHERE group_id=? AND id=?")
          .get(f.group, id);
        const prior = row ? JSON.parse(String(row.payload)) : null;
        const next =
          change.kind === "delete"
            ? prior
              ? { ...prior, deletedAt: f.at }
              : null
            : change.message;
        if (!next || JSON.stringify(next) === JSON.stringify(prior)) continue;
        this.db
          .prepare("INSERT OR REPLACE INTO messages VALUES(?,?,?)")
          .run(f.group, id, JSON.stringify(next));
        if (!f.seed && change.kind !== "seed")
          this.db
            .prepare(
              "INSERT INTO events(group_id,message_id,kind,at,previous,payload) VALUES(?,?,?,?,?,?)",
            )
            .run(
              f.group,
              id,
              change.kind === "delete"
                ? "deleted"
                : change.kind === "edit"
                  ? "edited"
                  : next.outgoing
                    ? "sent"
                    : "new",
              f.at,
              prior ? JSON.stringify(prior) : null,
              JSON.stringify(next),
            );
      }
      this.db
        .prepare(
          "INSERT INTO states(group_id,pts,gap) VALUES(?,?,?) ON CONFLICT(group_id) DO UPDATE SET pts=excluded.pts,gap=excluded.gap",
        )
        .run(f.group, f.pts, f.gap ? 1 : 0);
      this.db.exec("COMMIT");
      return true;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  unread() {
    return (
      (this.db
        .prepare(
          "SELECT count(*) AS n FROM events e LEFT JOIN states s ON s.group_id=e.group_id WHERE e.seq>coalesce(s.seen,0)",
        )
        .get()?.n as number) ?? 0
    );
  }
  seen(group: string) {
    if (group !== "all" && !Object.hasOwn(TELEGRAM_GROUPS, group))
      throw Error("Unknown source");
    const max = Number(
      this.db.prepare("SELECT max(seq) AS n FROM events").get()?.n ?? 0,
    );
    if (group === "all") this.db.prepare("UPDATE states SET seen=?").run(max);
    else
      this.db
        .prepare("UPDATE states SET seen=? WHERE group_id=?")
        .run(max, group);
    return true;
  }
  snapshot(group: string, before = 0) {
    if (group !== "all" && !Object.hasOwn(TELEGRAM_GROUPS, group))
      throw Error("Unknown source");
    const groups = Object.entries(TELEGRAM_GROUPS).map(([key, title]) => ({
      group: key,
      title,
      unread: Number(
        this.db
          .prepare(
            "SELECT count(*) AS n FROM events e LEFT JOIN states s ON s.group_id=e.group_id WHERE e.group_id=? AND e.seq>coalesce(s.seen,0)",
          )
          .get(key)?.n ?? 0,
      ),
      gap: !!this.db.prepare("SELECT gap FROM states WHERE group_id=?").get(key)
        ?.gap,
    }));
    const rows = this.db
      .prepare(
        "SELECT * FROM events WHERE (?='all' OR group_id=?) AND (?=0 OR seq<?) ORDER BY seq DESC LIMIT 51",
      )
      .all(group, group, before, before);
    const events = rows
      .slice(0, 50)
      .reverse()
      .map((r) => ({
        seq: Number(r.seq),
        group: String(r.group_id),
        kind: String(r.kind),
        at: Number(r.at),
        previous: r.previous ? JSON.parse(String(r.previous)) : null,
        message: JSON.parse(String(r.payload)),
      }));
    const messages =
      group === "all"
        ? []
        : this.db
            .prepare(
              "SELECT payload FROM messages WHERE group_id=? ORDER BY id DESC LIMIT 50",
            )
            .all(group)
            .reverse()
            .map((r) => JSON.parse(String(r.payload)));
    return {
      group,
      title: TELEGRAM_GROUPS[group] ?? "All",
      groups,
      events,
      messages,
      hasOlder: rows.length > 50,
      unread: this.unread(),
    };
  }
}
