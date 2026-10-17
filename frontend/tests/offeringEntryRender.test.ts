/*
  Offering Entry (TRE-002), rendered.

  Everything here renders the REAL page, the REAL components and the REAL route
  table. Nothing is mocked and nothing is reimplemented: the offering is written
  into a query client the same way OfferingEntryPreviewPage writes its own, so
  the page reads it exactly as it would read a served one and performs no fetch.

  Written from the requirements the brief and the screen's own contract state:

  - the treasurer never types a total, at any level;
  - a category shows its name, how the money arrived, and what it is worth;
  - the bucket strip appears only where the response carries a rate, and reads
    as a routine set-aside, never a warning;
  - only a DRAFT is editable, and a finalized record is revised, never
    overwritten;
  - an offering with nothing counted says so rather than showing an empty list;
  - every Naira figure carries tabular numerals.

  Two limits, stated rather than worked around:

  * The suite runs in `environment: "node"` and no DOM library is installed, so
    this renders to static markup. Nothing here clicks anything. Behaviour that
    only exists after an interaction is NOT covered, and is called out in the
    report rather than asserted loosely here.
  * `StaticRouter` has to come from "react-router-dom". Importing it from
    "react-router" resolves a second copy of the module and the hooks throw.
*/

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StaticRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import AppRoutes from "@/AppRoutes";
import CategoryCard from "@/components/CategoryCard";
import OfferingEntryPage from "@/pages/OfferingEntryPage";
import { offeringKeys } from "@/api/OfferingApi";
import type { Offering, OfferingCategoryRow, OfferingStatus } from "@/types";

const OFFERING_ID = "offering-under-test";

/*
  A client with refetching off, seeded with the offering under test. Same device
  as the preview page uses, for the same reason: the page reads the cache and
  attempts no request, so no server and no network stub is involved.
*/
const seededClient = (offering: Offering) => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, refetchOnMount: false },
    },
  });
  client.setQueryData(offeringKeys.detail(offering.id), offering);
  return client;
};

const renderAt = (path: string, element: ReactElement): string =>
  renderToStaticMarkup(
    createElement(StaticRouter, { location: path }, element),
  );

/// The real page, at the real route shape, with the offering in cache.
const renderOffering = (offering: Offering): string =>
  renderAt(
    `/offerings/${offering.id}`,
    createElement(
      QueryClientProvider,
      { client: seededClient(offering) },
      createElement(AppRoutes),
    ),
  );

const cashCategory = (over: Partial<OfferingCategoryRow> = {}): OfferingCategoryRow => ({
  id: "category-tithe",
  name: "Tithe",
  isCash: true,
  amountKobo: 1_800_000,
  cashTotalKobo: 1_800_000,
  transferTotalKobo: 0,
  denominations: [
    { denomination: 1000, quantity: 12, lineTotalKobo: 1_200_000 },
    { denomination: 500, quantity: 8, lineTotalKobo: 400_000 },
    { denomination: 100, quantity: 20, lineTotalKobo: 200_000 },
  ],
  bucketRatePercent: "10.00",
  bucketDeductionKobo: 180_000,
  netAmountKobo: 1_620_000,
  ...over,
});

const offeringFixture = (over: Partial<Offering> = {}): Offering => ({
  id: OFFERING_ID,
  status: "DRAFT",
  notes: null,
  service: {
    id: "service-1",
    name: "Sunday Worship",
    kind: "SUNDAY_FIRST",
    heldOn: "2026-10-11T08:00:00.000Z",
  },
  categories: [cashCategory()],
  totals: {
    cashTotalKobo: 1_800_000,
    transferTotalKobo: 0,
    categoriesTotalKobo: 1_800_000,
    bucketTotalKobo: 180_000,
    usableIncomeKobo: 1_620_000,
  },
  revisions: [],
  originalTotalKobo: 1_800_000,
  revisedTotalKobo: 1_800_000,
  hasRevisions: false,
  recordedBy: { id: "user-1", fullName: "The Treasurer" },
  finalizedBy: null,
  finalizedAt: null,
  approvedBy: null,
  approvedAt: null,
  comments: [],
  createdAt: "2026-10-11T09:14:00.000Z",
  updatedAt: "2026-10-11T09:41:00.000Z",
  ...over,
});

/// Strips tags so a figure split across <span>s is still found as one string.
const textOf = (markup: string): string =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&rsquo;/g, "’")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();

// ---------------------------------------------------------------------------
// The preview route, which is how this screen is reachable today
// ---------------------------------------------------------------------------

describe("the /preview/offering-entry/:offeringId route", () => {
  const markup = renderAt("/preview/offering-entry/preview-offering", createElement(AppRoutes));
  const text = textOf(markup);

  it("renders the real screen without performing a fetch", () => {
    // If the page had fallen through to its error state this would say so.
    expect(text).not.toContain("This offering could not be opened");
    expect(text).not.toContain("Loading this offering");
    expect(text).toContain("Sunday Worship");
  });

  it("says plainly that the figures are invented", () => {
    // No real member data or figures in the repository. A preview that does not
    // announce itself is a screenshot waiting to be mistaken for a real week.
    expect(text).toContain("Design preview");
    expect(text.toLowerCase()).toContain("the figures are invented");
  });

  it("names the service kind and the date in words, not enum values", () => {
    expect(text).toContain("First service");
    expect(text).not.toContain("SUNDAY_FIRST");
    expect(text).toContain("2026");
  });

  it("shows a row per category, each with how the money arrived", () => {
    expect(text).toContain("Tithe");
    expect(text).toContain("Worship Offering");
    expect(text).toContain("Seed Faith");

    expect(text).toContain("Counted in cash");
    expect(text).toContain("Transfer, no cash counted");
  });

  it("shows the bucket strip only on the categories that carry a rate", () => {
    // Tithe and Seed Faith are rated at 10.00; Worship Offering is not rated at
    // all, and its card must carry no strip.
    const strips = markup.match(/% set aside/g) ?? [];
    expect(strips).toHaveLength(2);

    expect(text).toContain("10.00% set aside: ₦1,800 · leaves ₦16,200");
    expect(text).toContain("10.00% set aside: ₦2,500 · leaves ₦22,500");
  });

  it("states the bucket calmly, with no warning language", () => {
    for (const alarm of ["error", "invalid", "discrepancy", "does not balance", "mismatch"]) {
      expect(text.toLowerCase()).not.toContain(alarm);
    }
  });

  it("shows all five totals, as the server's figures", () => {
    expect(text).toContain("Cash counted ₦28,500");
    expect(text).toContain("Transfers ₦25,000");
    expect(text).toContain("Offering total ₦53,500");
    expect(text).toContain("Set aside ₦4,300");
    expect(text).toContain("Usable income ₦49,200");
  });

  it("explains the cash/total gap instead of flagging it", () => {
    expect(text).toContain(
      "Cash counted is lower than the offering total because transfers have no cash behind them. That is expected.",
    );
  });

  it("puts every Naira figure in a tabular-numeral element", () => {
    // Every ₦ in the document must sit inside an element carrying `money`.
    const nairaOutsideMoney = markup
      .split("₦")
      .slice(1)
      .filter((_segment, index) => {
        const before = markup.split("₦").slice(0, index + 1).join("₦");
        const lastOpen = before.lastIndexOf("<span");
        const lastClose = before.lastIndexOf("</span>");
        const openTag = before.slice(lastOpen, before.indexOf(">", lastOpen) + 1);
        return !(lastOpen > lastClose && /class="[^"]*\bmoney\b/.test(openTag));
      });

    expect(nairaOutsideMoney).toEqual([]);
  });

  it("offers the note steppers, high note to low", () => {
    const noteLabels = [...markup.matchAll(/How many ([\d,]+) naira notes/g)].map(
      (match) => match[1],
    );
    // Eight denominations on each of the two cash cards.
    expect(noteLabels.slice(0, 8)).toEqual([
      "1,000",
      "500",
      "200",
      "100",
      "50",
      "20",
      "10",
      "5",
    ]);
  });

  it("offers Finalize, because the offering is a DRAFT with categories on it", () => {
    expect(text).toContain("Finalize offering");
    expect(text).toContain("Add a category");
  });
});

// ---------------------------------------------------------------------------
// The empty state
// ---------------------------------------------------------------------------

describe("an offering with nothing counted yet", () => {
  const markup = renderOffering(
    offeringFixture({
      categories: [],
      totals: {
        cashTotalKobo: 0,
        transferTotalKobo: 0,
        categoriesTotalKobo: 0,
        bucketTotalKobo: 0,
        usableIncomeKobo: 0,
      },
      originalTotalKobo: 0,
      revisedTotalKobo: 0,
    }),
  );
  const text = textOf(markup);

  it("says what to do next rather than showing an empty list", () => {
    expect(text).toContain("Nothing counted yet");
    expect(text).toContain("Add the first category");
  });

  it("still offers the add form", () => {
    expect(text).toContain("Add a category");
  });

  it("does not offer Finalize with nothing to finalize", () => {
    // The server refuses it too ("Add at least one category before
    // finalizing"), so offering the button here would only produce an error.
    expect(text).not.toContain("Finalize offering");
  });

  it("shows zero as a figure, not as a blank", () => {
    expect(text).toContain("Offering total ₦0");
    expect(text).toContain("Usable income ₦0");
  });
});

// ---------------------------------------------------------------------------
// Read-only once the offering leaves DRAFT
// ---------------------------------------------------------------------------

describe.each<OfferingStatus>(["FINALIZED", "APPROVED", "REVISED"])(
  "an offering in %s",
  (status) => {
    const markup = renderOffering(offeringFixture({ status }));
    const text = textOf(markup);

    it("renders the status as an icon and a word", () => {
      const labels: Record<OfferingStatus, string> = {
        DRAFT: "Draft",
        FINALIZED: "Finalized",
        APPROVED: "Approved",
        REVISED: "Revised",
      };
      expect(text).toContain(labels[status]);
      // Status is never colour alone: the chip carries an icon beside the word.
      expect(markup).toMatch(/<svg[^>]*aria-hidden="true"/);
    });

    it("says the figures are locked and that a correction sits beside them", () => {
      expect(text).toContain("These figures are locked");
      expect(text).toContain("never replaces what was counted");
    });

    it("offers no way to edit a count", () => {
      expect(text).not.toContain("Save count");
      expect(text).not.toContain("Add a category");
      // Every stepper control carries the disabled attribute, so there is no
      // enabled control left on the card.
      const enabledStepperControls = [
        ...markup.matchAll(/<(?:button|input)((?:(?!>)[\s\S])*?)aria-label="(One more|One fewer|How many)[^"]*"((?:(?!>)[\s\S])*?)>/g),
      ].filter((match) => !`${match[1]}${match[3]}`.includes("disabled"));
      expect(enabledStepperControls).toEqual([]);
    });

    it("offers no Finalize", () => {
      expect(text).not.toContain("Finalize offering");
    });

    it("still shows every figure that was counted", () => {
      expect(text).toContain("Tithe");
      expect(text).toContain("Offering total ₦18,000");
      expect(text).toContain("Usable income ₦16,200");
    });

    it("leaves the note steppers on screen but disabled, not removed", () => {
      // The counts are the record. Hiding them would hide what was counted.
      expect(markup).toContain('aria-label="How many 1,000 naira notes"');
      expect(markup).toMatch(/How many 1,000 naira notes[^>]*disabled/);
    });
  },
);

// ---------------------------------------------------------------------------
// The Secretary's response, which omits the three bucket fields entirely
// ---------------------------------------------------------------------------

describe("a response with the per-category bucket fields absent", () => {
  const markup = renderOffering(
    offeringFixture({
      categories: [
        {
          id: "category-tithe",
          name: "Tithe",
          isCash: true,
          amountKobo: 1_800_000,
          cashTotalKobo: 1_800_000,
          transferTotalKobo: 0,
          denominations: [{ denomination: 1000, quantity: 18, lineTotalKobo: 1_800_000 }],
        },
      ],
    }),
  );
  const text = textOf(markup);

  it("renders no bucket strip at all, rather than a strip reading 0%", () => {
    expect(text).not.toContain("set aside:");
    expect(markup).not.toContain("% set aside");
  });

  it("still shows the aggregate set-aside, which is not gated", () => {
    expect(text).toContain("Set aside ₦1,800");
    expect(text).toContain("Usable income ₦16,200");
  });
});

// ---------------------------------------------------------------------------
// A revised offering: what the panel actually puts on screen
// ---------------------------------------------------------------------------

/*
  The requirement is the brief's: a correction is recorded beside the counted
  figure, both stay visible, and every figure on this panel is the server's.

  The fixture below is the server's own arithmetic, taken from
  presentOffering(): `totals.*` are computed from the CATEGORIES ONLY, and
  `revisedTotalKobo` is `categoriesTotalKobo` plus the sum of the deltas. So a
  ₦5,000 late transfer against an ₦18,000 offering rated at 10% gives
  totals.categoriesTotalKobo 1,800,000, totals.bucketTotalKobo 180,000,
  totals.usableIncomeKobo 1,620,000, originalTotalKobo 1,800,000 and
  revisedTotalKobo 2,300,000.
*/
describe("an offering carrying a correction", () => {
  const revised = offeringFixture({
    status: "REVISED",
    hasRevisions: true,
    revisions: [
      {
        id: "revision-1",
        reason: "Late transfer received Monday morning",
        categoryName: "Tithe",
        deltaAmountKobo: 500_000,
        originalTotalKobo: 1_800_000,
        revisedTotalKobo: 2_300_000,
        recordedAt: "2026-10-12T07:30:00.000Z",
        recordedBy: { id: "user-1", fullName: "The Treasurer" },
      },
    ],
    originalTotalKobo: 1_800_000,
    revisedTotalKobo: 2_300_000,
  });

  const markup = renderOffering(revised);
  const text = textOf(markup);

  it("keeps the original figure, the adjustment and the actor all on screen", () => {
    expect(text).toContain("Originally counted ₦18,000");
    expect(text).toContain("Revised total ₦23,000");
    expect(text).toContain("Late transfer received Monday morning");
    expect(text).toContain("₦5,000");
    expect(text).toContain("The Treasurer");
  });

  it("names the category the correction was made against", () => {
    expect(text).toContain("Corrections");
    expect(text).toContain("Tithe");
  });

  /*
    The defect this test exists to pin down.

    The panel shows "Offering total", "Set aside" and "Usable income" from
    `offering.totals`, which the server computes from the categories alone, and
    then shows "Revised total" underneath from a different basis. On screen the
    reader therefore gets:

        Offering total   ₦18,000
        Set aside        ₦1,800
        Usable income    ₦16,200
        After correction
        Originally counted ₦18,000
        Revised total      ₦23,000

    Nothing on the panel subtracts the set-aside from the revised total, and the
    ₦5,000 adjustment attracts no set-aside of its own. "Usable income" is the
    emphasised bottom line and it is ₦16,200 for an offering the same panel says
    is worth ₦23,000. The two figures cannot both be the week's answer.
  */
  it("FINDING: the emphasised Usable income does not reconcile with the revised total", () => {
    expect(text).toContain("Offering total ₦18,000");
    expect(text).toContain("Set aside ₦1,800");
    expect(text).toContain("Usable income ₦16,200");
    expect(text).toContain("Revised total ₦23,000");

    // Stated as the arithmetic a reader would do, in kobo.
    const offeringTotalKobo = 1_800_000;
    const setAsideKobo = 180_000;
    const usableIncomeKobo = 1_620_000;
    const revisedTotalKobo = 2_300_000;

    expect(offeringTotalKobo - setAsideKobo).toBe(usableIncomeKobo);
    // ...but against the revised figure the same subtraction gives ₦21,200,
    // which appears nowhere on the panel.
    expect(revisedTotalKobo - setAsideKobo).toBe(2_120_000);
    expect(text).not.toContain("₦21,200");
  });

  it("FINDING: shows the same number under two different labels", () => {
    // "Offering total" and "Originally counted" are both categoriesTotalKobo.
    // Where they agree, nothing tells the reader which one the week closed on.
    expect(text).toContain("Offering total ₦18,000");
    expect(text).toContain("Originally counted ₦18,000");
  });
});

// ---------------------------------------------------------------------------
// Counted-but-unsaved money, and what Finalize now knows about it
// ---------------------------------------------------------------------------

/*
  Round 1 found that Finalize could not see a card holding a counted-but-unsaved
  figure, so the money was frozen out of the offering and then vanished with the
  footer when the page re-rendered read-only.

  The fix in this revision: CategoryCard reports upward through a new
  `onUnsavedChange`, the page keeps the set of dirty category ids, and the
  Finalize confirmation is replaced by "Save your counts first" naming each
  card while any is outstanding.

  The BEHAVIOUR of that gate — typing, saving, removing, the wording, and the
  invariant that the page never instructs an action the card refuses — is
  exercised in tests/offeringEntryFinalizeGate.test.tsx, which runs under jsdom
  and drives real keystrokes and taps. It was unverifiable for two rounds and
  is not any longer.

  What stays HERE is what a static render is better at: the markup of the
  settled states, and the type-level shape of the channels. These render to
  static markup, so no effect runs and the clean state is what is seen — which
  is exactly right for asserting that the gate does not fire when nothing is
  wrong.
*/
describe("Finalize and unsaved counts, after the fix", () => {
  const draft = renderOffering(offeringFixture());
  const draftText = textOf(draft);
  const finalized = renderOffering(offeringFixture({ status: "FINALIZED" }));
  const finalizedText = textOf(finalized);

  it("a clean DRAFT still offers Finalize, and does not warn about nothing", () => {
    // A guard that fires when there is nothing outstanding is its own defect:
    // she would learn to tap past it.
    expect(draftText).toContain("Finalize offering");
    expect(draftText).not.toContain("Save your counts first");
  });

  it("the provisional subtotal and its marker still live only in the editable footer", () => {
    expect(draftText).toContain("Counted:");
    expect(draftText).toContain("Save count");

    expect(finalizedText).not.toContain("Counted:");
    expect(finalizedText).not.toContain("Counted so far");
    expect(finalizedText).not.toContain("not saved yet");
    expect(finalizedText).not.toContain("Save count");
  });

  it("a card holding a note value the list has retired shows no counted line", () => {
    /*
      Also new this revision. The provisional subtotal folds over the current
      note list only, so with a retired note present it would read LOWER than
      the header's figure with nothing to say why — a settled-looking number
      that is short by the retired notes. The header keeps the server's figure.
    */
    const withRetiredNote = renderOffering(
      offeringFixture({
        categories: [
          cashCategory({
            denominations: [
              { denomination: 1000, quantity: 12, lineTotalKobo: 1_200_000 },
              // No longer in DENOMINATIONS.
              { denomination: 2000, quantity: 3, lineTotalKobo: 600_000 },
            ],
          }),
        ],
      }),
    );
    const retiredText = textOf(withRetiredNote);

    expect(retiredText).toContain("a note value the current list does not carry");
    expect(retiredText).not.toContain("Counted:");
    expect(retiredText).not.toContain("Counted so far");
    // The header still shows the whole count, which is the point.
    expect(retiredText).toContain("₦18,000");
  });
});

/*
  The type-level half, checked by `npm run typecheck`. These are the shapes the
  gate is built on; if any is removed or made optional, the block stops being
  reachable and this stops compiling — which a behavioural test cannot catch,
  because a missing optional prop is not a runtime error.

  Written as legal TypeScript. An earlier round wrote
  `Parameters<typeof OfferingEntryPage>[0]`, which indexes position 0 of an
  empty tuple — correct as a claim, not legal as an expression (TS2493). A
  conditional type states the same thing without indexing.
*/
describe("the shapes the fix introduced", () => {
  it("OfferingEntryPage still takes no props, so the gate is the page's own", () => {
    // `[] extends []` is true; if the page ever grew a prop this would be false
    // and the assignment below would not compile.
    type TakesNoProps = Parameters<typeof OfferingEntryPage> extends [] ? true : false;
    const pageTakesNoProps: TakesNoProps = true;

    expect(pageTakesNoProps).toBe(true);
  });

  it("CategoryCard now has a channel to report unsaved counts upward", () => {
    type CardProps = Parameters<typeof CategoryCard>[0];

    const report: CardProps["onUnsavedChange"] = (categoryId, hasUnsavedCounts) => {
      expect(typeof categoryId).toBe("string");
      expect(typeof hasUnsavedCounts).toBe("boolean");
    };

    report("category-tithe", true);
  });

  it("that channel is REQUIRED, not optional, so no caller can omit the gate", () => {
    type CardProps = Parameters<typeof CategoryCard>[0];
    // If `onUnsavedChange` were optional its type would include undefined, and
    // this would have to be `true` instead.
    type IsOptional = undefined extends CardProps["onUnsavedChange"] ? true : false;
    const channelIsOptional: IsOptional = false;

    expect(channelIsOptional).toBe(false);
  });

  it("the card reports both directions, so a count saved retracts the block", () => {
    // A one-way flag would leave Finalize blocked forever after one keystroke.
    type CardProps = Parameters<typeof CategoryCard>[0];
    type Reporter = CardProps["onUnsavedChange"];
    const retracts: Reporter = () => undefined;

    // Boolean, not a bare "it is dirty" signal.
    retracts("category-tithe", false);
    expect(typeof retracts).toBe("function");
  });

  it("there is a SECOND, separate channel for an amount the card will not save", () => {
    /*
      The two cannot be one flag. "Dirty" means Finalize must wait and Save
      count is available; "unsavable" means Save count is greyed out. Collapsed
      into one, the page sends her to tap a button the card refuses to enable —
      which is the defect this channel was added to close.
    */
    type CardProps = Parameters<typeof CategoryCard>[0];

    const reportUnsavable: CardProps["onUnsavableAmountChange"] = (
      categoryId,
      hasUnsavableAmount,
    ) => {
      expect(typeof categoryId).toBe("string");
      expect(typeof hasUnsavableAmount).toBe("boolean");
    };

    reportUnsavable("category-seed", true);
    reportUnsavable("category-seed", false);
  });

  it("that second channel is REQUIRED too, so no caller can skip it", () => {
    type CardProps = Parameters<typeof CategoryCard>[0];
    type IsOptional = undefined extends CardProps["onUnsavableAmountChange"] ? true : false;
    const channelIsOptional: IsOptional = false;

    expect(channelIsOptional).toBe(false);
  });

  it("the two channels are distinct props, not one renamed", () => {
    type CardProps = Parameters<typeof CategoryCard>[0];
    type BothPresent = "onUnsavedChange" extends keyof CardProps
      ? "onUnsavableAmountChange" extends keyof CardProps
        ? true
        : false
      : false;
    const bothPresent: BothPresent = true;

    expect(bothPresent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The preview route's new id guard
// ---------------------------------------------------------------------------

describe("the preview route refuses any id but its own", () => {
  it("renders the fixture at the one id it is seeded under", () => {
    const markup = renderAt("/preview/offering-entry/preview-offering", createElement(AppRoutes));
    const text = textOf(markup);

    expect(text).toContain("Sunday Worship");
    expect(text).not.toContain("This offering could not be opened");
  });

  it("redirects any other id rather than pointing Save and Finalize at a real record", () => {
    // Previously the page seeded the cache under whatever the address said, so
    // /preview/offering-entry/<a real id> rendered invented figures with the
    // real id behind every mutation.
    const markup = renderAt(
      "/preview/offering-entry/some-real-looking-id",
      createElement(AppRoutes),
    );
    const text = textOf(markup);

    // A redirect renders nothing on this pass.
    expect(text).not.toContain("Sunday Worship");
    expect(text).not.toContain("Design preview");
  });
});
