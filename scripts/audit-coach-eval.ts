import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  coachEvidenceIssue,
  coachEvidenceReply,
  coachRuleIssue,
} from "../src/ai/coach-evidence";
import { validateGrounding } from "../src/ai/context";
const file = path.resolve(process.argv[2]);
const data = JSON.parse(readFileSync(file, "utf8"));
const results = data.results.map((r: any) => {
  let issue =
    coachRuleIssue(r.generated) || coachEvidenceIssue(r.generated, r.context);
  try {
    validateGrounding(r.generated, r.context);
  } catch (e) {
    issue ??= String(e);
  }
  const t = performance.now();
  const fallback = coachEvidenceReply(r.context, r.question);
  return {
    id: r.id,
    generatedMs: r.generatedMs,
    validatorIssue: issue,
    deterministic: fallback,
    deterministicMs: performance.now() - t,
    deterministicWords: fallback.split(/\s+/).length,
  };
});
const report = {
  source: file,
  scope:
    "Revalidation of saved raw answers; not a new inference or a correctness benchmark",
  results,
};
writeFileSync(
  file.replace(/\.json$/, "-audit.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    results.map(({ id, generatedMs, validatorIssue }: any) => ({
      id,
      generatedMs,
      validatorIssue,
    })),
  ),
);
