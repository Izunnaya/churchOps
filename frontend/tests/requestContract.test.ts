/*
  Do the request types in src/types.ts still describe what the server's
  validators accept?

  --- why this reads source text, and what that costs ----------------------

  The zod schemas live inline inside `validate({ body: z.object({ ... }) })`
  calls in the routers. They are not exported, and `validate` closes over them,
  so there is no runtime handle on them and no inferred type to compare
  against. A compile-time `Exactly<>` assertion like the ones in
  apiContract.types.ts is therefore not available for requests the way it is
  for the response.

  What is left is pinning the validator spellings against the source. That is
  weaker than inference: it proves the spelling has not drifted, not that zod
  behaves as the spelling reads. It is here because the alternative is nothing
  at all, and because the two asymmetries below are exactly the kind that is
  silently wrong on the client for months.

  If the routers ever export their schemas, delete this file and assert the
  inferred types instead.
*/

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const offeringsRouterSource = readFileSync(
  new URL("../../server/src/modules/offerings/offerings.router.ts", import.meta.url),
  "utf8",
);

const incomeCategoriesRouterSource = readFileSync(
  new URL("../../server/src/modules/offerings/incomeCategories.router.ts", import.meta.url),
  "utf8",
);

/// The whole validator expression for one field, however many lines it spans,
/// up to the comma that ends it at the same nesting depth.
function validatorFor(source: string, field: string): string {
  // A field is either spelled out inline (`take: z.coerce...`) or points at a
  // shared validator defined above (`deltaAmount: signedAmount`).
  const match = new RegExp(String.raw`\b${field}:\s*(z\b|[A-Za-z_]\w*\b)`).exec(source);
  const start = match?.index ?? -1;
  expect(start, `no validator found for ${field}`).toBeGreaterThan(-1);

  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === "(" || character === "[" || character === "{") depth += 1;
    if (character === ")" || character === "]" || character === "}") depth -= 1;
    if (character === "," && depth === 0) return source.slice(start, index).replace(/\s+/g, " ");
    if (depth < 0) return source.slice(start, index).replace(/\s+/g, " ");
  }

  throw new Error(`validator for ${field} is unterminated`);
}

describe("RecordRevisionRequest.categoryName is optional and NOT nullable", () => {
  /*
    src/types.ts declares `categoryName?: string` and its comment says an
    explicit null is refused with a 400. If the server ever becomes `.nullish()`
    the client type is wrong in the safe direction; if the client ever becomes
    `string | null` it is wrong in the direction that puts a 400 in front of a
    treasurer mid-correction.
  */
  it("is spelled .optional(), never .nullish() or .nullable()", () => {
    const validator = validatorFor(offeringsRouterSource, "categoryName");

    expect(validator).toContain(".optional()");
    expect(validator).not.toContain(".nullish()");
    expect(validator).not.toContain(".nullable()");
    expect(validator).toContain(".min(1)");
  });
});

describe("IncomeCategory bucketRatePercent is nullish, which is the asymmetry", () => {
  /*
    The other side of the same coin: here null IS accepted, and src/types.ts
    declares `bucketRatePercent?: string | null` on both the create and the
    update request. The two fields being spelled differently on purpose is the
    whole reason the client types are not unified.
  */
  it("accepts null on create and on update", () => {
    const occurrences = incomeCategoriesRouterSource.match(
      /bucketRatePercent: ratePercent\.nullish\(\)/g,
    );

    expect(occurrences).toHaveLength(2);
    expect(incomeCategoriesRouterSource).not.toContain("bucketRatePercent: ratePercent.optional()");
  });
});

describe("the money and percentage formats the client types promise", () => {
  it("an unsigned amount is the regex AddOfferingCategoryRequest documents", () => {
    expect(offeringsRouterSource).toContain(String.raw`.regex(/^\d+(\.\d{1,2})?$/`);
  });

  it("a revision delta is signed, because a correction can take money off", () => {
    expect(offeringsRouterSource).toContain(String.raw`.regex(/^-?\d+(\.\d{1,2})?$/`);

    const validator = validatorFor(offeringsRouterSource, "deltaAmount");
    expect(validator).toContain("signedAmount");
  });

  it("a rate is a percentage as written, not kobo", () => {
    expect(incomeCategoriesRouterSource).toContain(String.raw`.regex(/^\d{1,3}(\.\d{1,2})?$/`);
  });
});

describe("the idempotency key the revision endpoint requires", () => {
  it("is required and bounded to a uuid, as RecordRevisionRequest says", () => {
    const validator = validatorFor(offeringsRouterSource, "idempotencyKey");

    expect(validator).toContain(".uuid(");
    expect(validator).not.toContain(".optional()");
  });
});

describe("the list query the client types mirror", () => {
  it("bounds take to 1-100 and defaults it to 25, and defaults skip to 0", () => {
    expect(validatorFor(offeringsRouterSource, "take")).toBe(
      "take: z.coerce.number().int().min(1).max(100).default(25)",
    );
    expect(validatorFor(offeringsRouterSource, "skip")).toBe(
      "skip: z.coerce.number().int().min(0).default(0)",
    );
  });
});

describe("the denomination a category update may carry", () => {
  /*
    SHOULD-7: UpdateOfferingCategoryRequest.denominations[].denomination is
    narrowed to the Denomination union on the client. The server refuses
    anything outside DENOMINATIONS, so the client union has to be that list and
    no other. The compile-time half of this lives in apiContract.types.ts as
    DenominationsMatch; this is the runtime half, that the refinement is still
    the thing enforcing it.
  */
  it("is refused unless it is in the server's DENOMINATIONS list", () => {
    const validator = validatorFor(offeringsRouterSource, "denomination");

    expect(validator).toContain("DENOMINATIONS");
    expect(validator).toContain(".includes(d)");
    expect(validator).toContain("Not a note we count");
  });

  it("bounds a note count to 0-100,000 as the client type documents", () => {
    expect(validatorFor(offeringsRouterSource, "quantity")).toBe(
      "quantity: z.number().int().min(0).max(100_000)",
    );
  });
});
