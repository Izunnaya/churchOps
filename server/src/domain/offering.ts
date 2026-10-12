import { kobo, percentOf, sum, ZERO, type Kobo } from "../lib/money";

/// The note values the treasurer counts with, in naira. These are face values —
/// which note she is holding — not amounts of money being added up, which is why
/// they are not kobo. The one place they become money is `categoryCashTotal`.
///
/// Ordered high to low because that is the order the stepper list is entered in.
export const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5] as const;

const KOBO_PER_NAIRA = 100;

export type DenominationInput = {
  /// A naira face value from DENOMINATIONS.
  denomination: number;
  quantity: number;
};

export type CategoryInput = {
  id?: string;
  name: string;
  isCash: boolean;
  /// Set only when isCash is false.
  transferAmountKobo?: Kobo | string | null;
  denominations?: DenominationInput[];
};

/// A percentage, as written: "10", "12.5". Not money, so not kobo.
export type BucketRates = Map<string, string>;

export type CategoryTotals = {
  id?: string;
  name: string;
  isCash: boolean;
  /// What this category is worth, however it arrived.
  amountKobo: Kobo;
  /// Cash counted note by note. Zero for a transfer category.
  cashTotalKobo: Kobo;
  /// Money with no physical cash behind it. Zero for a cash category.
  transferTotalKobo: Kobo;
  bucketRatePercent: string | null;
  bucketDeductionKobo: Kobo;
  netAmountKobo: Kobo;
};

export type OfferingTotals = {
  categories: CategoryTotals[];
  /// Cash actually counted across every category.
  cashTotalKobo: Kobo;
  /// Transfers, which legitimately have no cash behind them.
  transferTotalKobo: Kobo;
  /// Everything, cash and transfer alike. This is the offering's total.
  categoriesTotalKobo: Kobo;
  bucketTotalKobo: Kobo;
  usableIncomeKobo: Kobo;
};

/// A category's cash total is the sum of its own note counts. This is the only
/// place a cash total is ever produced — the treasurer never types one, and it
/// is never stored, so it cannot go stale against the counts behind it.
///
/// Also the only place a naira face value becomes kobo.
export function categoryCashTotal(denominations: DenominationInput[] = []): Kobo {
  return denominations.reduce<Kobo>(
    (total, { denomination, quantity }) =>
      total + denomination * KOBO_PER_NAIRA * Math.max(0, Math.trunc(quantity)),
    ZERO,
  );
}

/// A cash category is worth what was counted; a transfer category is worth its
/// stated amount. Nothing else is a valid source for a category amount.
export function categoryAmount(category: CategoryInput): Kobo {
  return category.isCash
    ? categoryCashTotal(category.denominations)
    : kobo(category.transferAmountKobo);
}

/// Percentages are keyed by category name, matched case-insensitively so
/// "Tithe" and "tithe" cannot silently fall out of the bucket.
export function bucketRatesByName(
  rows: { name: string; bucketRatePercent: { toString(): string } | string | number | null }[],
): BucketRates {
  const rates: BucketRates = new Map();
  for (const row of rows) {
    if (row.bucketRatePercent === null || row.bucketRatePercent === undefined) continue;
    rates.set(row.name.trim().toLowerCase(), row.bucketRatePercent.toString());
  }
  return rates;
}

/// Every figure the Offering Entry and Full Financial Report screens show,
/// derived in one pass.
///
/// Note what is deliberately absent: there is no "discrepancy" or "balances"
/// flag. Cash and category totals differ whenever a transfer is present, and
/// the brief is explicit that this is normal and must never be surfaced as an
/// error. Callers that want to show the split read the cash and transfer totals.
export function computeOfferingTotals(
  categories: CategoryInput[],
  rates: BucketRates = new Map(),
): OfferingTotals {
  const rows: CategoryTotals[] = categories.map((category) => {
    const amountKobo = categoryAmount(category);
    const rate = rates.get(category.name.trim().toLowerCase()) ?? null;
    const bucketDeductionKobo = rate === null ? ZERO : percentOf(amountKobo, rate);

    return {
      id: category.id,
      name: category.name,
      isCash: category.isCash,
      amountKobo,
      cashTotalKobo: category.isCash ? amountKobo : ZERO,
      transferTotalKobo: category.isCash ? ZERO : amountKobo,
      bucketRatePercent: rate,
      bucketDeductionKobo,
      netAmountKobo: amountKobo - bucketDeductionKobo,
    };
  });

  const cashTotalKobo = sum(rows.map((row) => row.cashTotalKobo));
  const transferTotalKobo = sum(rows.map((row) => row.transferTotalKobo));
  const bucketTotalKobo = sum(rows.map((row) => row.bucketDeductionKobo));
  const categoriesTotalKobo = cashTotalKobo + transferTotalKobo;

  return {
    categories: rows,
    cashTotalKobo,
    transferTotalKobo,
    categoriesTotalKobo,
    bucketTotalKobo,
    usableIncomeKobo: categoriesTotalKobo - bucketTotalKobo,
  };
}

/// A revision never rewrites the categories underneath it. The original total
/// is snapshotted, the delta is recorded, and the revised total is the two
/// added — so both figures stay visible side by side.
export function applyRevision(originalTotalKobo: Kobo, deltaAmountKobo: Kobo): Kobo {
  return originalTotalKobo + deltaAmountKobo;
}
