import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { Role } from "../../generated/prisma/enums";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { conflict, notFound } from "../../lib/errors";
import { param } from "../../lib/http";

/// Backs both the "Add category" sheet and the Treasurer's bucket-rate table.
/// They are one list on purpose: a rate table keyed separately by category name
/// would drift out of step with the names it is meant to match.
export const incomeCategoriesRouter = Router();

incomeCategoriesRouter.use(authenticate);

const ratePercent = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, "Enter a percentage like 10 or 12.5")
  .refine((v) => Number(v) >= 0 && Number(v) <= 100, "Use a percentage between 0 and 100");

incomeCategoriesRouter.get(
  "/",
  authorize(Role.TREASURER, Role.SECRETARY, Role.PASTOR),
  async (_req, res) => {
    const categories = await prisma.incomeCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    res.json({
      data: categories.map((category) => ({
        id: category.id,
        name: category.name,
        isCashByDefault: category.isCashByDefault,
        bucketRatePercent: category.bucketRatePercent
          ? category.bucketRatePercent.toFixed(2)
          : null,
        sortOrder: category.sortOrder,
        active: category.active,
      })),
    });
  },
);

incomeCategoriesRouter.post(
  "/",
  authorize(Role.TREASURER),
  validate({
    body: z.object({
      name: z.string().trim().min(1, "Give the category a name"),
      isCashByDefault: z.boolean().default(true),
      bucketRatePercent: ratePercent.nullish(),
    }),
  }),
  async (req, res) => {
    const { name, isCashByDefault, bucketRatePercent } = req.body as {
      name: string;
      isCashByDefault: boolean;
      bucketRatePercent?: string | null;
    };

    const existing = await prisma.incomeCategory.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (existing) throw conflict(`${name} is already on the list.`);

    const count = await prisma.incomeCategory.count();

    const category = await prisma.incomeCategory.create({
      data: {
        name,
        isCashByDefault,
        bucketRatePercent: bucketRatePercent ?? null,
        sortOrder: count,
        updatedById: req.user!.sub,
      },
    });

    res.status(201).json({ data: category });
  },
);

incomeCategoriesRouter.patch(
  "/:id",
  authorize(Role.TREASURER),
  validate({
    body: z.object({
      name: z.string().trim().min(1).optional(),
      isCashByDefault: z.boolean().optional(),
      bucketRatePercent: ratePercent.nullish(),
      active: z.boolean().optional(),
      sortOrder: z.number().int().min(0).optional(),
    }),
  }),
  async (req, res) => {
    const existing = await prisma.incomeCategory.findUnique({ where: { id: param(req, "id") } });
    if (!existing) throw notFound("That category");

    const body = req.body as {
      name?: string;
      isCashByDefault?: boolean;
      bucketRatePercent?: string | null;
      active?: boolean;
      sortOrder?: number;
    };

    const category = await prisma.incomeCategory.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.isCashByDefault !== undefined
          ? { isCashByDefault: body.isCashByDefault }
          : {}),
        ...(body.bucketRatePercent !== undefined
          ? { bucketRatePercent: body.bucketRatePercent }
          : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        updatedById: req.user!.sub,
      },
    });

    res.json({ data: category });
  },
);

/// Categories are retired rather than deleted: past offerings reference them by
/// name, and the rate that was applied then has to stay explicable.
incomeCategoriesRouter.delete("/:id", authorize(Role.TREASURER), async (req, res) => {
  const existing = await prisma.incomeCategory.findUnique({ where: { id: param(req, "id") } });
  if (!existing) throw notFound("That category");

  const category = await prisma.incomeCategory.update({
    where: { id: existing.id },
    data: { active: false, updatedById: req.user!.sub },
  });

  res.json({ data: category });
});
