import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors";
import { isProduction } from "../lib/env";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` },
  });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  console.error("Unhandled error:", err);

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong on our end. Please try again.",
      ...(isProduction ? {} : { debug: err instanceof Error ? err.message : String(err) }),
    },
  });
}
