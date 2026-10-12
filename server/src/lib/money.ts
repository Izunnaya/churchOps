/// Money is a whole number of kobo. ₦1 is 100 kobo, so ₦3,500.50 is 350050.
///
/// Nothing here is a float and nothing is a decimal. Integer addition is exact,
/// so the only rounding in the whole system happens in `percentOf`, where it is
/// deliberate and half-up. If a figure is ever wrong by a kobo, there is exactly
/// one function to look at.
///
/// A Postgres `Int` holds 2,147,483,647 kobo — about ₦21.4 million — per stored
/// value. That binds every single amount, and also the two whole-offering
/// totals that *are* stored: `OfferingRevision.originalTotalKobo` and
/// `revisedTotalKobo`. So an offering above ₦21.4 million finalizes but cannot
/// then be revised, because the revision's snapshot overflows the column. See
/// CONVENTIONS section 6 for the decision and when to revisit it.

import { Prisma } from "../generated/prisma/client";

export type Kobo = number;

export const ZERO: Kobo = 0;

const KOBO_PER_NAIRA = 100;

/// Either kobo already, or the naira string the request validators accept
/// ("3500", "3500.50", "-1200"). Converted once, at the edge.
export type KoboInput = Kobo | string | null | undefined;

/// A bucket rate, as stored: a percentage with up to two decimal places.
export type RateInput = Prisma.Decimal | number | string | null | undefined;

export function kobo(value: KoboInput): Kobo {
  if (value === null || value === undefined) return ZERO;

  if (typeof value === "number") {
    // A fractional kobo means something upstream did decimal arithmetic. Fail
    // loudly rather than silently truncating somebody's money.
    if (!Number.isInteger(value)) {
      throw new Error(`Money must be whole kobo, received ${value}`);
    }
    return value;
  }

  return nairaToKobo(value);
}

/// Naira as typed or validated, to kobo. The validators have already checked the
/// shape; this rejects anything else rather than guessing at it.
export function nairaToKobo(amount: string): Kobo {
  const parsed = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!parsed) throw new Error(`Not an amount: ${amount}`);

  const [, sign, naira, fraction = ""] = parsed;
  const minorUnits = Number((fraction + "00").slice(0, 2));
  const total = Number(naira) * KOBO_PER_NAIRA + minorUnits;

  return sign === "-" ? -total : total;
}

export function sum(values: KoboInput[]): Kobo {
  return values.reduce<Kobo>((total, value) => total + kobo(value), ZERO);
}

/// A percentage of an amount, to the nearest kobo, halves away from zero — the
/// same rule the decimal library applied before, kept so no figure moves.
///
/// percentOf(8_880_000, 10) === 888_000   (₦88,800 at 10% is ₦8,880)
export function percentOf(amount: KoboInput, ratePercent: RateInput): Kobo {
  // The amount is checked before the rate is looked at. A fractional amount is
  // a bug wherever it came from, and a rate of zero must not be the one case
  // that lets it through unnoticed.
  const amountKobo = kobo(amount);

  const rate = rateToHundredthsOfPercent(ratePercent);
  if (rate === 0) return ZERO;

  // amount x rate / 10_000. The widest real case is about 2.1e9 x 10_000,
  // which is 2.1e13 and well inside the 9e15 integers stay exact to.
  return divideHalfAwayFromZero(amountKobo * rate, 10_000);
}

/// A rate as the API states it: always two decimal places. A rate reaches us as
/// a `Decimal` whose `toString()` is "10", as the text "10" the validators
/// accept, or as `Decimal(10.00)`, and all three have to leave as "10.00" so one
/// client parser covers every endpoint that carries a rate.
export function formatRatePercent(rate: RateInput): string | null {
  if (rate === null || rate === undefined) return null;

  const hundredths = rateToHundredthsOfPercent(rate);
  const sign = hundredths < 0 ? "-" : "";
  const magnitude = Math.abs(hundredths);

  return `${sign}${Math.floor(magnitude / 100)}.${String(magnitude % 100).padStart(2, "0")}`;
}

/// 10 becomes 1000, 12.5 becomes 1250. Keeping the rate as an integer means the
/// deduction is integer arithmetic end to end.
function rateToHundredthsOfPercent(rate: RateInput): number {
  if (rate === null || rate === undefined) return 0;

  const asText = typeof rate === "string" ? rate.trim() : rate.toString();
  const parsed = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(asText);
  if (!parsed) throw new Error(`Not a percentage: ${asText}`);

  const [, sign, whole, fraction = ""] = parsed;
  const hundredths = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));

  return sign === "-" ? -hundredths : hundredths;
}

function divideHalfAwayFromZero(numerator: number, denominator: number): Kobo {
  const sign = numerator < 0 ? -1 : 1;
  const magnitude = Math.abs(numerator);

  return sign * Math.floor((magnitude * 2 + denominator) / (denominator * 2));
}

/// "₦48,300" — whole naira, because the design shows whole naira and lets
/// tabular numerals line the columns up. Kobo appear only when they are not
/// zero, which is rare and always worth seeing.
export function formatNaira(value: KoboInput): string {
  const total = kobo(value);
  const sign = total < 0 ? "-" : "";
  const magnitude = Math.abs(total);

  const naira = Math.floor(magnitude / KOBO_PER_NAIRA);
  const minorUnits = magnitude % KOBO_PER_NAIRA;
  const grouped = naira.toLocaleString("en-NG");

  return minorUnits === 0
    ? `${sign}₦${grouped}`
    : `${sign}₦${grouped}.${String(minorUnits).padStart(2, "0")}`;
}
