import test from "node:test";
import assert from "node:assert/strict";
import { initialBroker } from "../src/core/broker";
import {
  beginChallenge,
  commitChallenge,
  challengeProgress,
  learningProgress,
  challengeRuleIssue,
  type Challenge,
} from "../src/core/challenges";
import {
  challengeSnapshot,
  challengeFallback,
  parseChallengeFeedback,
  challengeFeedbackSchema,
} from "../src/ai/challenge-feedback";
import { FOUNDATION_LESSONS } from "../src/core/rr-lessons";
import type { Session, Bar } from "../src/types";
const cutoff = Date.UTC(2026, 10, 2, 12);
const bar = (h: number): Bar => ({
  time: (cutoff + h * 3600000) / 1000,
  open: 2000,
  high: 2010,
  low: 1990,
  close: 2005,
  count: 120,
});
function session() {
  return {
    id: "learning-test",
    tick: { t: cutoff, bid: 2005, ask: 2005.5 },
    dataset: "dukascopy",
    broker: initialBroker(),
    layout: { timeframe: "15m" },
    drawings: [],
    notebook: { text: "No universal stop rule", rules: [] },
  } as unknown as Session;
}
function attempt(
  reason: string,
  value = 16,
  stage: Challenge["stage"] = "frames",
) {
  const s = session(),
    c = beginChallenge(s, [bar(-1)], [bar(-8), bar(-4), bar(0), bar(4)], stage);
  commitChallenge(c, { reason, value }, s);
  return c;
}
function reply(c: Challenge, verdict = "supported") {
  return {
    reasoning: [
      {
        criterion: "criterion.0",
        verdict,
        excerpt: c.answer!.reason,
        evidence: "rule.0",
        explanation:
          "Du forklarer regnestykket og knytter antallet til hele firetimersperioden.",
      },
      {
        criterion: "criterion.1",
        verdict,
        excerpt: c.answer!.reason,
        evidence: "rule.0",
        explanation:
          "Du beskriver detaljene i samme periode og sier at senere priser ikke er kjent.",
      },
    ],
    next: "Følg samme periode på den lavere tidsrammen og skill ferdig fra pågående candle.",
  };
}

test("ten bilingual stages reuse exactly the six existing guides", () => {
  assert.equal(FOUNDATION_LESSONS.length, 10);
  assert.equal(new Set(FOUNDATION_LESSONS.map((x) => x.stage)).size, 10);
  for (const x of FOUNDATION_LESSONS) {
    assert.equal(x.criteria.length, 2);
    assert.equal(x.criteriaEn.length, 2);
    assert.ok(x.paragraphs.every((p) => p[0] && p[1]));
    assert.ok(x.guide >= 0 && x.guide < 6);
  }
});
test("correct reasoning can demonstrate this exercise; reveal and winning cannot", () => {
  const c = attempt(
    "240 delt på 15 gir 16 perioder. 15m viser mindre bevegelser inne i samme 4H-periode uten fremtidspriser.",
  );
  assert.equal(challengeProgress(c).completed, true);
  assert.equal(challengeProgress(c).factual, true);
  assert.equal(challengeProgress(c).mastered, false);
  c.revealedAt = cutoff + 900000;
  c.outcome = {
    from: cutoff,
    to: cutoff + 900000,
    status: "won",
    balance: 99999,
  };
  assert.equal(challengeProgress(c).mastered, false);
  c.feedback = parseChallengeFeedback(JSON.stringify(reply(c)), c);
  assert.equal(c.feedback.assessment, "checked");
  assert.equal(challengeProgress(c).mastered, true);
  assert.ok(c.feedback.good.includes(c.answer!.reason));
  assert.ok(c.feedback.reasoning?.every((x) => x.explanation.length > 20));
});
test("incorrect numeric answer cannot be praised into mastery even by confident model output", () => {
  const c = attempt("Jeg er helt sikker: åtte perioder er fire timer.", 8);
  c.feedback = parseChallengeFeedback(JSON.stringify(reply(c)), c);
  assert.equal(c.feedback.assessment, "needs-practice");
  assert.equal(challengeProgress(c).mastered, false);
  assert.ok(c.feedback.improve.includes("16"));
});
test("vague reasoning stays unclear and missing words cannot be certified", () => {
  const c = attempt("Dette ser riktig ut for meg.");
  const d = reply(c, "unclear");
  d.reasoning.forEach((x) => {
    x.excerpt = "";
    x.explanation =
      "Svaret oppgir ingen beregning eller forklaring av forholdet mellom tidsrammene.";
  });
  c.feedback = parseChallengeFeedback(JSON.stringify(d), c);
  assert.equal(c.feedback.assessment, "unclear");
  assert.equal(challengeProgress(c).mastered, false);
  d.reasoning[0].verdict = "supported";
  assert.throws(
    () => parseChallengeFeedback(JSON.stringify(d), c),
    /Missing reasoning/,
  );
});
test("a rule-breaking stop rationale is specifically contradicted, not rewarded for confidence", () => {
  const s = session(),
    c = beginChallenge(s, [], [bar(-8), bar(-4)], "invalidation");
  commitChallenge(
    c,
    {
      reason:
        "Jeg er helt sikker: SL skal alltid ligge ved 4H-close uansett oppsett.",
      decision: "buy",
      entry: 2006,
      sl: 2005,
    },
    s,
  );
  const d = reply(c, "contradicted");
  d.reasoning.forEach((x) => {
    x.evidence = "rule.0";
    x.explanation =
      "Du sier at stop alltid skal følge sluttprisen. Leksjonen sier at dette ikke er en universell regel; forklar hva som motsier ideen.";
  });
  c.feedback = parseChallengeFeedback(JSON.stringify(d), c);
  assert.equal(c.feedback.assessment, "needs-practice");
  assert.ok(c.feedback.improve.includes("ikke er en universell regel"));
  assert.equal(challengeProgress(c).mastered, false);
});
test("unknown references, fabricated quotes, duplicate criteria and invented probability reject", () => {
  const c = attempt(
    "240 delt på 15 gir 16. Jeg ser detaljer i samme periode uten å kjenne fremtiden.",
  );
  let d = reply(c);
  d.reasoning[0].excerpt = "Dette skrev eleven aldri";
  assert.throws(
    () => parseChallengeFeedback(JSON.stringify(d), c),
    /actual answer/,
  );
  d = reply(c);
  d.reasoning[0].evidence = "future.win";
  assert.throws(
    () => parseChallengeFeedback(JSON.stringify(d), c),
    /Unknown evidence/,
  );
  d = reply(c);
  d.reasoning[1].criterion = "criterion.0";
  assert.throws(
    () => parseChallengeFeedback(JSON.stringify(d), c),
    /duplicate/,
  );
  d = reply(c);
  d.next = "Denne planen har 16% gevinstsjanse.";
  assert.throws(
    () => parseChallengeFeedback(JSON.stringify(d), c),
    /probability/,
  );
  d = reply(c);
  d.next = "Forvent at prisen treffer 987654 i morgen.";
  assert.throws(
    () => parseChallengeFeedback(JSON.stringify(d), c),
    /numerical/,
  );
  assert.ok(challengeFeedbackSchema(c).properties.reasoning);
});
test("snapshot omits forming and future bars, later results, and later mutation", () => {
  const c = attempt(
    "240 delt på 15 gir 16. Mindre candles viser detaljene uten fremtidskunnskap.",
  );
  assert.equal(c.htf.length, 2);
  const before = challengeSnapshot(c);
  c.outcome = {
    from: cutoff,
    to: cutoff + 999,
    status: "won",
    balance: 999999,
  };
  c.revealedAt = cutoff + 999;
  assert.deepEqual(challengeSnapshot(c), before);
  assert.ok(!JSON.stringify(before).includes("999999"));
  c.htf.push({ ...bar(0), high: 99999 });
  assert.deepEqual(challengeSnapshot(c), before);
});
test("legacy data is preserved without granting inferred mastery; every attempt remains counted", () => {
  const c = attempt("Forklaringen er lagret før noen avsløring.");
  c.version = "retrace-foundations-v2";
  c.revealedAt = cutoff + 1;
  c.feedback = {
    ...challengeFallback(c),
    assessment: "checked",
    source: "model",
  };
  const old = structuredClone(c);
  const next = attempt("Ny forklaring bevarer hele forrige forsøk.");
  const learning = { active: next, history: [c], language: "nb" as const };
  const p = learningProgress(learning).find((x) => x.id === "frames")!;
  assert.equal(p.attempts, 2);
  assert.equal(p.completed, true);
  assert.equal(p.mastered, false);
  assert.deepEqual(c, old);
});
test("missing history stays unknown and reflection freezes an earlier answer without its outcome", () => {
  const s = session(),
    empty = beginChallenge(s, [], [], "candles");
  commitChallenge(
    empty,
    { reason: "Jeg har ikke nok historikk her.", value: 2010 },
    s,
  );
  assert.ok(empty.checks!.some((x) => x.pass === null));
  assert.equal(challengeProgress(empty).factual, false);
  const missing = beginChallenge(s, [], [], "reflect");
  commitChallenge(
    missing,
    { reason: "Neste gang vil jeg følge planen bedre." },
    s,
  );
  assert.ok(missing.checks!.some((x) => x.pass === null));
  const old = attempt("Jeg regner perioden før jeg vurderer detaljer.");
  old.outcome = { from: cutoff, to: cutoff + 1, status: "won", balance: 99999 };
  s.learning = { active: old, history: [], language: "nb" };
  const reflection = beginChallenge(s, [], [], "reflect");
  assert.deepEqual(reflection.prior?.answer, old.answer);
  assert.ok(!JSON.stringify(reflection.prior).includes("99999"));
  old.answer!.reason = "Changed later";
  assert.notEqual(reflection.prior!.answer.reason, old.answer!.reason);
});

test("known false universal rules are independently checked while explicit negations are preserved", () => {
  assert.ok(challengeRuleIssue("SL skal alltid ligge ved 4H-close."));
  assert.ok(challengeRuleIssue("TP must always be outside the candle range."));
  assert.equal(
    challengeRuleIssue("SL skal ikke alltid ligge ved 4H-close."),
    null,
  );
  assert.equal(
    challengeRuleIssue("It is wrong to require TP outside the candle range."),
    null,
  );
});
test("a model may not introduce a new illustrative invalidation rule or praise a missing explanation", () => {
  const c = attempt(
    "240 delt på 15 er 16. Mindre candles viser bevegelsen uten senere priser.",
  );
  let d = reply(c);
  d.next = "Vent på et nytt signal, for example en ny kjøpsregel.";
  assert.throws(
    () => parseChallengeFeedback(JSON.stringify(d), c),
    /illustrative rules/,
  );
  d = reply(c);
  d.reasoning[0].explanation =
    "Du mangler en etterprøvbar beregning i svaret ditt.";
  assert.throws(() => parseChallengeFeedback(JSON.stringify(d), c), /omission/);
});
