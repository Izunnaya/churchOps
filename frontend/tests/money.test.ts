/*
  frontend/src/lib/money.ts duplicates formatNaira from server/src/lib/money.ts.
  Two copies of the same arithmetic are only safe while they agree, so this file
  imports BOTH and compares them. The cases below come from the stated rules —
  whole naira, kobo only when non-zero, negatives, zero, grouping, and the
  ~N21.4m Int ceiling — not from either implementation's code.

  No server process is involved. Both modules are pure functions.
*/

import { describe, expect, it } from "vitest";
import { formatNaira as formatNairaOnClient } from "../src/lib/money";
import { formatNaira as formatNairaOnServer } from "../../server/src/lib/money";

/// The largest value a Postgres Int holds, in kobo: about N21,474,836.47.
const INT_CEILING_KOBO = 2_147_483_647;

describe("formatNaira, as the display rules state them", () => {
  const cases: [number, string][] = [
    // Zero is a figure, not an absence.
    [0, "₦0"],
    // Whole naira carry no decimal part at all.
    [100, "₦1"],
    [4_830_000, "₦48,300"],
    // Kobo appear only when they are not zero, and always as two digits.
    [1, "₦0.01"],
    [50, "₦0.50"],
    [99, "₦0.99"],
    [350_050, "₦3,500.50"],
    [100_001, "₦1,000.01"],
    // Grouping every three digits of the naira part, never the kobo part.
    [100_000_000, "₦1,000,000"],
    [100_000_000_0, "₦10,000,000"],
    // Negatives: the sign leads, in front of the currency mark.
    [-100, "-₦1"],
    [-350_050, "-₦3,500.50"],
    [-1, "-₦0.01"],
    // The ceiling the schema accepts, and one kobo under a whole naira.
    [INT_CEILING_KOBO, "₦21,474,836.47"],
    [INT_CEILING_KOBO - 47, "₦21,474,836"],
    [-INT_CEILING_KOBO, "-₦21,474,836.47"],
  ];

  for (const [amountKobo, expected] of cases) {
    it(`renders ${amountKobo} as ${expected} on both client and server`, () => {
      expect(formatNairaOnClient(amountKobo)).toBe(expected);
      expect(formatNairaOnServer(amountKobo)).toBe(expected);
    });
  }
});

describe("the two copies agree across the whole Int range", () => {
  it("agrees on every boundary and sampled value a column can hold", () => {
    const sampled: number[] = [];

    for (let amountKobo = 0; amountKobo <= 100_000; amountKobo += 1) {
      sampled.push(amountKobo, -amountKobo);
    }

    for (let exponent = 0; exponent <= 9; exponent += 1) {
      const magnitude = 10 ** exponent;
      sampled.push(magnitude - 1, magnitude, magnitude + 1);
      sampled.push(-(magnitude - 1), -magnitude, -(magnitude + 1));
    }

    sampled.push(INT_CEILING_KOBO, INT_CEILING_KOBO - 1, -INT_CEILING_KOBO);

    const divergent = sampled
      .filter((amountKobo) => Math.abs(amountKobo) <= INT_CEILING_KOBO)
      .filter(
        (amountKobo) =>
          formatNairaOnClient(amountKobo) !== formatNairaOnServer(amountKobo),
      );

    expect(divergent).toEqual([]);
  });
});

/*
  A known divergence, asserted rather than hidden. The server refuses a
  fractional kobo on purpose — "fail loudly rather than silently truncating
  somebody's money" — and the client copy carries no such guard, so the same
  input produces a figure on one side and an exception on the other. Reported as
  a finding; this test fails the day either side changes, which is the point.
*/
describe("fractional kobo, where the two copies part company", () => {
  for (const fractionalKobo of [0.5, 100.5, -0.5]) {
    it(`server refuses ${fractionalKobo} while the client silently truncates it`, () => {
      expect(() => formatNairaOnServer(fractionalKobo)).toThrow(
        /Money must be whole kobo/,
      );
      expect(() => formatNairaOnClient(fractionalKobo)).not.toThrow();
    });
  }

  it("client renders NaN as a figure instead of refusing it", () => {
    expect(() => formatNairaOnServer(Number.NaN)).toThrow();
    expect(formatNairaOnClient(Number.NaN)).toContain("NaN");
  });
});
