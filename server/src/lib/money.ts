import { Prisma } from "../generated/prisma/client";

export type Money = Prisma.Decimal;
export const Money = Prisma.Decimal;

export const ZERO = new Prisma.Decimal(0);

export type MoneyInput = Prisma.Decimal | number | string | null | undefined;

export function money(value: MoneyInput): Money {
  if (value === null || value === undefined) return ZERO;
  return new Prisma.Decimal(value);
}

export function sum(values: MoneyInput[]): Money {
  return values.reduce<Money>((total, value) => total.add(money(value)), ZERO);
}

/// Bank-note quantities are whole numbers, but transfers and percentage
/// deductions are not, so every amount settles at 2dp half-up before it is
/// shown or stored.
export function round(value: Money): Money {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/// Percentage of an amount, e.g. percentOf(88_800, 10) === 8_880.
export function percentOf(amount: MoneyInput, ratePercent: MoneyInput): Money {
  return round(money(amount).mul(money(ratePercent)).div(100));
}

/// Amounts cross the API as strings so no precision is lost to JSON numbers.
export function serialize(value: MoneyInput): string {
  return round(money(value)).toFixed(2);
}

/// "₦48,300" — the design shows whole naira, with tabular numerals doing the
/// column alignment rather than trailing zeroes.
export function formatNaira(value: MoneyInput): string {
  const rounded = round(money(value));
  const hasKobo = !rounded.equals(rounded.trunc());
  return `₦${rounded.toNumber().toLocaleString("en-NG", {
    minimumFractionDigits: hasKobo ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
