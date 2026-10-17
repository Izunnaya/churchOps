import { useCallback, useState } from "react";
import { useParams } from "react-router-dom";
import { CircleAlert, Lock } from "lucide-react";
import CategoryCard from "@/components/CategoryCard";
import Money from "@/components/Money";
import OfferingTotalsPanel from "@/components/OfferingTotalsPanel";
import StatusBadge from "@/components/StatusBadge";
import AddCategoryForm from "@/forms/offering-category-form/AddCategoryForm";
import { SERVICE_KIND_LABELS } from "@/config/service-kinds-config";
import {
  useAddOfferingCategory,
  useDeleteOfferingCategory,
  useFinalizeOffering,
  useGetOffering,
  useUpdateOfferingCategory,
} from "@/api/OfferingApi";
import { getDisplayMessage } from "@/lib/api-client";

/*
  Offering Entry (TRE-002), the category-first flow: the treasurer adds a
  category, counts it note by note inside that category, and never types a
  total at any level. Every figure on this page is the server's.

  The page composes hooks and passes data and callbacks down. It performs no
  fetch of its own, and the form below owns its own validation.

  Only a DRAFT is editable. A finalized or approved offering renders read-only,
  with the original and revised totals side by side where a correction has been
  recorded — finalized figures are revised, never overwritten. Recording the
  correction itself is its own screen and is not built here.
*/

/// A date in full words. Used for the service date and for when a correction
/// was recorded, which are different dates and only share a format.
const formatLongDate = (isoDate: string): string =>
  new Date(isoDate).toLocaleDateString("en-NG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/// "Tithe", "Tithe and Seed Faith", "Tithe, Seed Faith and Welfare".
const joinNames = (names: string[]): string =>
  new Intl.ListFormat("en-NG", { style: "long", type: "conjunction" }).format(names);

/*
  One id in or out of a set-shaped record, returning the record untouched when
  the answer has not changed — a new object every time would re-render the
  cards, which would report again, which would build another new object.
*/
const withCategoryFlagged = (
  current: Record<string, true>,
  categoryId: string,
  isFlagged: boolean,
): Record<string, true> => {
  if (Boolean(current[categoryId]) === isFlagged) return current;

  const next = { ...current };
  if (isFlagged) next[categoryId] = true;
  else delete next[categoryId];
  return next;
};

/*
  The heading says which of the two problems she has, because the fix for one
  is not the fix for the other. A single heading covering both would read as a
  general warning she has to open every card to understand.
*/
const finalizeBlockHeading = (
  cardsWithUnsavableAmount: number,
  cardsWithUnsavedCounts: number,
): string => {
  if (cardsWithUnsavableAmount === 0) return "Save your counts first";
  if (cardsWithUnsavedCounts > 0) return "Finish these cards first";
  return cardsWithUnsavableAmount === 1 ? "Check that amount first" : "Check those amounts first";
};

const OfferingEntryPage = () => {
  const { offeringId } = useParams<{ offeringId: string }>();
  const [isConfirmingFinalize, setIsConfirmingFinalize] = useState(false);

  /*
    Which cards are holding a count the server has not acknowledged. Each card
    reports its own; the page keeps only the fact, never the figures, because
    the counts belong to the card that is being typed into and a page-owned
    draft would have to re-seed them from every save response — the way an
    older response overwrites newer input.
  */
  const [categoryIdsWithUnsavedCounts, setCategoryIdsWithUnsavedCounts] = useState<
    Record<string, true>
  >({});

  /*
    And which of those are holding a figure the card will not save — "abc", or
    a field she cleared. A subset of the set above, kept apart because the two
    need opposite instructions: one card is waiting to be saved, the other
    cannot be saved until the amount is readable.
  */
  const [categoryIdsWithUnsavableAmount, setCategoryIdsWithUnsavableAmount] = useState<
    Record<string, true>
  >({});

  const handleUnsavedChange = useCallback(
    (categoryId: string, hasUnsavedCounts: boolean) => {
      setCategoryIdsWithUnsavedCounts((current) =>
        withCategoryFlagged(current, categoryId, hasUnsavedCounts),
      );
    },
    [],
  );

  const handleUnsavableAmountChange = useCallback(
    (categoryId: string, hasUnsavableAmount: boolean) => {
      setCategoryIdsWithUnsavableAmount((current) =>
        withCategoryFlagged(current, categoryId, hasUnsavableAmount),
      );
    },
    [],
  );

  const { offering, isLoading, isError, error } = useGetOffering(offeringId);

  const { addCategory, isPending: isAddingCategory } = useAddOfferingCategory(
    offeringId ?? "",
  );
  const { updateCategory, isPending: isUpdatingCategory } = useUpdateOfferingCategory(
    offeringId ?? "",
  );
  const { deleteCategory, isPending: isDeletingCategory } = useDeleteOfferingCategory(
    offeringId ?? "",
  );
  const { finalizeOffering, isPending: isFinalizing } = useFinalizeOffering(
    offeringId ?? "",
  );

  if (isLoading) {
    return (
      <p aria-busy="true" className="py-8 text-center text-body text-ink-3">
        Loading this offering…
      </p>
    );
  }

  if (isError || !offering) {
    return (
      <div className="rounded-card border border-line bg-surface p-4">
        <h1 className="text-detail-header text-ink">This offering could not be opened</h1>
        <p className="mt-2 text-body text-ink-3">
          {getDisplayMessage(error, "It may have been removed, or you may not have access to it.")}
        </p>
      </div>
    );
  }

  const isEditable = offering.status === "DRAFT";
  const isCategoryBusy = isUpdatingCategory || isDeletingCategory;

  /*
    Intersected with the categories the server last sent, so a card that has
    since been removed cannot hold the offering open with a count that no
    longer exists anywhere.

    Split in two, and a card named in the second list is never named in the
    first: the "tap Save count" sentence may only name cards whose Save count
    is actually available. A card holding an unreadable amount has that button
    greyed out, so it gets the sentence about the amount instead.
  */
  const categoriesHoldingUnsavableAmount = offering.categories.filter(
    (category) => categoryIdsWithUnsavableAmount[category.id],
  );
  const categoriesHoldingUnsavedCounts = offering.categories.filter(
    (category) =>
      categoryIdsWithUnsavedCounts[category.id] &&
      !categoryIdsWithUnsavableAmount[category.id],
  );
  const isFinalizeBlocked =
    categoriesHoldingUnsavedCounts.length > 0 ||
    categoriesHoldingUnsavableAmount.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-page-title text-ink">{offering.service.name}</h1>
          <StatusBadge status={offering.status} />
        </div>
        <p className="mt-1 text-secondary text-ink-3">
          {SERVICE_KIND_LABELS[offering.service.kind]} ·{" "}
          {formatLongDate(offering.service.heldOn)}
        </p>
      </header>

      {!isEditable && (
        <p className="flex items-start gap-2 rounded-card border border-line bg-sunken px-4 py-3 text-secondary text-ink-2">
          <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          These figures are locked. A later correction is recorded beside them as
          a revision, and never replaces what was counted.
        </p>
      )}

      <section aria-labelledby="categories-heading" className="flex flex-col gap-3">
        <h2 id="categories-heading" className="text-section-label uppercase text-ink-4">
          Categories
        </h2>

        {offering.categories.length === 0 ? (
          <p className="rounded-card border border-dashed border-line-3 bg-surface px-4 py-6 text-center text-body text-ink-3">
            Nothing counted yet. Add the first category — whatever was collected,
            one envelope type at a time.
          </p>
        ) : (
          offering.categories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              /*
                Also closed while the offering is being frozen: a count started
                then could not reach the request already in flight.
              */
              editable={isEditable && !isCategoryBusy && !isFinalizing}
              isSaving={isCategoryBusy}
              onSaveCategory={(categoryId, changes) =>
                updateCategory({ categoryId, changes })
              }
              onRemoveCategory={(categoryId) => deleteCategory(categoryId)}
              onUnsavedChange={handleUnsavedChange}
              onUnsavableAmountChange={handleUnsavableAmountChange}
            />
          ))
        )}
      </section>

      {isEditable && (
        /*
          Remounted whenever a category lands, which clears the fields only once
          the server has acknowledged the add. A form that cleared itself on
          submit would throw away what she typed if the save failed.
        */
        <AddCategoryForm
          key={offering.categories.length}
          onSave={(category) => addCategory(category)}
          isSaving={isAddingCategory}
        />
      )}

      <OfferingTotalsPanel
        totals={offering.totals}
        hasRevisions={offering.hasRevisions}
        originalTotalKobo={offering.originalTotalKobo}
        revisedTotalKobo={offering.revisedTotalKobo}
      />

      {offering.hasRevisions && (
        <section
          aria-labelledby="revisions-heading"
          className="rounded-card border border-line bg-surface"
        >
          <h2
            id="revisions-heading"
            className="border-b border-line-2 px-4 py-3 text-section-label uppercase text-ink-4"
          >
            Corrections
          </h2>
          <ul className="divide-y divide-line-2">
            {offering.revisions.map((revision) => (
              <li key={revision.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-row-title text-ink">
                    {revision.categoryName ?? "The offering"}
                  </span>
                  <Money amountKobo={revision.deltaAmountKobo} className="text-row-title text-ink" />
                </div>
                <p className="mt-1 text-secondary text-ink-2">{revision.reason}</p>
                <p className="mt-1 text-hint text-ink-4">
                  {revision.recordedBy?.fullName ?? "A removed account"} ·{" "}
                  {formatLongDate(revision.recordedAt)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isEditable && offering.categories.length > 0 && (
        <section className="rounded-card border border-line bg-surface p-4">
          {/*
            Finalizing freezes the figures the server has, and a count still
            sitting on a card was never sent to it. So the confirmation does not
            open while one is outstanding, and she is told which card to go back
            to rather than simply refused. Saving for her is not an option here:
            autosave on this path is not a decided behaviour, and a page that
            silently saved what she was mid-way through typing would be deciding
            her figures for her.

            Two sentences, not one, because a card can be outstanding for two
            different reasons and only one of them is fixed by tapping Save
            count. The other has that button greyed out until the amount reads
            as a figure, so this carries the format with it: the card's inline
            hint is hidden while the field is empty, and she should not have to
            open the card to learn what the page is waiting for.
          */}
          {isFinalizeBlocked ? (
            <>
              <h2 className="flex items-start gap-2 text-detail-header text-ink">
                <CircleAlert aria-hidden="true" className="mt-1 size-4 shrink-0" />
                {finalizeBlockHeading(
                  categoriesHoldingUnsavableAmount.length,
                  categoriesHoldingUnsavedCounts.length,
                )}
              </h2>

              {categoriesHoldingUnsavableAmount.length > 0 && (
                <p className="mt-2 text-body text-ink-2">
                  {joinNames(
                    categoriesHoldingUnsavableAmount.map((category) => category.name),
                  )}{" "}
                  {categoriesHoldingUnsavableAmount.length === 1
                    ? "holds an amount that cannot be saved as it stands"
                    : "hold amounts that cannot be saved as they stand"}
                  . Go back to{" "}
                  {categoriesHoldingUnsavableAmount.length === 1
                    ? "that card"
                    : "each card"}
                  , enter the amount like 3500 or 3500.00, then tap Save count.
                </p>
              )}

              {categoriesHoldingUnsavedCounts.length > 0 && (
                <p className="mt-2 text-body text-ink-2">
                  {joinNames(categoriesHoldingUnsavedCounts.map((category) => category.name))}{" "}
                  {categoriesHoldingUnsavedCounts.length === 1
                    ? "holds a count that has not been saved. Finalizing now would freeze this offering without it"
                    : "hold counts that have not been saved. Finalizing now would freeze this offering without them"}
                  . Go back to{" "}
                  {categoriesHoldingUnsavedCounts.length === 1 ? "that card" : "each card"}{" "}
                  and tap Save count.
                </p>
              )}

              <p className="mt-2 text-body text-ink-3">
                Finalize comes back once every card is saved.
              </p>
            </>
          ) : isConfirmingFinalize ? (
            <>
              <h2 className="text-detail-header text-ink">Finalize this offering?</h2>
              <p className="mt-2 text-body text-ink-2">
                The counts stop being editable and the rates behind the set-aside
                are frozen as they are today, so this week&rsquo;s figures cannot
                move later. Anything that arrives afterwards is recorded as a
                correction beside them.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isFinalizing}
                  onClick={() => finalizeOffering()}
                  className="h-control rounded-card bg-accent-blue px-5 text-button text-surface disabled:bg-line-4 disabled:text-ink-4"
                >
                  {isFinalizing ? "Finalizing…" : "Yes, finalize"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingFinalize(false)}
                  className="h-control rounded-card border-control border-line-3 bg-surface px-5 text-button text-ink-2"
                >
                  Keep counting
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIsConfirmingFinalize(true)}
              className="h-control w-full rounded-card bg-accent-blue px-5 text-button text-surface"
            >
              Finalize offering
            </button>
          )}
        </section>
      )}
    </div>
  );
};

export default OfferingEntryPage;
