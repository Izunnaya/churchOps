/*
  Kobo to Naira, for display only.

  This is the one place on the client where the unit changes, mirroring
  formatNaira in server/src/lib/money.ts so a figure reads the same in a PDF and
  on a phone. It is deliberately a single function in a single file: a kobo gets
  dropped when the same arithmetic is retyped per screen, and dividing money
  inline is how `parseInt((price / 100).toFixed(2))` ate the minor units in the
  reference repo (CONVENTIONS section 7, bug 6).

  Nothing here parses, rounds or totals anything. The server owns every total.
  The device may compute a provisional subtotal while counting, in whole kobo,
  and label it as provisional until saved.
*/

const KOBO_PER_NAIRA = 100;

/*
  The shape of an amount a request may carry, mirroring the unsigned `amount`
  validator in server/src/modules/offerings/offerings.router.ts.

  It lives here, beside the conversion, because two screens check it — the add
  form's zod schema and the category card's transfer field. Kept as one copy on
  purpose: when it was two, loosening the server's rule meant finding both, and
  missing the card left Save count greyed out on a value the form had just
  accepted. CONVENTIONS section 1.

  The server's signed variant, /^-?\d+(\.\d{1,2})?$/, applies to a revision
  delta only, and no screen built so far collects one.
*/
export const NAIRA_AMOUNT = /^\d+(\.\d{1,2})?$/;

/*
  A note count becomes money here and nowhere else: a denomination is a naira
  FACE VALUE (which note she is holding), so it takes the same multiplication
  the server applies in categoryCashTotal. Used for the provisional subtotal the
  device shows while counting, which the server then recomputes and replaces.
*/
export function denominationLineKobo(denomination: number, quantity: number): number {
  return denomination * KOBO_PER_NAIRA * Math.max(0, Math.trunc(quantity));
}

/*
  Kobo to the plain naira string a request carries — "2500.75", "2500". No ₦ and
  no grouping, because this feeds an input and then a server validator, and both
  reject a formatted figure.

  Which validator depends on the sign, and the two are not the same rule. A
  zero or positive amount satisfies `NAIRA_AMOUNT` above, the unsigned `amount`
  rule every category field uses. A negative amount comes back as "-2500", which
  that rule refuses by design; the only server field accepting a sign is the
  revision delta, /^-?\d+(\.\d{1,2})?$/. So never feed a negative result to a
  category amount field — the round trip through the server's nairaToKobo is
  exact either way, but the validator in front of it is not.

  A fractional kobo throws, as the server's `kobo()` does, and for the same
  reason: it means decimal arithmetic happened somewhere upstream, and the
  alternative here is emitting "1.0.5", which is not a number at all.
*/
export function koboToAmountInput(amountKobo: number): string {
  if (!Number.isInteger(amountKobo)) {
    throw new Error(`Money must be whole kobo, received ${amountKobo}`);
  }

  const sign = amountKobo < 0 ? "-" : "";
  const magnitude = Math.abs(amountKobo);

  const naira = Math.floor(magnitude / KOBO_PER_NAIRA);
  const minorUnits = magnitude % KOBO_PER_NAIRA;

  return minorUnits === 0
    ? `${sign}${naira}`
    : `${sign}${naira}.${String(minorUnits).padStart(2, "0")}`;
}

/*
  "₦48,300". Whole naira, because the design shows whole naira and tabular
  numerals line the columns up. Kobo appear only when they are not zero, which
  is rare and always worth seeing.

  Render it in an element carrying the `money` utility, or `tabular-nums`.
*/
export function formatNaira(amountKobo: number): string {
  const sign = amountKobo < 0 ? "-" : "";
  const magnitude = Math.abs(amountKobo);

  const naira = Math.floor(magnitude / KOBO_PER_NAIRA);
  const minorUnits = magnitude % KOBO_PER_NAIRA;
  const grouped = naira.toLocaleString("en-NG");

  return minorUnits === 0
    ? `${sign}₦${grouped}`
    : `${sign}₦${grouped}.${String(minorUnits).padStart(2, "0")}`;
}
