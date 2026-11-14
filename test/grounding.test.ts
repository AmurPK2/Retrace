import test from "node:test";
import assert from "node:assert/strict";
import {
  validateGrounding,
  validateCoachJSON,
  groundedAnswer,
} from "../src/ai/context";
test("missing generic SL cannot be reported as a met rule", () => {
  const value = {
    summary: "Ingen SL",
    checks: [
      {
        rule_id: "invalidation",
        status: "met",
        evidence: ["snapshot.quote.bid"],
      },
    ],
    missing_information: ["SL"],
    questions: [],
    learning_point: "Definer risiko.",
  };
  const context = { quote: { bid: 2000 }, proposal: null } as any;
  assert.throws(() => validateCoachJSON(value, context), /withheld/);
  assert.equal(
    validateCoachJSON(
      { ...value, checks: [{ ...value.checks[0], status: "unclear" }] },
      context,
    ).checks[0].status,
    "unclear",
  );
});
test("rounded image-derived level is rejected rather than treated as an exact app value", () => {
  const context = {
    quote: { bid: 4896.885, ask: 4898.485 },
    drawings: [{ a: { price: 4703.604 } }],
  } as any;
  assert.throws(
    () => validateGrounding("Et lavpunkt rundt 4703.", context),
    /could not be verified/,
  );
  assert.equal(
    validateGrounding("Synlig bid er 4896.885.", context),
    "Synlig bid er 4896.885.",
  );
  assert.equal(
    validateGrounding(
      "Prisforløpet ser stigende ut, men struktur er uklart.",
      context,
    ),
    "Prisforløpet ser stigende ut, men struktur er uklart.",
  );
});
test("structured evidence must point to an existing supplied field", () => {
  const value = {
    summary: "Uklart",
    checks: [
      { rule_id: "r", status: "unclear", evidence: ["snapshot.quote.bid"] },
    ],
    missing_information: ["SL"],
    questions: ["Hva ugyldiggjør ideen?"],
    learning_point: "Definer risiko.",
  };
  const context = { quote: { bid: 2000 } } as any;
  assert.equal(validateCoachJSON(value, context), value);
  assert.throws(
    () =>
      validateCoachJSON(
        {
          ...value,
          checks: [{ ...value.checks[0], evidence: ["snapshot.future.close"] }],
        },
        context,
      ),
    /does not exist/,
  );
});
test("unsupported sentences are omitted whole, exact prices and qualitative evidence remain unchanged", () => {
  const context = { quote: { bid: 4474.995 } } as any;
  const result = groundedAnswer(
    "Bid is 4475.00. Define a stop before assessing risk. The exact bid is 4474.995.",
    context,
  );
  assert.equal(
    result.text,
    "Define a stop before assessing risk. The exact bid is 4474.995.",
  );
  assert.equal(result.omitted, true);
  assert.throws(
    () => groundedAnswer("Buy at 4475.00.", context),
    /could not be verified/,
  );
  assert.throws(
    () => validateGrounding("Win probability is 90%.", context),
    /unsupported/i,
  );
});
