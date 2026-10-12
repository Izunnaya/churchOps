import { prisma } from "../../lib/prisma";
import { Prisma } from "../../generated/prisma/client";
import { OfferingStatus } from "../../generated/prisma/enums";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { formatNaira, formatRatePercent, kobo, sum, type Kobo } from "../../lib/money";
import {
  bucketRatesByName,
  categoryCashTotal,
  computeOfferingTotals,
  type BucketRates,
  type CategoryInput,
} from "../../domain/offering";

export const offeringInclude = {
  service: true,
  categories: {
    orderBy: { sortOrder: "asc" },
    include: { denominations: { orderBy: { denomination: "desc" } } },
  },
  revisions: {
    orderBy: { recordedAt: "asc" },
    include: { recordedBy: { select: { id: true, fullName: true } } },
  },
  recordedBy: { select: { id: true, fullName: true } },
  finalizedBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
  comments: {
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, fullName: true } } },
  },
} as const;

export type OfferingWithRelations = NonNullable<
  Awaited<ReturnType<typeof findOfferingOrNull>>
>;

type OfferingCategoryRow = OfferingWithRelations["categories"][number];

/// Either the shared client or the one inside an open transaction. Reads that
/// have to see the same snapshot as the write beside them take `tx`.
type Db = typeof prisma | Prisma.TransactionClient;

/// Bucket rates and deductions are the Treasurer's and the Senior Pastor's to
/// see — Build Spec section 2 does not put the rate table on the Secretary's
/// screens. The aggregate set-aside (`bucketTotalKobo`, `usableIncomeKobo`)
/// stays visible to the Secretary: decided by Michael, so this flag covers the
/// per-category rate, deduction and net amount only.
export type OfferingView = { showBucketRates: boolean };

/// findFirst, not findUnique: an offering in another church has to read as
/// missing rather than forbidden, because a different refusal would confirm it
/// exists.
function findOfferingOrNull(churchId: string, id: string) {
  return prisma.offering.findFirst({ where: { id, churchId }, include: offeringInclude });
}

export async function findOffering(
  churchId: string,
  id: string,
): Promise<OfferingWithRelations> {
  const offering = await findOfferingOrNull(churchId, id);
  if (!offering) throw notFound("That offering");
  return offering;
}

/// Editable only while DRAFT. After finalization the record is corrected by
/// recording a revision, never by overwriting what was counted.
export function assertEditable(offering: { status: OfferingStatus }) {
  if (offering.status !== OfferingStatus.DRAFT) {
    throw conflict(
      "This offering has been finalized. Record a revision instead of editing it.",
      { status: offering.status },
    );
  }
}

/// Every rate the church has, active or not. `active` decides which categories
/// the entry screen offers as chips; it is not a rate expiry. A category
/// retired on Monday still applied to Sunday's uncounted offering, so filtering
/// on it here would snapshot a null rate at finalize and set aside ₦0 for the
/// life of that offering (Build Spec section 3: a `BucketRate` is keyed on
/// `effective_from` and never edited in place).
/// The same rule as `assertEditable`, re-checked inside the write that depends
/// on it. `assertEditable` reads a status fetched before the transaction opened,
/// so a finalize that commits in between leaves it stale: the draft edit lands
/// on a FINALIZED offering, past the rate snapshot and past the audit figure,
/// and no revision names who changed the total. Claiming the row conditionally
/// here both re-reads the status under the row lock and serializes against
/// finalize's identical claim, so one of the two waits and the loser is refused.
export async function assertStillDraft(
  tx: Prisma.TransactionClient,
  churchId: string,
  id: string,
) {
  const stillDraft = await tx.offering.updateMany({
    where: { id, churchId, status: OfferingStatus.DRAFT },
    data: { updatedAt: new Date() },
  });

  if (stillDraft.count === 0) {
    throw conflict(
      "This offering was finalized while you were working. Review the latest version before continuing.",
    );
  }
}

export async function loadBucketRates(churchId: string, db: Db = prisma) {
  const categories = await db.incomeCategory.findMany({
    where: { churchId },
    select: { name: true, bucketRatePercent: true },
  });
  return bucketRatesByName(categories);
}

/// The rates a finalized offering carries in its own categories. Nothing here
/// reads the live table, which is what keeps a finalized figure still.
function frozenRates(
  categories: Pick<OfferingCategoryRow, "name" | "bucketRateSnapshot">[],
): BucketRates {
  const frozen: BucketRates = new Map();
  for (const category of categories) {
    if (category.bucketRateSnapshot === null) continue;
    frozen.set(category.name.trim().toLowerCase(), category.bucketRateSnapshot.toString());
  }
  return frozen;
}

/// Which rates a given offering is entitled to. A draft is still being counted,
/// so it uses the live table. Anything past draft uses the rates frozen into its
/// own categories at finalize: rates are treasurer-editable and categories can be
/// renamed or retired, and none of that may move a figure that was already
/// finalized or approved.
async function ratesForOffering(offering: OfferingWithRelations): Promise<BucketRates> {
  if (offering.status === OfferingStatus.DRAFT) {
    return loadBucketRates(offering.churchId);
  }

  return frozenRates(offering.categories);
}

function toCategoryInputs(categories: OfferingCategoryRow[]): CategoryInput[] {
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    isCash: category.isCash,
    transferAmountKobo: category.transferAmountKobo,
    denominations: category.denominations.map((d) => ({
      denomination: d.denomination,
      quantity: d.quantity,
    })),
  }));
}

/// The single read shape every offering screen uses. Totals are computed here,
/// never read from a column.
export async function presentOffering(
  offering: OfferingWithRelations,
  view: OfferingView,
) {
  const rates = await ratesForOffering(offering);
  const totals = computeOfferingTotals(toCategoryInputs(offering.categories), rates);

  // A revision never rewrites the categories, so the revised total is the
  // counted total plus every recorded delta. Both stay visible.
  const revisionDelta = sum(offering.revisions.map((revision) => revision.deltaAmountKobo));
  const revisedTotalKobo = totals.categoriesTotalKobo + revisionDelta;

  return {
    id: offering.id,
    status: offering.status,
    notes: offering.notes,
    service: {
      id: offering.service.id,
      name: offering.service.name,
      kind: offering.service.kind,
      heldOn: offering.service.heldOn,
    },
    categories: offering.categories.map((category, index) => {
      // The three fields that state this category's rate, or let it be worked
      // back out: the rate itself, the deduction, and the amount net of it.
      const { bucketRatePercent, bucketDeductionKobo, netAmountKobo, ...row } =
        totals.categories[index];

      return {
        ...row,
        ...(view.showBucketRates
          ? {
              bucketRatePercent: formatRatePercent(bucketRatePercent),
              bucketDeductionKobo,
              netAmountKobo,
            }
          : {}),
        denominations: category.denominations.map((count) => ({
          denomination: count.denomination,
          quantity: count.quantity,
          lineTotalKobo: categoryCashTotal([count]),
        })),
      };
    }),
    totals: {
      cashTotalKobo: totals.cashTotalKobo,
      transferTotalKobo: totals.transferTotalKobo,
      categoriesTotalKobo: totals.categoriesTotalKobo,
      bucketTotalKobo: totals.bucketTotalKobo,
      usableIncomeKobo: totals.usableIncomeKobo,
    },
    revisions: offering.revisions.map((revision) => ({
      id: revision.id,
      reason: revision.reason,
      categoryName: revision.categoryName,
      deltaAmountKobo: revision.deltaAmountKobo,
      originalTotalKobo: revision.originalTotalKobo,
      revisedTotalKobo: revision.revisedTotalKobo,
      recordedAt: revision.recordedAt,
      recordedBy: revision.recordedBy,
    })),
    // Shown side by side wherever the record has been revised.
    originalTotalKobo: totals.categoriesTotalKobo,
    revisedTotalKobo: revisedTotalKobo,
    hasRevisions: offering.revisions.length > 0,
    recordedBy: offering.recordedBy,
    finalizedBy: offering.finalizedBy,
    finalizedAt: offering.finalizedAt,
    approvedBy: offering.approvedBy,
    approvedAt: offering.approvedAt,
    comments: offering.comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      author: comment.author,
      createdAt: comment.createdAt,
      readAt: comment.readAt,
    })),
    createdAt: offering.createdAt,
    updatedAt: offering.updatedAt,
  };
}

export async function finalizeOffering(churchId: string, id: string, userId: string) {
  const offering = await findOffering(churchId, id);
  assertEditable(offering);

  if (offering.categories.length === 0) {
    throw badRequest("Add at least one category before finalizing.");
  }

  const preview = computeOfferingTotals(
    toCategoryInputs(offering.categories),
    await loadBucketRates(churchId),
  );

  if (preview.categoriesTotalKobo <= 0) {
    throw badRequest("This offering has no amounts recorded yet.");
  }

  await prisma.$transaction(async (tx) => {
    // The status is both the guard and the claim: only a row still DRAFT in
    // this church moves. Two taps 200ms apart therefore produce one transition
    // and one audit event, because the second matches no row.
    const claimed = await tx.offering.updateMany({
      where: { id, churchId, status: OfferingStatus.DRAFT },
      data: {
        status: OfferingStatus.FINALIZED,
        finalizedById: userId,
        finalizedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      throw conflict(
        "This offering was finalized while you were working. Review the latest version before continuing.",
      );
    }

    // Everything frozen below is read after the claim, inside it. A category
    // added or a count changed from the phone between the read above and this
    // transaction is legal while DRAFT, and is part of what is being finalized:
    // reading it here is what stops it being snapshotted with no rate and
    // contributing nothing to the bucket for the rest of its life, and what
    // keeps the audit figures equal to the offering's own total.
    const categories = await tx.offeringCategory.findMany({
      where: { offeringId: id, churchId },
      orderBy: { sortOrder: "asc" },
      include: { denominations: true },
    });
    const rates = await loadBucketRates(churchId, tx);
    const totals = computeOfferingTotals(toCategoryInputs(categories), rates);

    if (totals.categoriesTotalKobo <= 0) {
      throw badRequest("This offering has no amounts recorded yet.");
    }

    // Freeze each category's rate in the same transaction as the status
    // change, so a finalized offering can never be short of a snapshot.
    for (const category of categories) {
      await tx.offeringCategory.update({
        where: { id: category.id },
        data: { bucketRateSnapshot: rates.get(category.name.trim().toLowerCase()) ?? null },
      });
    }

    await tx.auditEvent.create({
      data: {
        churchId,
        actorId: userId,
        action: "offering.finalized",
        entityType: "Offering",
        entityId: id,
        summary: `Finalized at ${formatNaira(totals.categoriesTotalKobo)}`,
        metadata: {
          cashTotalKobo: totals.cashTotalKobo,
          transferTotalKobo: totals.transferTotalKobo,
          categoriesTotalKobo: totals.categoriesTotalKobo,
        },
      },
    });
  });

  return findOffering(churchId, id);
}

export async function approveOffering(churchId: string, id: string, userId: string) {
  const offering = await findOffering(churchId, id);

  if (offering.status === OfferingStatus.DRAFT) {
    throw conflict("This offering has not been finalized yet.");
  }
  if (offering.status === OfferingStatus.APPROVED) {
    throw conflict("This offering has already been approved.");
  }

  await prisma.$transaction(async (tx) => {
    // Same conditional claim as finalize, over exactly the statuses the guards
    // above permit: a phone and a laptop both tapping approve leave one
    // transition, one approver and one audit event.
    const claimed = await tx.offering.updateMany({
      where: {
        id,
        churchId,
        status: { in: [OfferingStatus.FINALIZED, OfferingStatus.REVISED] },
      },
      data: { status: OfferingStatus.APPROVED, approvedById: userId, approvedAt: new Date() },
    });

    if (claimed.count === 0) {
      throw conflict(
        "This offering changed while you were working. Review the latest version before continuing.",
      );
    }

    await tx.auditEvent.create({
      data: {
        churchId,
        actorId: userId,
        action: "offering.approved",
        entityType: "Offering",
        entityId: id,
        summary: "Approved by the Senior Pastor",
      },
    });
  });

  return findOffering(churchId, id);
}

export type RevisionInput = {
  reason: string;
  categoryName?: string | null;
  deltaAmount: string;
  idempotencyKey: string;
};

/// A late transfer. Records the delta against a snapshot of the total at the
/// time, so the original and the revised figure can be shown distinctly.
///
/// `created` is false when the key resolved to the revision already written, so
/// the caller can answer 200 rather than claim a second one was recorded.
export async function recordRevision(
  churchId: string,
  id: string,
  userId: string,
  input: RevisionInput,
): Promise<{ created: boolean; offering: OfferingWithRelations }> {
  const offering = await findOffering(churchId, id);

  if (offering.status === OfferingStatus.DRAFT) {
    throw conflict("This offering is still a draft — edit it directly instead.");
  }

  const delta = kobo(input.deltaAmount);

  // A retry of a revision already recorded resolves to that revision rather
  // than adding a second one — but only if it is the same correction. A key
  // reused for different figures is refused, never silently acknowledged.
  //
  // This lookup comes before the amount check on purpose: a retry carrying a
  // key already recorded has to hear that the earlier correction was saved,
  // even when the amount came back cleared. A 400 about the amount reads as
  // "nothing was saved" and invites a second revision under a fresh key.
  const alreadyRecorded = await prisma.offeringRevision.findFirst({
    where: { churchId, offeringId: id, idempotencyKey: input.idempotencyKey },
  });
  if (alreadyRecorded) {
    assertSameCorrection(alreadyRecorded, input, delta);
    return { created: false, offering: await findOffering(churchId, id) };
  }

  // Only a genuinely new key reaches the amount check.
  if (delta === 0) throw badRequest("A revision needs a non-zero amount.");

  try {
    await prisma.$transaction(async (tx) => {
      // Takes the row lock, for every status, before anything is read. It has
      // to be unconditional: Postgres applies `status = 'FINALIZED'` as a scan
      // qualification and never passes a failing tuple to the update node, so
      // on an offering already REVISED or APPROVED — every revision after the
      // first — the claim below matches nothing and locks nothing. Two
      // corrections submitted at once would then read the same prior revisions
      // and store two before-and-after pairs that neither chain nor agree with
      // the offering's own total, and their idempotency keys differ, so nothing
      // else catches it. Holding the lock here makes the loser wait and read
      // the winner's committed revision. It must write a real column: an empty
      // `data` is not guaranteed to emit an UPDATE.
      await tx.offering.updateMany({
        where: { id, churchId },
        data: { updatedAt: new Date() },
      });

      // Conditional and non-destructive. Michael decided on 2026-10-12 that a
      // revision returns an approved offering to REVISED and the Pastor
      // approves again, so no record reads APPROVED with his name against a
      // figure he never saw. `approvedById` and `approvedAt` are deliberately
      // left alone: they stand as the record of the earlier approval until he
      // approves the revised figure. DEC-04 remains formally open in the
      // brief's register — the other branch, where the approval survives and
      // the adjustment is marked unapproved on the next report, would need a
      // marker that does not exist yet. A zero count is the ordinary answer for
      // an offering in some other state, so it is not an error.
      await tx.offering.updateMany({
        where: {
          id,
          churchId,
          status: { in: [OfferingStatus.FINALIZED, OfferingStatus.APPROVED] },
        },
        data: { status: OfferingStatus.REVISED },
      });

      // The before-and-after this revision stores is read inside the
      // transaction. Two revisions with *different* keys submitted at once
      // would otherwise both read zero prior deltas and both store a pair that
      // never existed; the idempotency key cannot catch that, because the keys
      // differ.
      const categories = await tx.offeringCategory.findMany({
        where: { offeringId: id, churchId },
        orderBy: { sortOrder: "asc" },
        include: { denominations: true },
      });
      const priorRevisions = await tx.offeringRevision.findMany({
        where: { offeringId: id, churchId },
        select: { deltaAmountKobo: true },
      });

      // Past DRAFT the rates are the offering's own frozen snapshots, never
      // the live table.
      const counted = computeOfferingTotals(
        toCategoryInputs(categories),
        frozenRates(categories),
      );
      const priorDelta = sum(priorRevisions.map((revision) => revision.deltaAmountKobo));
      const originalTotalKobo = counted.categoriesTotalKobo + priorDelta;
      const revisedTotalKobo = originalTotalKobo + delta;

      await tx.offeringRevision.create({
        data: {
          churchId,
          offeringId: id,
          idempotencyKey: input.idempotencyKey,
          reason: input.reason,
          categoryName: input.categoryName ?? null,
          deltaAmountKobo: delta,
          originalTotalKobo,
          revisedTotalKobo,
          recordedById: userId,
        },
      });

      await tx.auditEvent.create({
        data: {
          churchId,
          actorId: userId,
          action: "offering.revised",
          entityType: "Offering",
          entityId: id,
          summary: input.reason,
          metadata: {
            deltaAmountKobo: delta,
            originalTotalKobo,
            revisedTotalKobo,
          },
        },
      });
    });
  } catch (error) {
    // Two requests raced and the unique constraint caught the loser. Whether
    // that loser is a harmless retry or a different correction under the same
    // key is the same question as above, answered the same way.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await prisma.offeringRevision.findFirst({
        where: { churchId, offeringId: id, idempotencyKey: input.idempotencyKey },
      });
      if (winner) {
        assertSameCorrection(winner, input, delta);
        return { created: false, offering: await findOffering(churchId, id) };
      }
    }
    throw error;
  }

  return { created: true, offering: await findOffering(churchId, id) };
}

/// The request has to agree with the revision already stored under its key
/// before the retry counts as the same correction. If the treasurer changed the
/// figure, the reason or the category before retrying, the earlier save is
/// still what the record holds and she has to see that before saving again.
function assertSameCorrection(
  storedRevision: { deltaAmountKobo: Kobo; reason: string; categoryName: string | null },
  input: RevisionInput,
  requestedDeltaKobo: Kobo,
) {
  const sameCorrection =
    storedRevision.deltaAmountKobo === requestedDeltaKobo &&
    storedRevision.reason === input.reason &&
    storedRevision.categoryName === (input.categoryName ?? null);

  if (!sameCorrection) {
    throw conflict(
      "Your earlier correction to this offering was saved, and this different one was not. Review the record before trying again.",
    );
  }
}
