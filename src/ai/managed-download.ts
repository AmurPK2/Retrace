import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import AdmZip from "adm-zip";
export type DownloadSpec = {
  name: string;
  url: string;
  sha256: string;
  bytes: number;
};
export async function fileHash(file: string) {
  const h = createHash("sha256");
  for await (const b of createReadStream(file)) h.update(b);
  return h.digest("hex");
}
export async function verifiedDownload(
  spec: DownloadSpec,
  file: string,
  report: (message: string) => void,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const url = new URL(spec.url);
  if (
    url.protocol !== "https:" ||
    !["github.com", "huggingface.co"].includes(url.hostname) ||
    !/^[a-f0-9]{64}$/.test(spec.sha256) ||
    !Number.isSafeInteger(spec.bytes) ||
    spec.bytes <= 0
  )
    throw Error("Invalid pinned download.");
  mkdirSync(path.dirname(file), { recursive: true });
  const stamp = file + ".verified.json";
  if (existsSync(file) && statSync(file).size === spec.bytes) {
    const info = statSync(file);
    try {
      const cached = JSON.parse(readFileSync(stamp, "utf8"));
      if (
        cached.sha256 === spec.sha256 &&
        cached.bytes === info.size &&
        cached.modified === info.mtimeMs
      )
        return file;
    } catch {}
    report("Checking " + spec.name + "…");
    if ((await fileHash(file)) === spec.sha256) {
      writeFileSync(
        stamp,
        JSON.stringify({
          sha256: spec.sha256,
          bytes: info.size,
          modified: info.mtimeMs,
        }),
      );
      return file;
    }
    // Leave a user's modified file in place; do not execute it.
    throw Error(
      "A local AI file failed its integrity check. Move it aside, then retry: " +
        spec.name,
    );
  }
  const partial = file + ".partial";
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    try {
      let offset = existsSync(partial) ? statSync(partial).size : 0;
      if (offset > spec.bytes) {
        unlinkSync(partial);
        offset = 0;
      }
      if (offset < spec.bytes) {
        const response = await fetcher(spec.url, {
          headers: offset ? { Range: "bytes=" + offset + "-" } : {},
          signal: AbortSignal.any([signal, AbortSignal.timeout(3600000)]),
        });
        if (!response.ok || !response.body)
          throw Error("Download returned HTTP " + response.status);
        const append = offset > 0 && response.status === 206;
        if (
          append &&
          !response.headers
            .get("content-range")
            ?.startsWith("bytes " + offset + "-")
        )
          throw Error("Invalid resumed download range.");
        let received = append ? offset : 0,
          lastReport = 0;
        const meter = new Transform({
          transform(chunk, _encoding, next) {
            received += chunk.length;
            if (received > spec.bytes) {
              next(Error("Download exceeded expected size."));
              return;
            }
            if (Date.now() - lastReport > 700) {
              report(
                "Downloading local AI · " +
                  spec.name +
                  " · " +
                  Math.floor((received / spec.bytes) * 100) +
                  "% (" +
                  Math.round(received / 1048576) +
                  " / " +
                  Math.round(spec.bytes / 1048576) +
                  " MB)",
              );
              lastReport = Date.now();
            }
            next(null, chunk);
          },
        });
        await pipeline(
          Readable.fromWeb(response.body as any),
          meter,
          createWriteStream(partial, { flags: append ? "a" : "w" }),
          { signal },
        );
      }
      report("Verifying " + spec.name + "…");
      if (
        statSync(partial).size !== spec.bytes ||
        (await fileHash(partial)) !== spec.sha256
      ) {
        unlinkSync(partial);
        throw Error("AI download checksum mismatch.");
      }
      signal.throwIfAborted();
      renameSync(partial, file);
      const info = statSync(file);
      writeFileSync(
        stamp,
        JSON.stringify({
          sha256: spec.sha256,
          bytes: info.size,
          modified: info.mtimeMs,
        }),
      );
      return file;
    } catch (e) {
      last = e;
      if (signal.aborted) throw e;
    }
  }
  throw last;
}
export async function extractRuntime(zip: string, folder: string) {
  mkdirSync(folder, { recursive: true });
  const prefix = path.resolve(folder) + path.sep;
  let server = "",
    total = 0;
  for (const entry of new AdmZip(zip).getEntries()) {
    if (entry.isDirectory) continue;
    const name = entry.entryName.replaceAll("\\", "/");
    if (
      name.startsWith("/") ||
      name.split("/").includes("..") ||
      name.includes(":")
    )
      throw Error("Unsafe runtime archive path.");
    total += entry.header.size;
    if (total > 500 * 1024 * 1024) throw Error("Runtime archive is too large.");
    const file = path.resolve(folder, name);
    if (!file.startsWith(prefix)) throw Error("Runtime escaped its folder.");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, entry.getData());
    if (path.basename(file).toLowerCase() === "llama-server.exe") server = file;
  }
  if (!server) throw Error("The verified runtime contains no server.");
  return server;
}
