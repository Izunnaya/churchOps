import type { NextFunction, Request, Response } from "express";
import prisma from "../lib/prisma";
import { forbidden, unauthorized } from "../lib/errors";
import { ChurchStatus } from "../generated/prisma/enums";

declare global {
  namespace Express {
    interface Request {
      /// The church this request acts for. Set here, from the verified session,
      /// and nowhere else in the application.
      churchId?: string;
    }
  }
}

/// The caller's church comes from the signed session and nothing else. No route
/// takes a church as a parameter and no controller reads one from a body, query
/// or header, so a client cannot choose which church it acts on.
///
/// Runs after `authenticate`, because it reads the verified token.
export async function scopeToChurch(req: Request, _res: Response, next: NextFunction) {
  const signed = req.user?.churchId;
  if (!signed) return next(unauthorized());

  const church = await prisma.church.findUnique({
    where: { id: signed },
    select: { id: true, status: true },
  });

  // Removed, suspended or closed — the session cannot act for it either way.
  // The wording never says which, and never names the church.
  if (!church || church.status !== ChurchStatus.ACTIVE) {
    return next(forbidden("Your access has changed."));
  }

  req.churchId = church.id;
  next();
}

/// Narrows the optional request field at the point of use, so a controller that
/// forgets the middleware fails loudly instead of writing rows with no church.
export function churchOf(req: Request): string {
  if (!req.churchId) {
    throw unauthorized();
  }
  return req.churchId;
}
