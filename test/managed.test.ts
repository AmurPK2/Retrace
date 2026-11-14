import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { verifiedDownload } from "../src/ai/managed-download";
const base = path.resolve(".cache/managed-tests");
mkdirSync(base, { recursive: true });
const temp = () => mkdtempSync(path.join(base, "case-"));
const cleanup = (root: string) => {
  if (!path.resolve(root).startsWith(base + path.sep))
    throw Error("Unsafe cleanup");
  rmSync(root, { recursive: true, force: true });
};
const bytes = Buffer.from("verified runtime fixture");
const spec = {
  name: "fixture.bin",
  url: "https://github.com/example/fixture",
  sha256: createHash("sha256").update(bytes).digest("hex"),
  bytes: bytes.length,
};
test("automatic download resumes exact ranges, checks hashes, then reuses its verified cache", async () => {
  const root = temp(),
    file = path.join(root, "model.bin");
  let calls = 0;
  try {
    writeFileSync(file + ".partial", bytes.subarray(0, 5));
    await verifiedDownload(
      spec,
      file,
      () => {},
      new AbortController().signal,
      (async (_url, init) => {
        calls++;
        assert.equal((init?.headers as any).Range, "bytes=5-");
        return new Response(bytes.subarray(5), {
          status: 206,
          headers: {
            "content-range":
              "bytes 5-" + (bytes.length - 1) + "/" + bytes.length,
          },
        });
      }) as typeof fetch,
    );
    assert.deepEqual(readFileSync(file), bytes);
    assert.equal(existsSync(file + ".partial"), false);
    await verifiedDownload(
      spec,
      file,
      () => {},
      new AbortController().signal,
      (() => {
        throw Error("Cache must avoid network");
      }) as any,
    );
    assert.equal(calls, 1);
  } finally {
    cleanup(root);
  }
});
test("corrupted, oversized and cancelled AI downloads are never installed or executed", async () => {
  const root = temp(),
    file = path.join(root, "bad.bin");
  let calls = 0;
  try {
    await assert.rejects(
      verifiedDownload(
        { ...spec, sha256: "0".repeat(64) },
        file,
        () => {},
        new AbortController().signal,
        (async () => {
          calls++;
          return new Response(bytes);
        }) as typeof fetch,
      ),
      /checksum/,
    );
    assert.equal(calls, 3);
    assert.equal(existsSync(file), false);
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(verifiedDownload(spec, file, () => {}, abort.signal));
    assert.equal(existsSync(file), false);
    await assert.rejects(
      verifiedDownload(
        { ...spec, url: "http://127.0.0.1/untrusted" },
        file,
        () => {},
        new AbortController().signal,
      ),
      /Invalid pinned/,
    );
  } finally {
    cleanup(root);
  }
});
test("hidden managed host closes its own runtime when the parent IPC disappears", async () => {
  const host = spawn(
    process.execPath,
    [path.resolve("dist-electron/managed-host.cjs"), String(process.pid)],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] },
  );
  const pid = await new Promise<number>((resolve, reject) => {
    host.once("error", reject);
    host.on("message", (m: any) => {
      if (m.type === "started") resolve(m.pid);
    });
    host.send({
      type: "start",
      binary: process.execPath,
      args: ["-e", "setInterval(()=>{},1000)"],
      cwd: process.cwd(),
    });
  });
  assert.ok(pid > 0);
  host.disconnect();
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(Error("Host did not stop")), 6000);
    host.once("exit", () => {
      clearTimeout(t);
      resolve();
    });
  });
  let gone = false;
  try {
    process.kill(pid, 0);
  } catch {
    gone = true;
  }
  assert.equal(gone, true);
});
