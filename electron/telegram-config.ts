import { z } from "zod";
import { createHash } from "node:crypto";
export const sourceSchema = z.object({
  key: z.string().regex(/^source-[a-f0-9]{12}$/),
  title: z.string().trim().min(1).max(80),
  peer: z
    .string()
    .trim()
    .regex(/^(?:@[A-Za-z][A-Za-z0-9_]{3,31}|-100\d{5,18})$/),
});
export const telegramConfigSchema = z.object({
  apiId: z.number().int().positive(),
  apiHash: z.string().regex(/^[a-fA-F0-9]{32}$/),
  session: z.string().max(4096).default(""),
  sources: z.array(sourceSchema).max(10),
});
export type TelegramConfig = z.infer<typeof telegramConfigSchema>;
export function configureTelegram(
  input: any,
  previous: TelegramConfig | null,
): TelegramConfig {
  const sources = z
    .array(z.object({ title: z.string(), peer: z.string() }))
    .max(10)
    .parse(input.sources)
    .map((s) => ({
      key:
        "source-" +
        createHash("sha256")
          .update(s.peer.trim().toLowerCase())
          .digest("hex")
          .slice(0, 12),
      title: s.title,
      peer: s.peer,
    }));
  if (new Set(sources.map((s) => s.key)).size !== sources.length)
    throw Error("Add each Telegram source only once.");
  const apiId = Number(input.apiId || previous?.apiId),
    apiHash = String(input.apiHash || previous?.apiHash || "");
  return telegramConfigSchema.parse({
    apiId,
    apiHash,
    sources,
    session:
      previous?.apiId === apiId && previous?.apiHash === apiHash
        ? previous.session
        : "",
  });
}
