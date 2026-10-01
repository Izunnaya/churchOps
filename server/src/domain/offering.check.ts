// Reproduces the worked example rendered in desktop-kit.js (`wkLeft`) — the
// design's own numbers are the fixture.
import { bucketRatesByName, computeOfferingTotals, categoryCashTotal } from "./offering";
import { formatNaira } from "../lib/money";

const rates = bucketRatesByName([
  { name: "Tithe", bucketRatePercent: 10 },
  { name: "Worship Offering", bucketRatePercent: 10 },
  { name: "Thanksgiving", bucketRatePercent: null },
  { name: "Seed Faith", bucketRatePercent: null },
]);

const totals = computeOfferingTotals(
  [
    // Cash, counted note by note: 88 x 1000 + 1 x 500 + 1 x 200 + 1 x 100 = 88,800
    {
      name: "Tithe",
      isCash: true,
      denominations: [
        { denomination: 1000, quantity: 88 },
        { denomination: 500, quantity: 1 },
        { denomination: 200, quantity: 1 },
        { denomination: 100, quantity: 1 },
      ],
    },
    // 29 x 1000 + -- 29,400
    {
      name: "Worship Offering",
      isCash: true,
      denominations: [
        { denomination: 1000, quantity: 29 },
        { denomination: 200, quantity: 2 },
      ],
    },
    { name: "Thanksgiving", isCash: true, denominations: [{ denomination: 100, quantity: 123 }] },
    // Transfer: no cash behind it at all.
    { name: "Seed Faith", isCash: false, transferAmount: 3500 },
  ],
  rates,
);

const expected: Record<string, string> = {
  "Tithe amount": "₦88,800",
  "Tithe net": "₦79,920",
  "Worship Offering amount": "₦29,400",
  "Worship Offering net": "₦26,460",
  "Set aside to bucket": "₦11,820",
  "Categories total": "₦134,000",
  "Usable income": "₦122,180",
};

const actual: Record<string, string> = {
  "Tithe amount": formatNaira(totals.categories[0].amount),
  "Tithe net": formatNaira(totals.categories[0].netAmount),
  "Worship Offering amount": formatNaira(totals.categories[1].amount),
  "Worship Offering net": formatNaira(totals.categories[1].netAmount),
  "Set aside to bucket": formatNaira(totals.bucketTotal),
  "Categories total": formatNaira(totals.categoriesTotal),
  "Usable income": formatNaira(totals.usableIncome),
};

let failures = 0;
for (const key of Object.keys(expected)) {
  const ok = expected[key] === actual[key];
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${key.padEnd(22)} expected ${expected[key].padStart(9)}  got ${actual[key].padStart(9)}`);
}

// The cash/transfer split must stay visible and must NOT read as an imbalance.
console.log("");
console.log(`cash counted      ${formatNaira(totals.cashTotal)}`);
console.log(`transfers         ${formatNaira(totals.transferTotal)}`);
console.log(`difference        ${formatNaira(totals.categoriesTotal.sub(totals.cashTotal))}  <- normal, a transfer with no cash behind it`);

// A category with no counts entered yet is zero, not an error.
console.log("");
console.log(`empty category    ${formatNaira(categoryCashTotal([]))}`);

process.exit(failures === 0 ? 0 : 1);
