import { prisma } from "../../lib/prisma";
import { Prisma } from "../../generated/prisma/client";
import { OfferingStatus } from "../../generated/prisma/enums";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { money, round, serialize, sum } from "../../lib/money";
import {
  bucketRatesByName,
  computeOfferingTotals,
  serializeOfferingTotals,
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

export async function loadBucketRates(churchId: string) {
  const categories = await prisma.incomeCategory.findMany({
    where: { churchId, active: true },
    select: { name: true, bucketRatePercent: true },
  });
  return bucketRatesByName(categories);
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

  const frozen: BucketRates = new Map();
  for (const category of offering.categories) {
    if (category.bucketRateSnapshot === null) continue;
    frozen.set(category.name.trim().toLowerCase(), money(category.bucketRateSnapshot));
  }
  return frozen;
}

function toCategoryInputs(offering: OfferingWithRelations): CategoryInput[] {
  return offering.categories.map((category) => ({
    id: category.id,
    name: category.name,
    isCash: category.isCash,
    transferAmount: category.transferAmount,
    denominations: category.denominations.map((d) => ({
      denomination: d.denomination,
      quantity: d.quantity,
    })),
  }));
}

/// The single read shape every offering screen uses. Totals are computed here,
/// never read from a column.
export async function presentOffering(offering: OfferingWithRelations) {
  const rates = await ratesForOffering(offering);
  const totals = computeOfferingTotals(toCategoryInputs(offering), rates);
  const serialized = serializeOfferingTotals(totals);

  // A revision never rewrites the categories, so the revised total is the
  // counted total plus every recorded delta. Both stay visible.
  const revisionDelta = sum(offering.revisions.map((r) => r.deltaAmount));
  const revisedTotal = round(totals.categoriesTotal.add(revisionDelta));

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
    categories: offering.categories.map((category, index) => ({
      ...serialized.categories[index],
      denominations: category.denominations.map((d) => ({
        denomination: d.denomination,
        quantity: d.quantity,
        lineTotal: serialize(money(d.denomination).mul(d.quantity)),
      })),
    })),
    totals: {
      cashTotal: serialized.cashTotal,
      transferTotal: serialized.transferTotal,
      categoriesTotal: serialized.categoriesTotal,
      bucketTotal: serialized.bucketTotal,
      usableIncome: serialized.usableIncome,
    },
    revisions: offering.revisions.map((revision) => ({
      id: revision.id,
      reason: revision.reason,
      categoryName: revision.categoryName,
      deltaAmount: serialize(revision.deltaAmount),
      originalTotal: serialize(revision.originalTotal),
      revisedTotal: serialize(revision.revisedTotal),
      recordedAt: revision.recordedAt,
      recordedBy: revision.recordedBy,
    })),
    // Shown side by side wherever the record has been revised.
    originalTotal: serialize(totals.categoriesTotal),
    revisedTotal: serialize(revisedTotal),
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

  const rates = await loadBucketRates(churchId);
  const totals = computeOfferingTotals(toCategoryInputs(offering), rates);

  if (totals.categoriesTotal.lte(0)) {
    throw badRequest("This offering has no amounts recorded yet.");
  }

  await prisma.$transaction([
    // Freeze each category's rate before the status changes, in the same
    // transaction, so a finalized offering can never be short of a snapshot.
    ...offering.categories.map((category) =>
      prisma.offeringCategory.update({
        where: { id: category.id },
        data: { bucketRateSnapshot: rates.get(category.name.trim().toLowerCase()) ?? null },
      }),
    ),
    prisma.offering.update({
      where: { id },
      data: {
        status: OfferingStatus.FINALIZED,
        finalizedById: userId,
        finalizedAt: new Date(),
      },
    }),
    prisma.auditEvent.create({
      data: {
        churchId,
        actorId: userId,
        action: "offering.finalized",
        entityType: "Offering",
        entityId: id,
        summary: `Finalized at ${totals.categoriesTotal.toFixed(2)}`,
        metadata: {
          cashTotal: totals.cashTotal.toFixed(2),
          transferTotal: totals.transferTotal.toFixed(2),
          categoriesTotal: totals.categoriesTotal.toFixed(2),
        },
      },
    }),
  ]);

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

  await prisma.$transaction([
    prisma.offering.update({
      where: { id },
      data: { status: OfferingStatus.APPROVED, approvedById: userId, approvedAt: new Date() },
    }),
    prisma.auditEvent.create({
      data: {
        churchId,
        actorId: userId,
        action: "offering.approved",
        entityType: "Offering",
        entityId: id,
        summary: "Approved by the Senior Pastor",
      },
    }),
  ]);

  return findOffering(churchId, id);
}

/// A late transfer. Records the delta against a snapshot of the total at the
/// time, so the original and the revised figure can be shown distinctly.
export async function recordRevision(
  churchId: string,
  id: string,
  userId: string,
  input: {
    reason: string;
    categoryName?: string | null;
    deltaAmount: string;
    idempotencyKey: string;
  },
) {
  const offering = await findOffering(churchId, id);

  if (offering.status === OfferingStatus.DRAFT) {
    throw conflict("This offering is still a draft — edit it directly instead.");
  }

  // A retry of a revision already recorded resolves to that revision rather
  // than adding a second one. Checked here for the common case; the unique
  // constraint below is what holds when two requests race.
  const alreadyRecorded = await prisma.offeringRevision.findFirst({
    where: { offeringId: id, idempotencyKey: input.idempotencyKey },
  });
  if (alreadyRecorded) return findOffering(churchId, id);

  const delta = round(money(input.deltaAmount));
  if (delta.isZero()) throw badRequest("A revision needs a non-zero amount.");

  const rates = await ratesForOffering(offering);
  const totals = computeOfferingTotals(toCategoryInputs(offering), rates);

  const priorDelta = sum(offering.revisions.map((r) => r.deltaAmount));
  const originalTotal = round(totals.categoriesTotal.add(priorDelta));
  const revisedTotal = round(originalTotal.add(delta));

  try {
    await prisma.$transaction([
      prisma.offeringRevision.create({
        data: {
          churchId,
          offeringId: id,
          idempotencyKey: input.idempotencyKey,
          reason: input.reason,
          categoryName: input.categoryName ?? null,
          deltaAmount: delta,
          originalTotal,
          revisedTotal,
          recordedById: userId,
        },
      }),
      prisma.offering.update({
        where: { id },
        data: { status: OfferingStatus.REVISED },
      }),
      prisma.auditEvent.create({
        data: {
          churchId,
          actorId: userId,
          action: "offering.revised",
          entityType: "Offering",
          entityId: id,
          summary: input.reason,
          metadata: {
            deltaAmount: delta.toFixed(2),
            originalTotal: originalTotal.toFixed(2),
            revisedTotal: revisedTotal.toFixed(2),
          },
        },
      }),
    ]);
  } catch (error) {
    // Two requests raced and the unique constraint caught the loser. The
    // revision the winner wrote is the right answer, not an error the treasurer
    // has to read and wonder about.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return findOffering(churchId, id);
    }
    throw error;
  }

  return findOffering(churchId, id);
}
