/*
  The two functions lib/money.ts added for the Offering Entry screen, checked
  against the server implementations they claim to mirror.

  Written from the stated requirements, not from either implementation:

  - `denominationLineKobo` is documented as taking "the same multiplication the
    server applies in categoryCashTotal". So the requirement is agreement with
    `categoryCashTotal`, for every input, including the ones the doc comment
    does not mention: zero, fractional and negative quantities.
  - `koboToAmountInput` is documented as producing "the plain naira string a
    request carries", which "feeds an input and then the server's
    /^\d+(\.\d{1,2})?$/". So the requirement is two things at once: the output
    satisfies that regex, and it round-trips through the server's
    `nairaToKobo` back to the kobo it started from.

  Both server modules are imported directly. No server process is involved.
*/

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NAIRA_AMOUNT, denominationLineKobo, koboToAmountInput } from "../src/lib/money";
import { categoryCashTotal, DENOMINATIONS } from "../../server/src/domain/offering";
import { kobo as koboOnServer, nairaToKobo } from "../../server/src/lib/money";

/// The largest value a Postgres Int holds, in kobo: about ₦21,474,836.47.
const INT_CEILING_KOBO = 2_147_483_647;

/*
  The unsigned rule, imported rather than retyped. lib/money.ts now exports the
  one copy both the add form and the category card check against, so this test
  compares that exported value with the server's own literal instead of keeping
  a third copy that could drift from both.
*/
const UNSIGNED_AMOUNT = NAIRA_AMOUNT;

/// The second validator in offerings.router.ts (line 54), for a revision delta,
/// which is the only request field allowed to be negative.
const SIGNED_AMOUNT = /^-?\d+(\.\d{1,2})?$/;

describe("the one shared NAIRA_AMOUNT is still the server's rule", () => {
  /*
    lib/money.ts now exports a single copy that both the add form and the
    category card check against. Its whole value is that it matches the
    server; a copy that has drifted is worse than two copies, because it greys
    out Save on a figure the server would have taken.

    Read from the server's source rather than retyped here, so this fails if
    either side is edited.
  */
  const routerSource = readFileSync(
    resolve(__dirname, "..", "..", "server", "src", "modules", "offerings", "offerings.router.ts"),
    "utf8",
  );

  it("appears verbatim in offerings.router.ts", () => {
    expect(routerSource).toContain(NAIRA_AMOUNT.source);
  });

  it("carries no flags that would change what it matches", () => {
    expect(NAIRA_AMOUNT.flags).toBe("");
  });

  it("is anchored at both ends, so a prefix cannot slip through", () => {
    expect(NAIRA_AMOUNT.test("3500abc")).toBe(false);
    expect(NAIRA_AMOUNT.test("abc3500")).toBe(false);
    expect(NAIRA_AMOUNT.test(" 3500")).toBe(false);
    expect(NAIRA_AMOUNT.test("3500 ")).toBe(false);
    expect(NAIRA_AMOUNT.test("3,500")).toBe(false);
    expect(NAIRA_AMOUNT.test("3500.000")).toBe(false);
    expect(NAIRA_AMOUNT.test("")).toBe(false);
    expect(NAIRA_AMOUNT.test("3500")).toBe(true);
    expect(NAIRA_AMOUNT.test("3500.5")).toBe(true);
    expect(NAIRA_AMOUNT.test("3500.50")).toBe(true);
  });
});

describe("denominationLineKobo agrees with the server's categoryCashTotal", () => {
  const quantities = [0, 1, 2, 7, 13, 99, 1_000, 2_147_483];

  for (const denomination of DENOMINATIONS) {
    for (const quantity of quantities) {
      it(`${quantity} x ₦${denomination}`, () => {
        expect(denominationLineKobo(denomination, quantity)).toBe(
          categoryCashTotal([{ denomination, quantity }]),
        );
      });
    }
  }

  it("a line of zero notes is zero kobo, not an absence", () => {
    expect(denominationLineKobo(1000, 0)).toBe(0);
    expect(categoryCashTotal([{ denomination: 1000, quantity: 0 }])).toBe(0);
  });

  it("the smallest note the list carries is still exact", () => {
    // ₦5 is the lowest denomination, so 1 kobo is not reachable through a note
    // count. The smallest non-zero line is one ₦5 note: 500 kobo.
    expect(denominationLineKobo(5, 1)).toBe(500);
    expect(denominationLineKobo(5, 1)).toBe(categoryCashTotal([{ denomination: 5, quantity: 1 }]));
  });

  it("a negative quantity contributes nothing, on both sides", () => {
    // Money cannot go backwards from a note count. Both implementations clamp
    // at zero rather than subtracting.
    for (const quantity of [-1, -7, -1_000_000]) {
      expect(denominationLineKobo(1000, quantity)).toBe(0);
      expect(denominationLineKobo(1000, quantity)).toBe(
        categoryCashTotal([{ denomination: 1000, quantity }]),
      );
    }
  });

  it("a fractional quantity truncates identically on both sides", () => {
    // Half a note is not a thing. Whatever either side does with it, they must
    // do the same thing, or the provisional total disagrees with the saved one.
    for (const quantity of [0.5, 1.5, 2.9, -0.5, -1.9]) {
      expect(denominationLineKobo(200, quantity)).toBe(
        categoryCashTotal([{ denomination: 200, quantity }]),
      );
    }
  });

  it("a whole category of counts sums the same as the server", () => {
    const counted = [
      { denomination: 1000, quantity: 12 },
      { denomination: 500, quantity: 8 },
      { denomination: 200, quantity: 30 },
      { denomination: 100, quantity: 20 },
      { denomination: 50, quantity: 40 },
      { denomination: 20, quantity: 3 },
      { denomination: 10, quantity: 11 },
      { denomination: 5, quantity: 7 },
    ];

    const clientTotal = counted.reduce(
      (runningTotal, line) =>
        runningTotal + denominationLineKobo(line.denomination, line.quantity),
      0,
    );

    // Stated exactly, not recomputed by the same arithmetic under test:
    // 1,200,000 + 400,000 + 600,000 + 200,000 + 200,000 + 6,000 + 11,000 + 3,500
    expect(clientTotal).toBe(2_620_500);
    expect(categoryCashTotal(counted)).toBe(2_620_500);
  });

  it("a count worth more than an Int column holds is produced, not refused", () => {
    // Nothing clamps at the column ceiling, on either side. Recorded as a
    // finding rather than hidden: the overflow surfaces at the database, not
    // here, and the two sides at least agree on the figure.
    const overCeiling = denominationLineKobo(1000, 30_000);
    expect(overCeiling).toBe(3_000_000_000);
    expect(overCeiling).toBeGreaterThan(INT_CEILING_KOBO);
    expect(categoryCashTotal([{ denomination: 1000, quantity: 30_000 }])).toBe(overCeiling);
  });
});

describe("koboToAmountInput satisfies the regex it names and round-trips", () => {
  const nonNegative = [
    0,
    1,
    9,
    10,
    99,
    100,
    101,
    350_050,
    1_000_000,
    4_830_000,
    INT_CEILING_KOBO - 1,
    INT_CEILING_KOBO,
  ];

  for (const amountKobo of nonNegative) {
    it(`${amountKobo} kobo produces a string the server accepts and reads back`, () => {
      const asInput = koboToAmountInput(amountKobo);

      expect(asInput).toMatch(UNSIGNED_AMOUNT);
      expect(nairaToKobo(asInput)).toBe(amountKobo);
    });
  }

  it("one kobo is 0.01, not 0 and not 1", () => {
    expect(koboToAmountInput(1)).toBe("0.01");
    expect(nairaToKobo("0.01")).toBe(1);
  });

  it("zero is a figure the field can hold", () => {
    expect(koboToAmountInput(0)).toBe("0");
    expect(nairaToKobo("0")).toBe(0);
  });

  it("the Int ceiling survives the trip", () => {
    expect(koboToAmountInput(INT_CEILING_KOBO)).toBe("21474836.47");
    expect(nairaToKobo("21474836.47")).toBe(INT_CEILING_KOBO);
  });

  it("never groups, never carries a currency mark", () => {
    // The field feeds a validator, not a reader. A formatted figure would be
    // rejected, and the rejection would be blamed on the treasurer.
    for (const amountKobo of nonNegative) {
      const asInput = koboToAmountInput(amountKobo);
      expect(asInput).not.toContain(",");
      expect(asInput).not.toContain("₦");
      expect(asInput).not.toContain(" ");
    }
  });

  it("round-trips every kobo value in a dense band", () => {
    const broken: number[] = [];

    for (let amountKobo = 0; amountKobo <= 50_000; amountKobo += 1) {
      const asInput = koboToAmountInput(amountKobo);
      if (!UNSIGNED_AMOUNT.test(asInput) || nairaToKobo(asInput) !== amountKobo) {
        broken.push(amountKobo);
      }
    }

    expect(broken).toEqual([]);
  });
});

/*
  A negative kobo value. The function handles a sign on purpose, but its own doc
  comment names only the unsigned validator, and that validator refuses the
  output. Asserted both ways rather than glossed: the round-trip is sound, the
  stated contract is not.
*/
describe("koboToAmountInput with a negative amount", () => {
  for (const amountKobo of [-1, -100, -350_050, -INT_CEILING_KOBO]) {
    it(`${amountKobo} round-trips through nairaToKobo`, () => {
      const asInput = koboToAmountInput(amountKobo);
      expect(nairaToKobo(asInput)).toBe(amountKobo);
    });

    it(`${amountKobo} is REFUSED by the unsigned regex the doc comment names`, () => {
      // Requirement: "this feeds an input and then the server's
      // /^\d+(\.\d{1,2})?$/". A negative output does not satisfy it. The only
      // server field that accepts a sign is the revision delta.
      const asInput = koboToAmountInput(amountKobo);
      expect(asInput).not.toMatch(UNSIGNED_AMOUNT);
      expect(asInput).toMatch(SIGNED_AMOUNT);
    });
  }

  it("negative zero does not produce a stray sign", () => {
    expect(koboToAmountInput(-0)).toBe("0");
    expect(koboToAmountInput(-0)).toMatch(UNSIGNED_AMOUNT);
  });
});

/*
  Fractional kobo. `koboToAmountInput` has no guard, where the server's `kobo()`
  refuses a fractional value outright. The same divergence money.test.ts already
  records for formatNaira, asserted here for the entry path so it fails the day
  either side changes.
*/
describe("fractional kobo into koboToAmountInput", () => {
  /*
    Fixed this round. It used to return "1.0.5" for 100.5 — 100.5 % 100 is 0.5,
    and padStart left the point in — which is not a number at all and would
    have reached a request body. It now refuses, the way the server's `kobo()`
    always has.
  */
  it.each([100.5, 0.5, -0.5, 1.000001, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses %p instead of emitting a malformed amount",
    (fractionalKobo) => {
      expect(() => koboToAmountInput(fractionalKobo)).toThrow(/whole kobo/);
    },
  );

  it("refuses with the same wording the server uses, so one message covers both", () => {
    expect(() => koboToAmountInput(100.5)).toThrow(
      "Money must be whole kobo, received 100.5",
    );
    // The server's own guard, for comparison.
    expect(() => koboOnServer(100.5)).toThrow("Money must be whole kobo, received 100.5");
  });

  it("the server still refuses the string the old behaviour would have produced", () => {
    // Belt and braces: even if a "1.005" ever reached a request, nairaToKobo
    // rejects it rather than parsing a third decimal place.
    expect(() => nairaToKobo("1.005")).toThrow(/Not an amount/);
    expect(() => nairaToKobo("1.0.5")).toThrow(/Not an amount/);
  });

  it("still accepts every whole kobo value either side of the guard", () => {
    expect(koboToAmountInput(100)).toBe("1");
    expect(koboToAmountInput(101)).toBe("1.01");
    expect(koboToAmountInput(-100)).toBe("-1");
  });
});
