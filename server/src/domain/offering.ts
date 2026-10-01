import { Money, money, percentOf, round, serialize, sum, ZERO } from "../lib/money";

/// The note values the treasurer counts with. Ordered high to low because that
/// is the order the stepper list is entered in.
export const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5] as const;

export type DenominationInput = {
  denomination: number;
  quantity: number;
};

export type CategoryInput = {
  id?: string;
  name: string;
  isCash: boolean;
  /// Set only when isCash is false.
  transferAmount?: Money | string | number | null;
  denominations?: DenominationInput[];
};

export type BucketRates = Map<string, Money>;

export type CategoryTotals = {
  id?: string;
  name: string;
  isCash: boolean;
  /// What this category is worth, however it arrived.
  amount: Money;
  /// Cash counted note by note. Zero for a transfer category.
  cashTotal: Money;
  /// Money with no physical cash behind it. Zero for a cash category.
  transferTotal: Money;
  bucketRatePercent: Money | null;
  bucketDeduction: Money;
  netAmount: Money;
};

export type OfferingTotals = {
  categories: CategoryTotals[];
  /// Cash actually counted across every category.
  cashTotal: Money;
  /// Transfers, which legitimately have no cash behind them.
  transferTotal: Money;
  /// Everything, cash and transfer alike. This is the offering's total.
  categoriesTotal: Money;
  bucketTotal: Money;
  usableIncome: Money;
};

/// A category's cash total is the sum of its own note counts. This is the only
/// place a cash total is ever produced — the treasurer never types one, and it
/// is never stored, so it cannot go stale against the counts behind it.
export function categoryCashTotal(denominations: DenominationInput[] = []): Money {
  return sum(
    denominations.map(({ denomination, quantity }) =>
      money(denomination).mul(Math.max(0, Math.trunc(quantity))),
    ),
  );
}

/// A cash category is worth what was counted; a transfer category is worth its
/// stated amount. Nothing else is a valid source for a category amount.
export function categoryAmount(category: CategoryInput): Money {
  return category.isCash
    ? categoryCashTotal(category.denominations)
    : round(money(category.transferAmount));
}

/// Percentages are keyed by category name, matched case-insensitively so
/// "Tithe" and "tithe" cannot silently fall out of the bucket.
export function bucketRatesByName(
  rows: { name: string; bucketRatePercent: Money | string | number | null }[],
): BucketRates {
  const rates: BucketRates = new Map();
  for (const row of rows) {
    if (row.bucketRatePercent === null || row.bucketRatePercent === undefined) continue;
    rates.set(row.name.trim().toLowerCase(), money(row.bucketRatePercent));
  }
  return rates;
}

/// Every figure the Offering Entry and Full Financial Report screens show,
/// derived in one pass.
///
/// Note what is deliberately absent: there is no "discrepancy" or "balances"
/// flag. Cash and category totals differ whenever a transfer is present, and
/// the brief is explicit that this is normal and must never be surfaced as an
/// error. Callers that want to show the split read cashTotal and transferTotal.
export function computeOfferingTotals(
  categories: CategoryInput[],
  rates: BucketRates = new Map(),
): OfferingTotals {
  const rows: CategoryTotals[] = categories.map((category) => {
    const amount = categoryAmount(category);
    const rate = rates.get(category.name.trim().toLowerCase()) ?? null;
    const bucketDeduction = rate ? percentOf(amount, rate) : ZERO;

    return {
      id: category.id,
      name: category.name,
      isCash: category.isCash,
      amount,
      cashTotal: category.isCash ? amount : ZERO,
      transferTotal: category.isCash ? ZERO : amount,
      bucketRatePercent: rate,
      bucketDeduction,
      netAmount: amount.sub(bucketDeduction),
    };
  });

  const cashTotal = sum(rows.map((r) => r.cashTotal));
  const transferTotal = sum(rows.map((r) => r.transferTotal));
  const bucketTotal = sum(rows.map((r) => r.bucketDeduction));
  const categoriesTotal = cashTotal.add(transferTotal);

  return {
    categories: rows,
    cashTotal,
    transferTotal,
    categoriesTotal,
    bucketTotal,
    usableIncome: categoriesTotal.sub(bucketTotal),
  };
}

/// Shape sent to the client. Amounts go as strings to keep the precision that
/// JSON numbers would quietly drop.
export function serializeOfferingTotals(totals: OfferingTotals) {
  return {
    categories: totals.categories.map((c) => ({
      id: c.id,
      name: c.name,
      isCash: c.isCash,
      amount: serialize(c.amount),
      cashTotal: serialize(c.cashTotal),
      transferTotal: serialize(c.transferTotal),
      bucketRatePercent: c.bucketRatePercent ? c.bucketRatePercent.toFixed(2) : null,
      bucketDeduction: serialize(c.bucketDeduction),
      netAmount: serialize(c.netAmount),
    })),
    cashTotal: serialize(totals.cashTotal),
    transferTotal: serialize(totals.transferTotal),
    categoriesTotal: serialize(totals.categoriesTotal),
    bucketTotal: serialize(totals.bucketTotal),
    usableIncome: serialize(totals.usableIncome),
  };
}

/// A revision never rewrites the categories underneath it. The original total
/// is snapshotted, the delta is recorded, and the revised total is the two
/// added — so both figures stay visible side by side.
export function applyRevision(originalTotal: Money, deltaAmount: Money): Money {
  return round(originalTotal.add(deltaAmount));
}
