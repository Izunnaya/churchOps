import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken, type AccessTokenPayload } from "../lib/auth";
import { unauthorized } from "../lib/errors";

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(unauthorized());

  try {
    req.user = verifyAccessToken(header.slice(7));
    next();
  } catch {
    next(unauthorized("Your session has expired. Please sign in again."));
  }
}
