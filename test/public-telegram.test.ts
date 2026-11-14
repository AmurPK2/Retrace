import test from "node:test";
import assert from "node:assert/strict";
import { configureTelegram } from "../electron/telegram-config";
import {
  configureFeedGroups,
  TELEGRAM_GROUPS,
  FeedJournal,
} from "../electron/feed-journal";
test("public Telegram has no built-in sources; each chosen source is bounded and unique", () => {
  assert.deepEqual(TELEGRAM_GROUPS, {});
  const config = configureTelegram(
    {
      apiId: 12345,
      apiHash: "a".repeat(32),
      sources: [{ title: "My study", peer: "@example_channel" }],
    },
    null,
  );
  assert.equal(config.sources.length, 1);
  assert.equal(config.session, "");
  assert.throws(() =>
    configureTelegram(
      {
        apiId: 12345,
        apiHash: "a".repeat(32),
        sources: [{ title: "x", peer: "https://untrusted.example/path" }],
      },
      null,
    ),
  );
  assert.throws(
    () =>
      configureTelegram(
        {
          apiId: 12345,
          apiHash: "a".repeat(32),
          sources: [
            { title: "x", peer: "@example_channel" },
            { title: "y", peer: "@example_channel" },
          ],
        },
        null,
      ),
    /only once/,
  );
});
test("same API credentials preserve only this app's login; a changed API clears the saved authorization", () => {
  const old = configureTelegram(
    { apiId: 12345, apiHash: "a".repeat(32), sources: [] },
    null,
  );
  old.session = "fixture-session";
  assert.equal(
    configureTelegram({ sources: [] }, old).session,
    "fixture-session",
  );
  assert.equal(
    configureTelegram(
      { apiId: 54321, apiHash: "b".repeat(32), sources: [] },
      old,
    ).session,
    "",
  );
});
test("only configured sources enter the local journal; revisions, deletes and restarts keep original text", () => {
  configureFeedGroups({ "source-111111111111": "My study" });
  const db = new FeedJournal(":memory:");
  const message = {
    id: 1,
    time: 1000,
    editedAt: null,
    text: "Original",
    hasMedia: false,
  };
  const frame = (pts: number, changes: any[], rest = {}) => ({
    group: "source-111111111111",
    pts,
    at: 1000 + pts,
    changes,
    ...rest,
  });
  try {
    assert.throws(() => db.apply({ ...frame(1, []), group: "unselected" }));
    db.apply(frame(1, [{ kind: "seed", message }], { seed: true }));
    db.apply(
      frame(2, [
        {
          kind: "edit",
          message: { ...message, text: "Edited", editedAt: 2000 },
        },
      ]),
    );
    db.apply(frame(3, [{ kind: "delete", id: 1 }]));
    assert.equal(db.apply(frame(3, [])), false);
    const result = db.snapshot("all");
    assert.equal(result.events.length, 2);
    assert.equal(result.events[0].previous.text, "Original");
    assert.equal(result.events[1].message.text, "Edited");
    assert.equal(db.unread(), 2);
    db.seen("all");
    assert.equal(db.unread(), 0);
    assert.throws(() => db.identity("invalid"));
  } finally {
    db.close();
  }
});
