import test from "node:test";
import assert from "node:assert/strict";
import {
  RR_SOURCE_TASKS,
  RR_RECORDINGS,
  RR_MODULES,
  checkRRSource,
  freshRRSource,
  restoreRRSource,
  mergeRRSource,
  sourceProgressCount,
  rrSourceUrl,
} from "../src/core/rr-source-course";
import { lessonSource } from "../src/core/rr-lessons";
const task = (id: string) => RR_SOURCE_TASKS.find((t) => t.id === id)!;
test("source course covers the actual twelve-recording inventory and eight modules with timestamped primary sources", () => {
  assert.equal(RR_RECORDINGS.length, 12);
  assert.equal(RR_MODULES.length, 8);
  assert.equal(
    new Set(RR_SOURCE_TASKS.map((t) => t.id)).size,
    RR_SOURCE_TASKS.length,
  );
  assert.deepEqual(
    new Set(RR_SOURCE_TASKS.flatMap((t) => t.refs.map((r) => r.video))),
    new Set(RR_RECORDINGS.map((v) => v[0])),
  );
  assert.deepEqual(
    new Set(RR_SOURCE_TASKS.map((t) => t.module)),
    new Set([0, 1, 2, 3, 4, 5, 6, 7]),
  );
  for (const t of RR_SOURCE_TASKS) {
    assert.ok(t.refs.length && t.limit && t.explanation);
    for (const r of t.refs) {
      assert.ok(r.at >= 0 && r.end > r.at);
      assert.match(
        rrSourceUrl(r),
        /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]+&t=\d+s$/,
      );
    }
  }
});
test("source opening accepts only lesson-owned references, rejecting arbitrary URLs and invalid indexes", () => {
  assert.equal(
    lessonSource("rr-source:four-tp", 0),
    "https://www.youtube.com/watch?v=RbKiLdUk0dw&t=1680s",
  );
  for (const [id, i] of [
    ["rr-source:https://evil.invalid", 0],
    ["rr-source:four-tp", -1],
    ["rr-source:four-tp", 0.1],
    ["rr-source:four-tp", 999],
  ] as const)
    assert.throws(() => lessonSource(id, i));
});
test("C2 stop task accepts only its named variant and never the low itself or arbitrary C1 boundary", () => {
  const t = task("c2-stop");
  assert.ok(checkRRSource(t, { values: { sl: 18 } }).every((c) => c.pass));
  for (const sl of [20, 21, 35, -1])
    assert.ok(checkRRSource(t, { values: { sl } }).some((c) => !c.pass));
  assert.ok(checkRRSource(t, { values: { sl: 10 } }).every((c) => c.pass));
  assert.ok(checkRRSource(t, { values: { sl: 0 } }).every((c) => c.pass));
  assert.match(t.limit, /ikke hans generelle buffer/);
  assert.equal(
    checkRRSource(task("stop-variants"), { choice: "full" })[0].pass,
    false,
  );
});
test("cash-risk and partial tasks grade the amount and weighted R, not final target R or rounded-up size", () => {
  assert.ok(
    checkRRSource(task("cash-risk"), {
      values: { wide: 0.25, tight: 0.5 },
    }).every((c) => c.pass),
  );
  assert.ok(
    checkRRSource(task("cash-risk"), {
      values: { wide: 0.5, tight: 0.5 },
    }).some((c) => !c.pass),
  );
  assert.ok(
    checkRRSource(task("four-tp"), {
      values: { tp1: 25, tp2: 25, tp3: 25, tp4: 25 },
    }).every((c) => c.pass),
  );
  assert.ok(
    checkRRSource(task("four-tp"), {
      values: { tp1: 25, tp2: 25, tp3: 25 },
    }).some((c) => !c.pass),
  );
  assert.equal(
    checkRRSource(task("weighted-r"), { values: { r: 5 } })[0].pass,
    false,
  );
  assert.equal(
    checkRRSource(task("weighted-r"), { values: { r: 3.5 } })[0].pass,
    true,
  );
});
test("source progress separates assisted attempts, retains wrong answers and recomputes facts on restore", () => {
  const p = freshRRSource();
  p.selected = "cisd";
  p.attempts.push(
    {
      id: "guided",
      taskId: "cisd",
      guided: true,
      at: 1,
      answer: { choice: "B" },
    },
    {
      id: "wrong",
      taskId: "cisd",
      guided: false,
      at: 2,
      answer: { choice: "A" },
    },
  );
  assert.equal(sourceProgressCount(p), 0);
  p.attempts.push({
    id: "correct",
    taskId: "cisd",
    guided: false,
    at: 3,
    answer: { choice: "B" },
  });
  assert.equal(sourceProgressCount(restoreRRSource(p)), 1);
  const merged = mergeRRSource(p, structuredClone(p));
  assert.equal(merged.attempts.length, 3);
  assert.throws(() => restoreRRSource({ ...p, selected: "fabricated-model" }));
  assert.throws(() => restoreRRSource({ ...p, activeAttempt: "wrong" }));
});
test("entry and management alternatives remain separate; incomplete rules never become invented triggers", () => {
  assert.equal(
    checkRRSource(task("entry-modes"), { choice: "eight" })[0].pass,
    false,
  );
  assert.equal(
    checkRRSource(task("be-versions"), { choice: "never" })[0].pass,
    false,
  );
  assert.equal(checkRRSource(task("smt"), { choice: "double" })[0].pass, false);
  assert.equal(
    checkRRSource(task("whole-method"), { choice: "invent" })[0].pass,
    false,
  );
  assert.ok(
    task("whole-method").refs.some((r) => r.video === 14 && r.at >= 1800),
  );
});
