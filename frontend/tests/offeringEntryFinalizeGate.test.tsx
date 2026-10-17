// @vitest-environment jsdom

/*
  The finalize gate, EXECUTED.

  This is the safeguard that stops counted money being frozen out of an
  offering, and until this file it had never been run — twice reported as
  structural-only, because the card reports through a `useEffect` and nothing
  in this package could run one.

  What is real here: the page, the cards, the steppers, the API hooks, the
  transport in lib/api-client.ts, react-query, and the router. Taps and
  keystrokes go through Testing Library into the real handlers.

  What is replaced: `fetch`, and only `fetch`. No offering endpoint is mounted
  on the server — every one of them answers 404 — so the network boundary is
  the one thing that has to be stood in for. The stand-in is deliberately dumb:
  it records the request, applies the change to the fixture, and hands the
  result back in the server's envelope. It decides nothing this file asserts
  about the page's behaviour, and the request shapes it records are themselves
  asserted against what the server's routers accept.

  The invariant worth pinning above all others, and the one the engineer's two
  channels exist to hold:

      THE PAGE NEVER INSTRUCTS AN ACTION THE CARD REFUSES.

  If the page says "tap Save count" against a card, that card's Save count must
  be enabled. It is checked in every blocked state below, through one helper,
  rather than being asserted once and assumed after.

  No @testing-library/user-event and no @testing-library/jest-dom: neither is
  installed, and neither is needed. `fireEvent.change` drives a controlled
  input correctly, and `disabled` is a property worth reading directly.
*/

import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OfferingEntryPage from "@/pages/OfferingEntryPage";
import { offeringKeys } from "@/api/OfferingApi";
import type {
  DenominationLine,
  Offering,
  OfferingCategoryRow,
  UpdateOfferingCategoryRequest,
} from "@/types";

/*
  vitest's default per-test timeout is 5 seconds. Rendering this page under
  jsdom means four cards and thirty-two steppers, and the heaviest case here
  measures about 1.6s on an idle machine — comfortable, but not comfortable
  enough that a loaded one is guaranteed to stay under five. A suite that goes
  red because the machine was busy teaches people to re-run instead of to read,
  so the budget is stated and generous. It does not slow a passing run down.
*/
vi.setConfig({ testTimeout: 30_000 });

const OFFERING_ID = "offering-under-test";

// --- fixtures ------------------------------------------------------------

const cashCategory = (
  id: string,
  name: string,
  denominations: DenominationLine[],
): OfferingCategoryRow => ({
  id,
  name,
  isCash: true,
  amountKobo: denominations.reduce((total, line) => total + line.lineTotalKobo, 0),
  cashTotalKobo: denominations.reduce((total, line) => total + line.lineTotalKobo, 0),
  transferTotalKobo: 0,
  denominations,
  bucketRatePercent: null,
  bucketDeductionKobo: 0,
  netAmountKobo: denominations.reduce((total, line) => total + line.lineTotalKobo, 0),
});

const transferCategory = (
  id: string,
  name: string,
  transferTotalKobo: number,
): OfferingCategoryRow => ({
  id,
  name,
  isCash: false,
  amountKobo: transferTotalKobo,
  cashTotalKobo: 0,
  transferTotalKobo,
  denominations: [],
  bucketRatePercent: null,
  bucketDeductionKobo: 0,
  netAmountKobo: transferTotalKobo,
});

const TITHE = cashCategory("cat-tithe", "Tithe", [
  { denomination: 1000, quantity: 12, lineTotalKobo: 1_200_000 },
]);
const WELFARE = cashCategory("cat-welfare", "Welfare", [
  { denomination: 500, quantity: 4, lineTotalKobo: 200_000 },
]);
const SEED_FAITH = transferCategory("cat-seed", "Seed Faith", 2_500_000);
const BUILDING_FUND = transferCategory("cat-building", "Building Fund", 1_000_000);

const offeringWith = (categories: OfferingCategoryRow[]): Offering => {
  const cashTotalKobo = categories.reduce((total, row) => total + row.cashTotalKobo, 0);
  const transferTotalKobo = categories.reduce(
    (total, row) => total + row.transferTotalKobo,
    0,
  );

  return {
    id: OFFERING_ID,
    status: "DRAFT",
    notes: null,
    service: {
      id: "service-1",
      name: "Sunday Worship",
      kind: "SUNDAY_FIRST",
      heldOn: "2026-10-11T08:00:00.000Z",
    },
    categories,
    totals: {
      cashTotalKobo,
      transferTotalKobo,
      categoriesTotalKobo: cashTotalKobo + transferTotalKobo,
      bucketTotalKobo: 0,
      usableIncomeKobo: cashTotalKobo + transferTotalKobo,
    },
    revisions: [],
    originalTotalKobo: cashTotalKobo + transferTotalKobo,
    revisedTotalKobo: cashTotalKobo + transferTotalKobo,
    hasRevisions: false,
    recordedBy: { id: "user-1", fullName: "The Treasurer" },
    finalizedBy: null,
    finalizedAt: null,
    approvedBy: null,
    approvedAt: null,
    comments: [],
    createdAt: "2026-10-11T09:14:00.000Z",
    updatedAt: "2026-10-11T09:41:00.000Z",
  };
};

// --- the stand-in network ------------------------------------------------

type RecordedCall = { method: string; path: string; body: unknown };

let recorded: RecordedCall[] = [];
let servedOffering: Offering;

/*
  Applies the mutation to the served offering and answers with it, the way the
  real endpoint would. The totals it reports are recomputed from the categories,
  which is what the server does too — nothing here invents a figure the page
  then displays as if it were counted.
*/
const applyPatch = (categoryId: string, changes: UpdateOfferingCategoryRequest): Offering => {
  const categories = servedOffering.categories.map((category) => {
    if (category.id !== categoryId) return category;

    if (changes.denominations) {
      const denominations: DenominationLine[] = changes.denominations.map((line) => ({
        denomination: line.denomination,
        quantity: line.quantity,
        lineTotalKobo: line.denomination * 100 * line.quantity,
      }));
      return cashCategory(category.id, category.name, denominations);
    }

    const transferKobo = Math.round(Number(changes.transferAmount) * 100);
    return transferCategory(category.id, category.name, transferKobo);
  });

  return offeringWith(categories);
};

const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  const path = url.replace(/^https?:\/\/[^/]+/, "");
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;

  recorded.push({ method, path, body });

  const categoryMatch = /\/api\/offerings\/[^/]+\/categories\/([^/]+)$/.exec(path);

  if (categoryMatch && method === "PATCH") {
    servedOffering = applyPatch(categoryMatch[1], body as UpdateOfferingCategoryRequest);
  } else if (categoryMatch && method === "DELETE") {
    servedOffering = offeringWith(
      servedOffering.categories.filter((category) => category.id !== categoryMatch[1]),
    );
  } else if (/\/finalize$/.test(path)) {
    servedOffering = { ...servedOffering, status: "FINALIZED" };
  }

  return new Response(JSON.stringify({ data: servedOffering }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

// --- harness -------------------------------------------------------------

const renderPage = (offering: Offering) => {
  servedOffering = offering;

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(offeringKeys.detail(OFFERING_ID), offering);

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/offerings/${OFFERING_ID}`]}>
        <Routes>
          <Route path="/offerings/:offeringId" element={<OfferingEntryPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

/// The card for a category, found by its own heading rather than by position.
const cardFor = (name: string): HTMLElement => {
  const heading = screen.getByRole("heading", { name, level: 3 });
  const card = heading.closest("section");
  if (!card) throw new Error(`No card around the heading for ${name}`);
  return card as HTMLElement;
};

const saveButtonIn = (name: string): HTMLButtonElement =>
  within(cardFor(name)).getByRole("button", { name: "Save count" }) as HTMLButtonElement;

const noteInputIn = (name: string, note: string): HTMLInputElement =>
  within(cardFor(name)).getByLabelText(`How many ${note} naira notes`) as HTMLInputElement;

const amountInputIn = (name: string): HTMLInputElement =>
  within(cardFor(name)).getByLabelText(`Amount received for ${name}`) as HTMLInputElement;

const typeNoteCount = (name: string, note: string, quantity: string) =>
  fireEvent.change(noteInputIn(name, note), { target: { value: quantity } });

const typeAmount = (name: string, amount: string) =>
  fireEvent.change(amountInputIn(name), { target: { value: amount } });

/// The whole finalize panel's text, blocked or not.
const finalizePanelText = (): string => {
  const heading =
    screen.queryByRole("heading", { level: 2, name: /first/i }) ??
    screen.queryByRole("heading", { level: 2, name: /Finalize this offering/i });

  const panel = heading?.closest("section") ?? screen.getByRole("button", {
    name: "Finalize offering",
  }).closest("section");

  return (panel?.textContent ?? "").replace(/\s+/g, " ").trim();
};

const finalizeButton = () => screen.queryByRole("button", { name: "Finalize offering" });

/*
  THE INVARIANT. Every card the page names in the "tap Save count" sentence has
  an enabled Save count; every card it names in the amount sentence has a
  disabled one. Run in each blocked state rather than asserted once.
*/
const assertPageNeverInstructsARefusedAction = (allCategoryNames: string[]) => {
  const panel = finalizePanelText();

  const unsavedSentence = /((?:[^.]*?)(?:holds a count that has not been saved|hold counts that have not been saved))/.exec(
    panel,
  )?.[1];
  const amountSentence = /((?:[^.]*?)(?:holds an amount that cannot be saved|hold amounts that cannot be saved))/.exec(
    panel,
  )?.[1];

  /*
    A silent no-op is the failure mode this helper has to be protected from: if
    the wording changes and neither regex matches, every loop below runs zero
    times and the invariant quietly stops being checked while still reporting
    green. So the helper insists it found something to check.
  */
  expect(
    Boolean(unsavedSentence) || Boolean(amountSentence),
    `the finalize panel is blocked but neither sentence was recognised, so the invariant checked nothing. Panel read: ${panel}`,
  ).toBe(true);

  const namesChecked: string[] = [];

  for (const name of allCategoryNames) {
    if (unsavedSentence?.includes(name) || amountSentence?.includes(name)) {
      namesChecked.push(name);
    }
    if (unsavedSentence?.includes(name)) {
      expect(
        saveButtonIn(name).disabled,
        `the page tells her to tap Save count on "${name}", but that button is disabled`,
      ).toBe(false);
    }
    if (amountSentence?.includes(name)) {
      expect(
        saveButtonIn(name).disabled,
        `the page says "${name}" cannot be saved, yet its Save count is enabled`,
      ).toBe(true);
    }
  }

  // At least one named card, or the helper saw a block it could not attribute.
  expect(
    namesChecked.length,
    `the panel is blocked but names none of ${allCategoryNames.join(", ")}. Panel read: ${panel}`,
  ).toBeGreaterThan(0);

  // A card may never be named in both sentences at once: the instructions
  // contradict each other.
  if (unsavedSentence && amountSentence) {
    for (const name of allCategoryNames) {
      expect(
        unsavedSentence.includes(name) && amountSentence.includes(name),
        `"${name}" is named in both sentences`,
      ).toBe(false);
    }
  }
};

beforeEach(() => {
  recorded = [];
  vi.stubGlobal("fetch", fakeFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// -------------------------------------------------------------------------
// 1. An unsaved count blocks finalize
// -------------------------------------------------------------------------

describe("a counted but unsaved figure", () => {
  it("replaces Finalize with a block naming that category", async () => {
    renderPage(offeringWith([TITHE, WELFARE]));

    expect(finalizeButton()).not.toBeNull();

    typeNoteCount("Tithe", "1,000", "20");

    await waitFor(() => expect(finalizeButton()).toBeNull());

    expect(
      screen.getByRole("heading", { level: 2, name: "Save your counts first" }),
    ).not.toBeNull();

    const panel = finalizePanelText();
    expect(panel).toContain("Tithe");
    expect(panel).not.toContain("Welfare");
    expect(panel).toContain("holds a count that has not been saved");
    expect(panel).toContain("Finalizing now would freeze this offering without it");
    expect(panel).toContain("tap Save count");
    expect(panel).toContain("Finalize comes back once every card is saved.");

    assertPageNeverInstructsARefusedAction(["Tithe", "Welfare"]);
  });

  it("marks the card itself as holding money that is not saved", async () => {
    renderPage(offeringWith([TITHE]));

    expect(cardFor("Tithe").textContent).toContain("Counted:");

    typeNoteCount("Tithe", "1,000", "20");

    await waitFor(() => {
      const card = cardFor("Tithe").textContent ?? "";
      expect(card).toContain("Counted so far:");
      expect(card).toContain("not saved yet");
    });

    // 20 x ₦1,000, shown provisionally while she counts.
    expect(cardFor("Tithe").textContent).toContain("₦20,000");
  });

  it("counts a note tapped down to zero as unsaved money too", async () => {
    // The dangerous direction. Removing notes is still a change the server has
    // not seen, and finalizing would freeze the higher figure.
    renderPage(offeringWith([TITHE]));

    typeNoteCount("Tithe", "1,000", "0");

    await waitFor(() => expect(finalizeButton()).toBeNull());
    expect(finalizePanelText()).toContain("Tithe");
  });

  it("retracts the block when the field is put back to the saved value", async () => {
    renderPage(offeringWith([TITHE]));

    typeNoteCount("Tithe", "1,000", "20");
    await waitFor(() => expect(finalizeButton()).toBeNull());

    typeNoteCount("Tithe", "1,000", "12");

    await waitFor(() => expect(finalizeButton()).not.toBeNull());
    expect(cardFor("Tithe").textContent).toContain("Counted:");
    expect(cardFor("Tithe").textContent).not.toContain("not saved yet");
    // Nothing was sent, because nothing needed to be.
    expect(recorded).toEqual([]);
  });
});

// -------------------------------------------------------------------------
// 2. Saving retracts the block
// -------------------------------------------------------------------------

describe("saving the count", () => {
  it("retracts the block and brings Finalize back", async () => {
    renderPage(offeringWith([TITHE, WELFARE]));

    typeNoteCount("Tithe", "1,000", "20");
    await waitFor(() => expect(finalizeButton()).toBeNull());

    expect(saveButtonIn("Tithe").disabled).toBe(false);
    fireEvent.click(saveButtonIn("Tithe"));

    await waitFor(() => expect(finalizeButton()).not.toBeNull());

    expect(screen.queryByRole("heading", { level: 2, name: /first/i })).toBeNull();
    expect(cardFor("Tithe").textContent).not.toContain("not saved yet");
  });

  it("sends the counts the server's validator accepts, and nothing else", async () => {
    renderPage(offeringWith([TITHE]));

    typeNoteCount("Tithe", "1,000", "20");
    typeNoteCount("Tithe", "50", "3");
    await waitFor(() => expect(saveButtonIn("Tithe").disabled).toBe(false));

    fireEvent.click(saveButtonIn("Tithe"));
    await waitFor(() => expect(recorded.length).toBe(1));

    const [call] = recorded;
    expect(call.method).toBe("PATCH");
    expect(call.path).toMatch(/\/api\/offerings\/offering-under-test\/categories\/cat-tithe$/);

    // Whole kobo, no totals, and a note tapped to zero is omitted rather than
    // stored as a zero row.
    expect(call.body).toEqual({
      denominations: [
        { denomination: 1000, quantity: 20 },
        { denomination: 50, quantity: 3 },
      ],
    });
    expect(JSON.stringify(call.body)).not.toContain("Kobo");
    expect(JSON.stringify(call.body)).not.toContain("total");
  });

  it("shows the server's figure once it answers, not the device's", async () => {
    renderPage(offeringWith([TITHE]));

    typeNoteCount("Tithe", "1,000", "20");
    fireEvent.click(saveButtonIn("Tithe"));

    await waitFor(() => expect(cardFor("Tithe").textContent).toContain("Counted:"));
    // The header figure is the one the response carried.
    expect(cardFor("Tithe").textContent).toContain("₦20,000");
  });
});

// -------------------------------------------------------------------------
// 2b. A save that does not land
// -------------------------------------------------------------------------

/*
  The case that matters most after the happy path. If the save fails, the money
  is still only on the device — so the gate has to STAY shut. A gate that opens
  on the attempt rather than on the acknowledgement would freeze the offering
  without the count, which is the whole failure this feature exists to prevent.
*/
describe("a save that the server refuses", () => {
  const failingFetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    recorded.push({
      method: init?.method ?? "GET",
      path: url.replace(/^https?:\/\/[^/]+/, ""),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });

    return new Response(
      JSON.stringify({
        error: { code: "CONFLICT", message: "This offering was finalized while you were working." },
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  };

  it("leaves the block in place, because the count is still only on the device", async () => {
    renderPage(offeringWith([TITHE]));
    typeNoteCount("Tithe", "1,000", "20");
    await waitFor(() => expect(finalizeButton()).toBeNull());

    vi.stubGlobal("fetch", failingFetch);
    fireEvent.click(saveButtonIn("Tithe"));
    await waitFor(() => expect(recorded.length).toBe(1));

    // Give the mutation every chance to settle before asserting it changed
    // nothing it should not have.
    await waitFor(() => expect(saveButtonIn("Tithe").disabled).toBe(false));

    expect(finalizeButton()).toBeNull();
    expect(finalizePanelText()).toContain("Tithe");
    expect(finalizePanelText()).toContain("holds a count that has not been saved");
    assertPageNeverInstructsARefusedAction(["Tithe"]);
  });

  it("keeps her count on the card rather than discarding it", async () => {
    renderPage(offeringWith([TITHE]));
    typeNoteCount("Tithe", "1,000", "20");

    vi.stubGlobal("fetch", failingFetch);
    fireEvent.click(saveButtonIn("Tithe"));
    await waitFor(() => expect(recorded.length).toBe(1));
    await waitFor(() => expect(saveButtonIn("Tithe").disabled).toBe(false));

    // The figure she counted is still there, still marked unsaved, and Save
    // count is available to try again.
    expect(noteInputIn("Tithe", "1,000").value).toBe("20");
    expect(cardFor("Tithe").textContent).toContain("not saved yet");
    expect(cardFor("Tithe").textContent).toContain("₦20,000");
  });

  it("can be retried, and then lands", async () => {
    renderPage(offeringWith([TITHE]));
    typeNoteCount("Tithe", "1,000", "20");

    vi.stubGlobal("fetch", failingFetch);
    fireEvent.click(saveButtonIn("Tithe"));
    await waitFor(() => expect(recorded.length).toBe(1));
    await waitFor(() => expect(saveButtonIn("Tithe").disabled).toBe(false));

    vi.stubGlobal("fetch", fakeFetch);
    fireEvent.click(saveButtonIn("Tithe"));

    await waitFor(() => expect(finalizeButton()).not.toBeNull());
    expect(cardFor("Tithe").textContent).not.toContain("not saved yet");
  });
});

// -------------------------------------------------------------------------
// 3. An amount the card refuses to save
// -------------------------------------------------------------------------

describe("an unreadable transfer amount", () => {
  it("blocks finalize with the amount wording, not the Save count wording", async () => {
    renderPage(offeringWith([TITHE, SEED_FAITH]));

    typeAmount("Seed Faith", "abc");

    await waitFor(() => expect(finalizeButton()).toBeNull());

    expect(
      screen.getByRole("heading", { level: 2, name: "Check that amount first" }),
    ).not.toBeNull();

    const panel = finalizePanelText();
    expect(panel).toContain("Seed Faith");
    expect(panel).toContain("holds an amount that cannot be saved as it stands");
    expect(panel).toContain("enter the amount like 3500 or 3500.00");

    // The sentence that would send her to a greyed-out button is absent.
    expect(panel).not.toContain("holds a count that has not been saved");
  });

  it("leaves Save count disabled on that card, as the page implies", async () => {
    renderPage(offeringWith([TITHE, SEED_FAITH]));

    expect(saveButtonIn("Seed Faith").disabled).toBe(true);

    typeAmount("Seed Faith", "abc");

    await waitFor(() => expect(finalizeButton()).toBeNull());
    expect(saveButtonIn("Seed Faith").disabled).toBe(true);

    assertPageNeverInstructsARefusedAction(["Tithe", "Seed Faith"]);
  });

  it("is never named in a 'tap Save count' sentence, even beside a card that is", async () => {
    // The regression the second channel exists to prevent: one dirty card that
    // CAN be saved, one that cannot, in the same block.
    renderPage(offeringWith([TITHE, SEED_FAITH]));

    typeNoteCount("Tithe", "1,000", "20");
    typeAmount("Seed Faith", "abc");

    await waitFor(() => expect(finalizeButton()).toBeNull());

    const panel = finalizePanelText();
    const unsavedSentence = /([^.]*hold[^.]*count[^.]*has not been saved[^.]*)/.exec(panel)?.[1] ?? "";

    expect(unsavedSentence).toContain("Tithe");
    expect(unsavedSentence).not.toContain("Seed Faith");

    assertPageNeverInstructsARefusedAction(["Tithe", "Seed Faith"]);
  });

  it("recovers the moment a readable figure is typed", async () => {
    renderPage(offeringWith([SEED_FAITH]));

    typeAmount("Seed Faith", "abc");
    await waitFor(() => expect(finalizeButton()).toBeNull());

    typeAmount("Seed Faith", "3500.50");

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 2, name: "Save your counts first" }),
      ).not.toBeNull(),
    );
    expect(saveButtonIn("Seed Faith").disabled).toBe(false);
    assertPageNeverInstructsARefusedAction(["Seed Faith"]);
  });
});

// -------------------------------------------------------------------------
// 4. The cleared field, which has no inline hint
// -------------------------------------------------------------------------

describe("a transfer field cleared entirely", () => {
  it("shows no inline hint on the card — the gap the page has to cover", async () => {
    renderPage(offeringWith([SEED_FAITH]));

    typeAmount("Seed Faith", "");

    await waitFor(() => expect(finalizeButton()).toBeNull());

    // Gated on the field being non-empty, so there is nothing on the card.
    expect(cardFor("Seed Faith").textContent).not.toContain(
      "Enter an amount like 3500 or 3500.00",
    );
  });

  it("but the page still explains the format, so she is not left guessing", async () => {
    renderPage(offeringWith([SEED_FAITH]));

    typeAmount("Seed Faith", "");
    await waitFor(() => expect(finalizeButton()).toBeNull());

    const panel = finalizePanelText();
    expect(panel).toContain("Seed Faith");
    expect(panel).toContain("holds an amount that cannot be saved as it stands");
    expect(panel).toContain("enter the amount like 3500 or 3500.00");
  });

  it("keeps Save count disabled, and says nothing about tapping it", async () => {
    renderPage(offeringWith([SEED_FAITH]));

    typeAmount("Seed Faith", "");
    await waitFor(() => expect(finalizeButton()).toBeNull());

    expect(saveButtonIn("Seed Faith").disabled).toBe(true);
    expect(finalizePanelText()).not.toContain("holds a count that has not been saved");
    assertPageNeverInstructsARefusedAction(["Seed Faith"]);
  });

  it("treats whitespace alone the same as empty", async () => {
    renderPage(offeringWith([SEED_FAITH]));

    typeAmount("Seed Faith", "   ");
    await waitFor(() => expect(finalizeButton()).toBeNull());

    expect(saveButtonIn("Seed Faith").disabled).toBe(true);
    expect(finalizePanelText()).toContain("cannot be saved as it stands");
  });
});

// -------------------------------------------------------------------------
// 5. Both kinds at once, and the plural wording
// -------------------------------------------------------------------------

describe("both blockers at once", () => {
  it("names each card under the instruction that fits it, and heads the panel for both", async () => {
    renderPage(offeringWith([TITHE, WELFARE, SEED_FAITH, BUILDING_FUND]));

    typeNoteCount("Tithe", "1,000", "20");
    typeNoteCount("Welfare", "500", "9");
    typeAmount("Seed Faith", "abc");
    typeAmount("Building Fund", "");

    await waitFor(() => expect(finalizeButton()).toBeNull());

    expect(
      screen.getByRole("heading", { level: 2, name: "Finish these cards first" }),
    ).not.toBeNull();

    const panel = finalizePanelText();

    // Plural on both sentences.
    expect(panel).toContain("hold amounts that cannot be saved as they stand");
    expect(panel).toContain("hold counts that have not been saved");
    expect(panel).toContain("Finalizing now would freeze this offering without them");
    expect(panel).toContain("each card");
    expect(panel).not.toContain("that card");

    // Each name appears, under the right sentence.
    for (const name of ["Tithe", "Welfare", "Seed Faith", "Building Fund"]) {
      expect(panel).toContain(name);
    }

    assertPageNeverInstructsARefusedAction([
      "Tithe",
      "Welfare",
      "Seed Faith",
      "Building Fund",
    ]);
  });

  it("joins two names with 'and', not a comma", async () => {
    renderPage(offeringWith([TITHE, WELFARE]));

    typeNoteCount("Tithe", "1,000", "20");
    typeNoteCount("Welfare", "500", "9");

    await waitFor(() => expect(finalizeButton()).toBeNull());
    expect(finalizePanelText()).toContain("Tithe and Welfare");
  });

  it("heads the panel 'Check those amounts first' when only amounts are wrong", async () => {
    renderPage(offeringWith([SEED_FAITH, BUILDING_FUND]));

    typeAmount("Seed Faith", "abc");
    typeAmount("Building Fund", "oops");

    await waitFor(() => expect(finalizeButton()).toBeNull());

    expect(
      screen.getByRole("heading", { level: 2, name: "Check those amounts first" }),
    ).not.toBeNull();
    expect(finalizePanelText()).not.toContain("holds a count that has not been saved");
  });

  it("clears the block only when the last card is settled", async () => {
    renderPage(offeringWith([TITHE, SEED_FAITH]));

    typeNoteCount("Tithe", "1,000", "20");
    typeAmount("Seed Faith", "abc");
    await waitFor(() => expect(finalizeButton()).toBeNull());

    // Fix the amount: still blocked, now on the count alone.
    typeAmount("Seed Faith", "25000");
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 2, name: "Save your counts first" }),
      ).not.toBeNull(),
    );
    expect(finalizeButton()).toBeNull();

    // Save both, and only then does Finalize return.
    fireEvent.click(saveButtonIn("Seed Faith"));
    await waitFor(() => expect(saveButtonIn("Seed Faith").disabled).toBe(true));
    expect(finalizeButton()).toBeNull();

    fireEvent.click(saveButtonIn("Tithe"));
    await waitFor(() => expect(finalizeButton()).not.toBeNull());
  });
});

// -------------------------------------------------------------------------
// 6. Removing a card that was blocking
// -------------------------------------------------------------------------

describe("removing a card that was holding an unsaved count", () => {
  it("stops it blocking, because the page intersects with what the server sent", async () => {
    renderPage(offeringWith([TITHE, WELFARE]));

    typeNoteCount("Tithe", "1,000", "20");
    await waitFor(() => expect(finalizeButton()).toBeNull());

    fireEvent.click(within(cardFor("Tithe")).getByRole("button", { name: "Remove Tithe" }));
    fireEvent.click(within(cardFor("Tithe")).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(screen.queryByRole("heading", { name: "Tithe" })).toBeNull());
    await waitFor(() => expect(finalizeButton()).not.toBeNull());

    expect(screen.queryByRole("heading", { level: 2, name: /first/i })).toBeNull();
  });

  it("does the same for a card holding an unreadable amount", async () => {
    renderPage(offeringWith([TITHE, SEED_FAITH]));

    typeAmount("Seed Faith", "abc");
    await waitFor(() => expect(finalizeButton()).toBeNull());

    fireEvent.click(
      within(cardFor("Seed Faith")).getByRole("button", { name: "Remove Seed Faith" }),
    );
    fireEvent.click(within(cardFor("Seed Faith")).getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Seed Faith" })).toBeNull(),
    );
    await waitFor(() => expect(finalizeButton()).not.toBeNull());
  });

  it("asks before removing, rather than removing on the first tap", async () => {
    renderPage(offeringWith([TITHE]));

    fireEvent.click(within(cardFor("Tithe")).getByRole("button", { name: "Remove Tithe" }));

    expect(cardFor("Tithe").textContent).toContain("Remove this category?");
    expect(recorded).toEqual([]);

    fireEvent.click(within(cardFor("Tithe")).getByRole("button", { name: "Keep it" }));
    expect(cardFor("Tithe").textContent).not.toContain("Remove this category?");
    expect(recorded).toEqual([]);
  });
});

// -------------------------------------------------------------------------
// 7. Finalize itself, now that it can actually be reached
// -------------------------------------------------------------------------

describe("finalizing, once nothing is outstanding", () => {
  it("asks first, and says what finalizing does", async () => {
    renderPage(offeringWith([TITHE]));

    fireEvent.click(screen.getByRole("button", { name: "Finalize offering" }));

    expect(
      screen.getByRole("heading", { level: 2, name: "Finalize this offering?" }),
    ).not.toBeNull();
    expect(finalizePanelText()).toContain("The counts stop being editable");
    expect(finalizePanelText()).toContain("recorded as a correction beside them");
    // Nothing has been sent on the strength of opening a dialog.
    expect(recorded).toEqual([]);
  });

  it("can be backed out of without sending anything", async () => {
    renderPage(offeringWith([TITHE]));

    fireEvent.click(screen.getByRole("button", { name: "Finalize offering" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep counting" }));

    expect(finalizeButton()).not.toBeNull();
    expect(recorded).toEqual([]);
  });

  it("sends an empty POST to the finalize endpoint, carrying no figures", async () => {
    renderPage(offeringWith([TITHE]));

    fireEvent.click(screen.getByRole("button", { name: "Finalize offering" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, finalize" }));

    await waitFor(() => expect(recorded.length).toBe(1));

    const [call] = recorded;
    expect(call.method).toBe("POST");
    expect(call.path).toMatch(/\/api\/offerings\/offering-under-test\/finalize$/);
    // The backend owns every total. The client states no figure at all.
    expect(call.body).toBeUndefined();
  });

  it("locks the screen once the server answers", async () => {
    renderPage(offeringWith([TITHE]));

    fireEvent.click(screen.getByRole("button", { name: "Finalize offering" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, finalize" }));

    await waitFor(() => expect(screen.getByText(/These figures are locked/)).not.toBeNull());

    expect(screen.queryByRole("button", { name: "Save count" })).toBeNull();
    expect(finalizeButton()).toBeNull();
    expect(noteInputIn("Tithe", "1,000").disabled).toBe(true);
  });

  it("cannot be reached at all while a card is outstanding", async () => {
    // The whole point, stated as one assertion: there is no path from a dirty
    // card to the finalize request.
    renderPage(offeringWith([TITHE]));

    typeNoteCount("Tithe", "1,000", "20");
    await waitFor(() => expect(finalizeButton()).toBeNull());

    expect(screen.queryByRole("button", { name: "Yes, finalize" })).toBeNull();
    expect(recorded.filter((call) => /finalize/.test(call.path))).toEqual([]);
  });
});

// -------------------------------------------------------------------------
// 8. The gate does not fire when there is nothing wrong
// -------------------------------------------------------------------------

describe("the gate stays out of the way", () => {
  it("never warns on a freshly loaded offering", () => {
    renderPage(offeringWith([TITHE, WELFARE, SEED_FAITH]));

    expect(finalizeButton()).not.toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: /first/i })).toBeNull();
    expect(screen.queryByText(/cannot be saved as it stands/)).toBeNull();
  });

  it("does not block on a saved transfer amount that round-trips through the field", async () => {
    // "25000" is what koboToAmountInput produces for 2,500,000 kobo, so the
    // field starts equal to the server's value and must not read as dirty.
    renderPage(offeringWith([SEED_FAITH]));

    expect(amountInputIn("Seed Faith").value).toBe("25000");
    expect(saveButtonIn("Seed Faith").disabled).toBe(true);

    await waitFor(() => expect(finalizeButton()).not.toBeNull());
  });

  it("leaves an untouched card out of the block when a sibling is dirty", async () => {
    renderPage(offeringWith([TITHE, WELFARE]));

    typeNoteCount("Welfare", "500", "9");
    await waitFor(() => expect(finalizeButton()).toBeNull());

    const panel = finalizePanelText();
    expect(panel).toContain("Welfare");
    expect(panel).not.toContain("Tithe");
    expect(panel).toContain("that card");
  });
});
