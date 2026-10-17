/*
  The note values the treasurer counts with, in NAIRA FACE VALUE — which note
  she is holding, not an amount of money. This is the one place in the app where
  the unit is not kobo, and it is copied verbatim from
  server/src/domain/offering.ts, which carries the same warning. A count becomes
  money only when multiplied: denomination * 100 * quantity gives kobo.

  High to low, because that is the order the stepper list is entered in.
*/
export const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5] as const;

export type Denomination = (typeof DENOMINATIONS)[number];
