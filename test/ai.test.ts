import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { LMStudioProvider, loopbackURL } from "../src/ai/provider";
import { DEFAULT_AI } from "../src/types";
async function server(existing = false) {
  let loaded: any[] = existing ? [{ id: "other-app-model" }] : [],
    unloads: string[] = [],
    loads = 0;
  const instance = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/v1/models") {
      res.end(
        JSON.stringify({
          models: [
            {
              type: "llm",
              key: "test-model",
              loaded_instances: loaded,
              capabilities: { vision: true },
            },
          ],
        }),
      );
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const value = body ? JSON.parse(body) : {};
    if (req.url?.endsWith("/load")) {
      loads++;
      loaded = [...loaded, { id: "app-instance" }];
      res.end(JSON.stringify({ instance_id: "app-instance" }));
      return;
    }
    if (req.url?.endsWith("/unload")) {
      unloads.push(value.instance_id);
      loaded = loaded.filter((x) => x.id !== value.instance_id);
      res.end(JSON.stringify(value));
      return;
    }
    if (req.url === "/v1/chat/completions") {
      res.setHeader("Content-Type", "text/event-stream");
      res.write(
        "data: " +
          JSON.stringify({
            choices: [{ delta: { content: "Et delvis svar" } }],
          }) +
          "\n\n",
      );
      const timer = setTimeout(() => res.end("data: [DONE]\n\n"), 5000);
      req.on("close", () => clearTimeout(timer));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((r) => instance.listen(0, "127.0.0.1", r));
  const port = (instance.address() as any).port;
  const p = new LMStudioProvider(
    { ...DEFAULT_AI, url: `http://127.0.0.1:${port}`, model: "test-model" },
    "F:/no-cli-in-test",
    () => {},
  );
  return {
    p,
    unloads,
    get loads() {
      return loads;
    },
    get loaded() {
      return loaded;
    },
    async close() {
      instance.closeAllConnections();
      await new Promise<void>((r) => instance.close(() => r()));
    },
  };
}
test("new model instance is owned, actually unloaded and independently confirmed", async () => {
  const f = await server();
  try {
    await f.p.load();
    assert.equal(f.p.ownedModel, true);
    assert.equal(f.loaded.length, 1);
    await f.p.unload();
    assert.deepEqual(f.unloads, ["app-instance"]);
    assert.equal(f.loaded.length, 0);
  } finally {
    await f.close();
  }
});
test("already loaded shared model is borrowed and never unloaded or stopped", async () => {
  const f = await server(true);
  try {
    await f.p.load();
    assert.equal(f.p.ownedModel, false);
    assert.equal(f.loads, 0);
    await f.p.shutdown();
    assert.equal(f.loaded[0].id, "other-app-model");
    assert.equal(f.unloads.length, 0);
  } finally {
    await f.close();
  }
});
test("cancel interrupts streaming rather than waiting for full answer", async () => {
  const f = await server();
  try {
    await f.p.load();
    const c = new AbortController();
    let partial = "";
    const start = performance.now();
    await assert.rejects(() =>
      f.p.chat(
        [{ role: "user", content: "fixture" }],
        (t) => {
          partial += t;
          c.abort();
        },
        c.signal,
      ),
    );
    assert.equal(partial, "Et delvis svar");
    assert.ok(performance.now() - start < 1000);
    await f.p.unload();
    assert.equal(f.loaded.length, 0);
  } finally {
    await f.close();
  }
});
test("non-loopback endpoints, credentials and extra URL paths reject", () => {
  assert.throws(() => loopbackURL("https://api.example.com"));
  assert.throws(() => loopbackURL("http://user:pass@localhost:1234"));
  assert.throws(() => loopbackURL("http://127.0.0.1:1234/v1"));
  assert.equal(loopbackURL("http://127.0.0.1:1234"), "http://127.0.0.1:1234");
});
