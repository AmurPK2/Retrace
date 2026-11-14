import test from "node:test";
import assert from "node:assert/strict";
import lzma from "lzma/src/lzma_worker.js";
import { decodeBi5, urlFor } from "../src/data/importer";
test("BI5 explicit XAU price scale, millisecond units, volume field order and equal-time path are preserved", async () => {
  const rows = [
    { ms: 0, ask: 2000500, bid: 2000000 },
    { ms: 0, ask: 2001500, bid: 2001000 },
    { ms: 0, ask: 2000500, bid: 2000000 },
    { ms: 0, ask: 2000500, bid: 2000000 },
    { ms: 500, ask: 1999000, bid: 2000000 },
  ];
  const bytes = Buffer.alloc(rows.length * 20);
  rows.forEach((r, i) => {
    const o = i * 20;
    bytes.writeUInt32BE(r.ms, o);
    bytes.writeUInt32BE(r.ask, o + 4);
    bytes.writeUInt32BE(r.bid, o + 8);
    bytes.writeFloatBE(2, o + 12);
    bytes.writeFloatBE(3, o + 16);
  });
  const compressed = await new Promise<Buffer>((resolve, reject) =>
    (lzma.LZMA_WORKER as any).compress(bytes, 1, (result: any, error: any) =>
      error ? reject(error) : resolve(Buffer.from(result)),
    ),
  );
  const hour = Date.UTC(2026, 10, 11, 12);
  const result = await decodeBi5(compressed, hour);
  assert.equal(result.invalid, 1);
  assert.equal(result.duplicates, 1);
  assert.deepEqual(
    result.ticks.map((q) => [q.t, q.bid, q.ask, q.bv, q.av]),
    [
      [hour, 2000, 2000.5, 3, 2],
      [hour, 2001, 2001.5, 3, 2],
      [hour, 2000, 2000.5, 3, 2],
    ],
  );
  assert.match(urlFor(hour), /2026\/10\/11\/12h_ticks.bi5$/);
});

import {retryAfterMs} from "../src/data/importer";
test("provider retry timing honours numeric and date headers and rejects malformed waits",()=>{const now=Date.UTC(2026,0,1);assert.equal(retryAfterMs("45",now),45000);assert.equal(retryAfterMs(new Date(now+60000).toUTCString(),now),60000);assert.equal(retryAfterMs("broken",now),30000);assert.equal(retryAfterMs("-5",now),1000);});
