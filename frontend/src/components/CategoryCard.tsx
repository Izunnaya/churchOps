import { useEffect, useState } from "react";
import { ArrowRightLeft, Banknote, CircleAlert, Trash2 } from "lucide-react";
import DenominationStepper from "@/components/DenominationStepper";
import Money from "@/components/Money";
import { DENOMINATIONS, type Denomination } from "@/config/denominations-config";
import { NAIRA_AMOUNT, denominationLineKobo, koboToAmountInput } from "@/lib/money";
import type { DenominationLine, OfferingCategoryRow, UpdateOfferingCategoryRequest } from "@/types";

/*
  One category on the offering: its name, how it arrived, and what it is worth.

  The card holds the count being typed and the server holds the truth. Nothing
  is saved as it is tapped — autosave on the offering path is still an open
  question, so this shows an explicit unsaved marker and an explicit Save rather
  than inventing a behaviour nobody has decided. The subtotal under a count is
  labelled provisional until the server answers with its own figure.
*/

const quantitiesFromLines = (lines: DenominationLine[]): Record<Denomination, number> => {
  const quantities = {} as Record<Denomination, number>;
  for (const denomination of DENOMINATIONS) quantities[denomination] = 0;

  for (const line of lines) {
    if ((DENOMINATIONS as readonly number[]).includes(line.denomination)) {
      quantities[line.denomination as Denomination] = line.quantity;
    }
  }

  return quantities;
};

type Props = {
  category: OfferingCategoryRow;
  /// False once the offering leaves DRAFT, and while another save is in flight.
  editable: boolean;
  isSaving: boolean;
  onSaveCategory: (categoryId: string, changes: UpdateOfferingCategoryRequest) => void;
  onRemoveCategory: (categoryId: string) => void;
  /*
    Tells the page this card is holding a count the server has not acknowledged.
    The card still owns the count itself; only the fact of it travels up, so the
    page can refuse to finalize money that was never sent. Must be a stable
    reference — the card reports on every change through an effect.
  */
  onUnsavedChange: (categoryId: string, hasUnsavedCounts: boolean) => void;
  /*
    And whether that unsaved value is one this card will refuse to save, which
    is a different thing and needs a different instruction on the page. Dirty
    says Finalize must wait; this says Save count is greyed out, so telling her
    to tap it would be telling her to do something impossible. Same stability
    rule as above.
  */
  onUnsavableAmountChange: (categoryId: string, hasUnsavableAmount: boolean) => void;
};

const CategoryCard = ({
  category,
  editable,
  isSaving,
  onSaveCategory,
  onRemoveCategory,
  onUnsavedChange,
  onUnsavableAmountChange,
}: Props) => {
  /*
    A note value the current list does not contain can only come from a count
    saved before the list changed. Replacing the counts wholesale would drop it,
    so the card refuses to edit instead of quietly losing somebody's money.
  */
  const unknownNotes = category.denominations.filter(
    (line) => !(DENOMINATIONS as readonly number[]).includes(line.denomination),
  );

  const serverQuantities = quantitiesFromLines(category.denominations);
  const serverTransferAmount = koboToAmountInput(category.transferTotalKobo);

  // What the server last acknowledged. When it changes, the draft is stale and
  // is replaced — the documented way to reset state from props without an effect.
  const serverFingerprint = `${category.denominations
    .map((line) => `${line.denomination}:${line.quantity}`)
    .join(",")}|${serverTransferAmount}`;

  const [syncedFingerprint, setSyncedFingerprint] = useState(serverFingerprint);
  const [draftQuantities, setDraftQuantities] = useState(serverQuantities);
  const [draftTransferAmount, setDraftTransferAmount] = useState(serverTransferAmount);
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);

  if (syncedFingerprint !== serverFingerprint) {
    setSyncedFingerprint(serverFingerprint);
    setDraftQuantities(serverQuantities);
    setDraftTransferAmount(serverTransferAmount);
  }

  const provisionalTotalKobo = category.isCash
    ? DENOMINATIONS.reduce(
        (runningTotal, denomination) =>
          runningTotal + denominationLineKobo(denomination, draftQuantities[denomination]),
        0,
      )
    : category.amountKobo;

  const isTransferAmountValid = NAIRA_AMOUNT.test(draftTransferAmount.trim());

  const hasUnsavedChanges = category.isCash
    ? DENOMINATIONS.some(
        (denomination) => draftQuantities[denomination] !== serverQuantities[denomination],
      )
    : draftTransferAmount.trim() !== serverTransferAmount;

  /*
    Typed something, but not a figure this card can send. "abc" and an emptied
    field are both unsaved AND unsavable, which are two different answers: the
    first says Finalize has to wait, the second says Save count is greyed out.
    The page needs both, because one message built on the first alone sends her
    to tap a button this card refuses to enable.

    Cash cannot land here. Its only refusal is a retired note value, and that
    disables the steppers, so those drafts can never diverge from the server's
    and the card never reports dirty in the first place.
  */
  const hasUnsavableAmount =
    !category.isCash && hasUnsavedChanges && !isTransferAmountValid;

  /*
    Reported upward rather than kept here, because the consequence of an
    unsaved count is on the page: Finalize freezes the offering from the saved
    rows only, so a count sitting in this card would be frozen out of it and
    then vanish with the footer when the page re-renders read-only. The cleanup
    retracts the report when the category is removed or the card unmounts.
  */
  useEffect(() => {
    onUnsavedChange(category.id, hasUnsavedChanges);
    return () => onUnsavedChange(category.id, false);
  }, [category.id, hasUnsavedChanges, onUnsavedChange]);

  /// Reported separately so the page can name the blocker she actually has.
  useEffect(() => {
    onUnsavableAmountChange(category.id, hasUnsavableAmount);
    return () => onUnsavableAmountChange(category.id, false);
  }, [category.id, hasUnsavableAmount, onUnsavableAmountChange]);

  /*
    Written against the same predicate the page is told about, so the button
    and the page's instruction cannot disagree about the value being held.
    `editable` is the one other thing that closes the button, and it closes
    every card at once while a save is in flight — a wait, not a refusal.
  */
  const canSave =
    editable && hasUnsavedChanges && unknownNotes.length === 0 && !hasUnsavableAmount;

  const handleSave = () => {
    if (!canSave) return;

    onSaveCategory(
      category.id,
      category.isCash
        ? {
            // Replaced wholesale, so a note counted down to zero is a row that
            // goes away rather than a zero stored against the category.
            denominations: DENOMINATIONS.filter(
              (denomination) => draftQuantities[denomination] > 0,
            ).map((denomination) => ({
              denomination,
              quantity: draftQuantities[denomination],
            })),
          }
        : { transferAmount: draftTransferAmount.trim() },
    );
  };

  return (
    <section className="rounded-card border border-line bg-surface">
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-line-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-row-title text-ink">{category.name}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-hint text-ink-4">
            {category.isCash ? (
              <Banknote aria-hidden="true" className="size-3.5 shrink-0" />
            ) : (
              <ArrowRightLeft aria-hidden="true" className="size-3.5 shrink-0" />
            )}
            {category.isCash ? "Counted in cash" : "Transfer, no cash counted"}
          </p>
        </div>

        <Money amountKobo={category.amountKobo} className="text-kv text-ink" />
      </header>

      {/*
        The bucket line. Absent entirely for a Secretary, whose response omits
        these three fields. Presented calmly, as the design requires: this is a
        routine set-aside, not a warning.
      */}
      {category.bucketRatePercent != null && category.bucketDeductionKobo != null && (
        <p className="border-b border-line-2 bg-sunken px-4 py-2 text-secondary text-ink-3">
          {category.bucketRatePercent}% set aside:{" "}
          <Money amountKobo={category.bucketDeductionKobo} className="text-ink-2" />
          {category.netAmountKobo != null && (
            <>
              {" · leaves "}
              <Money amountKobo={category.netAmountKobo} className="text-ink-2" />
            </>
          )}
        </p>
      )}

      <div className="px-4 py-3">
        {unknownNotes.length > 0 && (
          <p className="mb-3 flex items-start gap-2 rounded-card bg-sunken px-3 py-2 text-secondary text-ink-2">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            This count includes a note value the current list does not carry, so
            it cannot be edited here without losing it. The figures above are
            unaffected.
          </p>
        )}

        {category.isCash ? (
          <DenominationStepper
            quantityByDenomination={draftQuantities}
            onQuantityChange={(denomination, quantity) =>
              setDraftQuantities((current) => ({ ...current, [denomination]: quantity }))
            }
            disabled={!editable || unknownNotes.length > 0}
          />
        ) : (
          <label className="block">
            <span className="text-section-label uppercase text-ink-4">Amount received</span>
            <input
              type="text"
              inputMode="decimal"
              disabled={!editable}
              value={draftTransferAmount}
              onChange={(changeEvent) => setDraftTransferAmount(changeEvent.target.value)}
              aria-label={`Amount received for ${category.name}`}
              className="mt-1 h-field w-full rounded-card border-control border-line-3 bg-surface px-3 money text-large-input text-ink disabled:bg-sunken disabled:text-ink-3"
            />
            {!isTransferAmountValid && draftTransferAmount.trim() !== "" && (
              <span className="mt-1 block text-hint text-accent-red">
                Enter an amount like 3500 or 3500.00
              </span>
            )}
          </label>
        )}
      </div>

      {editable && (
        <footer className="flex flex-wrap items-center gap-3 border-t border-line-2 px-4 py-3">
          {/*
            Nothing counted is shown while a note value sits outside the current
            list: this subtotal folds over that list only, so it would read
            lower than the header's figure with no marker to say why — a
            settled-looking number that is short by the retired notes. The
            header keeps showing the server's figure, which is the whole count.
          */}
          {category.isCash && unknownNotes.length === 0 && (
            <p className="text-secondary text-ink-3">
              {hasUnsavedChanges ? "Counted so far: " : "Counted: "}
              <Money amountKobo={provisionalTotalKobo} className="text-ink" />
              {hasUnsavedChanges && (
                <span className="ml-2 text-hint text-ink-4">not saved yet</span>
              )}
            </p>
          )}

          <div className="ml-auto flex items-center gap-2">
            {isConfirmingRemove ? (
              <>
                <span className="text-secondary text-ink-2">Remove this category?</span>
                <button
                  type="button"
                  onClick={() => setIsConfirmingRemove(false)}
                  className="h-touch rounded-card border-control border-line-3 bg-surface px-3 text-button text-ink-2"
                >
                  Keep it
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => onRemoveCategory(category.id)}
                  className="h-touch rounded-card border-control border-accent-red bg-surface px-3 text-button text-accent-red"
                >
                  Remove
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setIsConfirmingRemove(true)}
                aria-label={`Remove ${category.name}`}
                className="flex size-touch items-center justify-center rounded-card border-control border-line-3 bg-surface text-ink-3"
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </button>
            )}

            <button
              type="button"
              disabled={!canSave || isSaving}
              onClick={handleSave}
              className="h-control rounded-card bg-accent-blue px-5 text-button text-surface disabled:bg-line-4 disabled:text-ink-4"
            >
              {isSaving ? "Saving…" : "Save count"}
            </button>
          </div>
        </footer>
      )}
    </section>
  );
};

export default CategoryCard;
