import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("GUI-hosted runtime wrapper stays compatible with classic JScript and waits hidden", () => {
  const s = readFileSync("scripts/runtime-hidden.js", "utf8");
  assert.match(s, /\.Run\(command,\s*0,\s*true\)/);
  assert.match(s, /-NonInteractive -WindowStyle Hidden/);
  assert.match(s, /WScript.Quit\(code\)/);
  assert.doesNotMatch(s, /,\s*\)/);
  assert.doesNotMatch(s, /=>|\bconst\b|\blet\b/);
  const host = readFileSync("scripts/runtime-host.ps1", "utf8");
  assert.match(host, /& \$taskRuntime/);
  assert.doesNotMatch(host, /Start-Process/);
});
