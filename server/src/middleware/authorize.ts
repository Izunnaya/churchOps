import type { NextFunction, Request, Response } from "express";
import { forbidden, unauthorized } from "../lib/errors";
import { Role } from "../generated/prisma/enums";

/// Role-aware access, mirroring the navigation: a user only reaches what their
/// role covers. The Pastor is never granted a write role on finance — he
/// approves, and approval has its own endpoint.
export function authorize(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    const held = req.user.roles ?? [];
    if (!held.some((role) => allowed.includes(role))) return next(forbidden());
    next();
  };
}

export function hasRole(req: Request, role: Role): boolean {
  return (req.user?.roles ?? []).includes(role);
}

/// A department leader may only touch their own department's reports.
export function leadsDepartment(req: Request, departmentId: string): boolean {
  return (req.user?.departmentIds ?? []).includes(departmentId);
}
