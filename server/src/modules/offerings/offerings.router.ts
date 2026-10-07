import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { OfferingStatus, Role } from "../../generated/prisma/enums";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { churchOf, scopeToChurch } from "../../middleware/scopeToChurch";
import { validate } from "../../middleware/validate";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { param } from "../../lib/http";
import { money, round } from "../../lib/money";
import { DENOMINATIONS } from "../../domain/offering";
import {
  approveOffering,
  assertEditable,
  finalizeOffering,
  findOffering,
  offeringInclude,
  presentOffering,
  recordRevision,
} from "./offerings.service";

export const offeringsRouter = Router();

offeringsRouter.use(authenticate);
offeringsRouter.use(scopeToChurch);

/// Finance is visible to the Secretary and the Pastor, and writable only by the
/// Treasurer. The Pastor's only write is approval, which has its own route.
const canView = authorize(Role.TREASURER, Role.SECRETARY, Role.PASTOR);
const canEdit = authorize(Role.TREASURER);

const amount = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 3500 or 3500.00");

const signedAmount = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "Enter an amount like 3500 or -3500");

// --- history -------------------------------------------------------------

offeringsRouter.get(
  "/",
  canView,
  validate({
    query: z.object({
      status: z.enum(OfferingStatus).optional(),
      take: z.coerce.number().int().min(1).max(100).default(25),
      skip: z.coerce.number().int().min(0).default(0),
    }),
  }),
  async (req, res) => {
    const { status, take, skip } = req.query as unknown as {
      status?: OfferingStatus;
      take: number;
      skip: number;
    };

    const churchId = churchOf(req);
    const where = status ? { churchId, status } : { churchId };

    const [rows, total] = await Promise.all([
      prisma.offering.findMany({
        where,
        include: offeringInclude,
        orderBy: { service: { heldOn: "desc" } },
        take,
        skip,
      }),
      prisma.offering.count({ where }),
    ]);

    res.json({
      data: await Promise.all(rows.map(presentOffering)),
      page: { total, take, skip },
    });
  },
);

offeringsRouter.get("/:id", canView, async (req, res) => {
  const offering = await findOffering(churchOf(req), param(req, "id"));
  res.json({ data: await presentOffering(offering) });
});

// --- draft ---------------------------------------------------------------

offeringsRouter.post(
  "/",
  canEdit,
  validate({ body: z.object({ serviceId: z.string().min(1) }) }),
  async (req, res) => {
    const churchId = churchOf(req);
    const { serviceId } = req.body as { serviceId: string };

    // Scoped: a service in another church reads as missing, not forbidden.
    const service = await prisma.service.findFirst({ where: { id: serviceId, churchId } });
    if (!service) throw notFound("That service");

    const existing = await prisma.offering.findFirst({ where: { serviceId, churchId } });
    if (existing) {
      throw conflict("An offering has already been started for this service.", {
        offeringId: existing.id,
      });
    }

    const offering = await prisma.offering.create({
      data: { churchId, serviceId, recordedById: req.user!.sub },
      include: offeringInclude,
    });

    res.status(201).json({ data: await presentOffering(offering) });
  },
);

// --- categories ----------------------------------------------------------

/// Adding a category is the first step of the category-first flow. A cash
/// category starts with an empty count sheet; a transfer category carries only
/// its amount, because there is no physical cash to break down.
offeringsRouter.post(
  "/:id/categories",
  canEdit,
  validate({
    body: z
      .object({
        name: z.string().trim().min(1, "Give the category a name"),
        isCash: z.boolean().default(true),
        transferAmount: amount.optional(),
      })
      .refine((v) => v.isCash || v.transferAmount !== undefined, {
        message: "A transfer category needs an amount",
        path: ["transferAmount"],
      })
      .refine((v) => !v.isCash || v.transferAmount === undefined, {
        message: "A cash category's total comes from its note counts",
        path: ["transferAmount"],
      }),
  }),
  async (req, res) => {
    const offering = await findOffering(churchOf(req), param(req, "id"));
    assertEditable(offering);

    const { name, isCash, transferAmount } = req.body as {
      name: string;
      isCash: boolean;
      transferAmount?: string;
    };

    const duplicate = offering.categories.some(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) throw conflict(`${name} is already on this offering.`);

    await prisma.offeringCategory.create({
      data: {
        churchId: offering.churchId,
        offeringId: offering.id,
        name,
        isCash,
        transferAmount: isCash ? null : round(money(transferAmount)),
        sortOrder: offering.categories.length,
      },
    });

    res.status(201).json({ data: await presentOffering(await findOffering(offering.churchId, offering.id)) });
  },
);

/// The denomination stepper. Quantities are replaced wholesale for the
/// category, which keeps the client's live total and the server's in step
/// without a per-note round trip.
offeringsRouter.patch(
  "/:id/categories/:categoryId",
  canEdit,
  validate({
    body: z.object({
      name: z.string().trim().min(1).optional(),
      transferAmount: amount.optional(),
      denominations: z
        .array(
          z.object({
            denomination: z
              .number()
              .int()
              .refine((d) => (DENOMINATIONS as readonly number[]).includes(d), {
                message: "Not a note we count",
              }),
            quantity: z.number().int().min(0).max(100_000),
          }),
        )
        .optional(),
    }),
  }),
  async (req, res) => {
    const offering = await findOffering(churchOf(req), param(req, "id"));
    assertEditable(offering);

    const category = offering.categories.find((c) => c.id === param(req, "categoryId"));
    if (!category) throw notFound("That category");

    const { name, transferAmount, denominations } = req.body as {
      name?: string;
      transferAmount?: string;
      denominations?: { denomination: number; quantity: number }[];
    };

    if (denominations && !category.isCash) {
      throw badRequest("This is a transfer category — it has no note counts.");
    }
    if (transferAmount !== undefined && category.isCash) {
      throw badRequest("A cash category's total comes from its note counts.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.offeringCategory.update({
        where: { id: category.id },
        data: {
          ...(name ? { name } : {}),
          ...(transferAmount !== undefined
            ? { transferAmount: round(money(transferAmount)) }
            : {}),
        },
      });

      if (denominations) {
        await tx.denominationCount.deleteMany({ where: { categoryId: category.id } });
        const rows = denominations.filter((d) => d.quantity > 0);
        if (rows.length > 0) {
          await tx.denominationCount.createMany({
            data: rows.map((d) => ({
              churchId: offering.churchId,
              categoryId: category.id,
              denomination: d.denomination,
              quantity: d.quantity,
            })),
          });
        }
      }
    });

    res.json({ data: await presentOffering(await findOffering(offering.churchId, offering.id)) });
  },
);

offeringsRouter.delete("/:id/categories/:categoryId", canEdit, async (req, res) => {
  const offering = await findOffering(churchOf(req), param(req, "id"));
  assertEditable(offering);

  const category = offering.categories.find((c) => c.id === param(req, "categoryId"));
  if (!category) throw notFound("That category");

  await prisma.offeringCategory.delete({ where: { id: category.id } });

  res.json({ data: await presentOffering(await findOffering(offering.churchId, offering.id)) });
});

// --- state changes -------------------------------------------------------

offeringsRouter.post("/:id/finalize", canEdit, async (req, res) => {
  const offering = await finalizeOffering(churchOf(req), param(req, "id"), req.user!.sub);
  res.json({ data: await presentOffering(offering) });
});

offeringsRouter.post("/:id/approve", authorize(Role.PASTOR), async (req, res) => {
  const offering = await approveOffering(churchOf(req), param(req, "id"), req.user!.sub);
  res.json({ data: await presentOffering(offering) });
});

/// Lets the Pastor raise a question without it counting as approval or
/// rejection. Visible to the Treasurer who recorded the offering.
offeringsRouter.post(
  "/:id/comments",
  authorize(Role.PASTOR, Role.SECRETARY, Role.TREASURER),
  validate({ body: z.object({ body: z.string().trim().min(1, "Write a note first") }) }),
  async (req, res) => {
    const offering = await findOffering(churchOf(req), param(req, "id"));

    await prisma.approvalComment.create({
      data: {
        churchId: offering.churchId,
        authorId: req.user!.sub,
        body: (req.body as { body: string }).body,
        offeringId: offering.id,
      },
    });

    res.status(201).json({ data: await presentOffering(await findOffering(offering.churchId, offering.id)) });
  },
);

offeringsRouter.post(
  "/:id/revisions",
  canEdit,
  validate({
    body: z.object({
      reason: z.string().trim().min(1, "Say what changed and why"),
      categoryName: z.string().trim().min(1).optional(),
      deltaAmount: signedAmount,
      // Held by the client across a retry, so a double tap or a dropped
      // connection cannot record the same late transfer twice.
      idempotencyKey: z.string().trim().min(8, "Send a key of at least 8 characters"),
    }),
  }),
  async (req, res) => {
    const offering = await recordRevision(
      churchOf(req),
      param(req, "id"),
      req.user!.sub,
      req.body as {
        reason: string;
        categoryName?: string;
        deltaAmount: string;
        idempotencyKey: string;
      },
    );
    res.status(201).json({ data: await presentOffering(offering) });
  },
);
