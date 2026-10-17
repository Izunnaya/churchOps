/*
  What `presentOffering` actually puts on the wire.

  This calls the REAL function from
  server/src/modules/offerings/offerings.service.ts. Nothing is mocked. It needs
  no database because a FINALIZED offering takes the `frozenRates` branch, which
  reads the rate off each category row instead of querying the rate table, so
  the figures below come out of the same code the endpoint will run when a
  router is finally mounted.

  It asserts nothing about an endpoint. No router is mounted in this slice.
  What it pins is the shape and the arithmetic of the read model, and in
  particular the one change this round made to money-path code: adding
  `id: category.id` to the category row. "Type-only" was the claim; a key order
  or a value that moved would make it false.
*/

import { describe, expect, it } from "vitest";
import {
  categoryCashTotal,
  computeOfferingTotals,
  type CategoryInput,
} from "../../server/src/domain/offering";
import {
  presentOffering,
  type OfferingWithRelations,
} from "../../server/src/modules/offerings/offerings.service";

/*
  Invented figures, invented names. A cash category counted note by note and a
  transfer category stated as an amount, because the two take different branches
  through categoryAmount. The 10% rate is frozen onto the cash category the way
  finalize freezes it, and the transfer category has no rate at all.
*/
const financeFixture = {
  id: "offering-finalized-1",
  churchId: "church-a",
  status: "FINALIZED",
  notes: null,
  service: {
    id: "service-1",
    name: "Sunday First Service",
    kind: "SUNDAY_FIRST",
    heldOn: new Date("2026-03-01T08:00:00.000Z"),
  },
  categories: [
    {
      id: "category-tithe",
      name: "Tithe",
      isCash: true,
      transferAmountKobo: null,
      bucketRateSnapshot: "10",
      denominations: [
        { denomination: 1000, quantity: 3 },
        { denomination: 50, quantity: 7 },
      ],
    },
    {
      id: "category-online",
      name: "Online Giving",
      isCash: false,
      transferAmountKobo: 250_075,
      bucketRateSnapshot: null,
      denominations: [],
    },
  ],
  revisions: [],
  comments: [],
  recordedBy: null,
  finalizedBy: null,
  finalizedAt: new Date("2026-03-01T11:00:00.000Z"),
  approvedBy: null,
  approvedAt: null,
  createdAt: new Date("2026-03-01T09:00:00.000Z"),
  updatedAt: new Date("2026-03-01T11:00:00.000Z"),
} as unknown as OfferingWithRelations;

describe("the category row the treasurer screen receives", () => {
  it("carries a non-empty id taken from the saved row, in first position", async () => {
    const presented = await presentOffering(financeFixture, { showBucketRates: true });

    expect(Object.keys(presented.categories[0]!)).toEqual([
      "id",
      "name",
      "isCash",
      "amountKobo",
      "cashTotalKobo",
      "transferTotalKobo",
      "bucketRatePercent",
      "bucketDeductionKobo",
      "netAmountKobo",
      "denominations",
    ]);

    expect(presented.categories.map((category) => category.id)).toEqual([
      "category-tithe",
      "category-online",
    ]);
  });

  it("still omits the three bucket fields for a Secretary, and still carries the id", async () => {
    const presented = await presentOffering(financeFixture, { showBucketRates: false });

    expect(Object.keys(presented.categories[0]!)).toEqual([
      "id",
      "name",
      "isCash",
      "amountKobo",
      "cashTotalKobo",
      "transferTotalKobo",
      "denominations",
    ]);
    expect(presented.categories[0]!.id).toBe("category-tithe");
  });
});

describe("the exact kobo this offering is worth", () => {
  it("counts notes, applies the frozen rate, and totals to whole kobo", async () => {
    const presented = await presentOffering(financeFixture, { showBucketRates: true });

    const cash = presented.categories[0]!;
    const transfer = presented.categories[1]!;

    // 3 x N1000 = 300,000 kobo; 7 x N50 = 35,000 kobo.
    expect(cash.denominations.map((line) => line.lineTotalKobo)).toEqual([300_000, 35_000]);
    expect(cash.amountKobo).toBe(335_000);
    expect(cash.cashTotalKobo).toBe(335_000);
    expect(cash.transferTotalKobo).toBe(0);
    // 10% of 335,000 kobo, exact, no fraction of a kobo left over.
    expect(cash.bucketRatePercent).toBe("10.00");
    expect(cash.bucketDeductionKobo).toBe(33_500);
    expect(cash.netAmountKobo).toBe(301_500);

    // A transfer category has no notes behind it and no rate frozen onto it.
    expect(transfer.amountKobo).toBe(250_075);
    expect(transfer.cashTotalKobo).toBe(0);
    expect(transfer.transferTotalKobo).toBe(250_075);
    expect(transfer.bucketRatePercent).toBeNull();
    expect(transfer.bucketDeductionKobo).toBe(0);

    expect(presented.totals).toEqual({
      cashTotalKobo: 335_000,
      transferTotalKobo: 250_075,
      categoriesTotalKobo: 585_075,
      bucketTotalKobo: 33_500,
      usableIncomeKobo: 551_575,
    });

    // Every figure is a whole number of kobo, never a float.
    for (const amount of Object.values(presented.totals)) {
      expect(Number.isInteger(amount)).toBe(true);
    }
  });
});

describe("the claim that adding an id to the category row moved nothing on the wire", () => {
  /*
    The change was one line inserted after `...row` in presentOffering. `row`
    already carries an `id`, because computeOfferingTotals copies it off
    CategoryInput and toCategoryInputs fills it from the Prisma row. Assigning
    an existing own property updates it in place and does not re-order it, so
    the before and the after must serialize to the same bytes.

    This reproduces both spellings over the real computeOfferingTotals output
    rather than trusting the reasoning.
  */
  it("serializes identically with and without the added line", () => {
    const inputs: CategoryInput[] = [
      {
        id: "category-tithe",
        name: "Tithe",
        isCash: true,
        transferAmountKobo: null,
        denominations: [
          { denomination: 1000, quantity: 3 },
          { denomination: 50, quantity: 7 },
        ],
      },
    ];
    const totals = computeOfferingTotals(inputs, new Map([["tithe", "10"]]));

    const { bucketRatePercent, bucketDeductionKobo, netAmountKobo, ...row } =
      totals.categories[0]!;

    const before = {
      ...row,
      bucketRatePercent,
      bucketDeductionKobo,
      netAmountKobo,
      denominations: [],
    };
    const after = {
      ...row,
      id: inputs[0]!.id,
      bucketRatePercent,
      bucketDeductionKobo,
      netAmountKobo,
      denominations: [],
    };

    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    expect(Object.keys(after)).toEqual(Object.keys(before));
    expect(after.id).toBe("category-tithe");
  });

  it("leaves the provisional total path, which has no saved row, still working", () => {
    /*
      CategoryInput.id and CategoryTotals.id stay optional for the
      count-in-progress total the device shows before anything is saved.
      Narrowing them would have broken this. The figures must be the same as
      the saved path's.
    */
    const provisional: CategoryInput[] = [
      {
        name: "Tithe",
        isCash: true,
        denominations: [
          { denomination: 1000, quantity: 3 },
          { denomination: 50, quantity: 7 },
        ],
      },
    ];

    const totals = computeOfferingTotals(provisional, new Map([["tithe", "10"]]));

    expect(totals.categories[0]!.id).toBeUndefined();
    expect(totals.categories[0]!.amountKobo).toBe(335_000);
    expect(totals.categories[0]!.bucketDeductionKobo).toBe(33_500);
    expect(totals.categoriesTotalKobo).toBe(335_000);
    expect(totals.usableIncomeKobo).toBe(301_500);

    // An absent id must not reach the wire as a null.
    expect(JSON.stringify(totals.categories[0])).not.toContain('"id"');

    // And the device's provisional arithmetic is the server's own function.
    expect(categoryCashTotal(provisional[0]!.denominations)).toBe(335_000);
  });
});
