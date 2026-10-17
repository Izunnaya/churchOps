import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors";
import { isDevelopment, isTest } from "../lib/env";

/// Fixed text. The path the caller asked for is attacker-chosen and the client
/// renders this message verbatim, so reflecting it back would let a link write
/// a sentence of its own choosing inside the app's error panel — and would put
/// an internal route in front of someone who has no use for one.
const NOT_FOUND_MESSAGE = "We could not find what you were looking for.";

const GENERIC_CLIENT_ERROR = {
  code: "BAD_REQUEST",
  message: "We could not read that request. Please check what you sent and try again.",
};

/// Keyed on the status the body parser (or any other Express middleware that
/// follows the convention) put on the error.
const CLIENT_ERRORS: Record<number, { code: string; message: string }> = {
  400: GENERIC_CLIENT_ERROR,
  404: { code: "NOT_FOUND", message: NOT_FOUND_MESSAGE },
  413: { code: "REQUEST_TOO_LARGE", message: "That request was too large to accept." },
  415: {
    code: "UNSUPPORTED_FORMAT",
    message: "We could not read that format. Please try again.",
  },
};

/*
  express.json() rejects a malformed body by throwing a SyntaxError that carries
  `status: 400` and `type: "entity.parse.failed"`; the same convention covers a
  body that is too large (413) and an unsupported charset (415). None of those
  is the server breaking, so none of them is a 500 — the caller is told the
  request was wrong, not that it was our fault and worth retrying unchanged.
*/
function clientErrorStatus(err: unknown): number | null {
  if (typeof err !== "object" || err === null) return null;

  const candidate = err as { status?: unknown; statusCode?: unknown; type?: unknown };
  const status =
    typeof candidate.status === "number"
      ? candidate.status
      : typeof candidate.statusCode === "number"
        ? candidate.statusCode
        : null;

  if (status !== null && status >= 400 && status <= 499) return status;
  if (candidate.type === "entity.parse.failed") return 400;

  return null;
}

/// A suite asserts dozens of 404s on purpose; logging each one buries the
/// failures. Everywhere else the line is wanted.
function logUnlessTesting(line: string, detail?: unknown): void {
  if (isTest) return;
  if (detail === undefined) console.warn(line);
  else console.warn(line, detail);
}

export function notFoundHandler(req: Request, res: Response) {
  logUnlessTesting(`No route for ${req.method} ${req.originalUrl}`);

  res.status(404).json({
    error: { code: "NOT_FOUND", message: NOT_FOUND_MESSAGE },
  });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  const status = clientErrorStatus(err);
  if (status !== null) {
    const { code, message } = CLIENT_ERRORS[status] ?? GENERIC_CLIENT_ERROR;

    logUnlessTesting(
      `Rejected ${req.method} ${req.originalUrl} with ${status}:`,
      err instanceof Error ? err.message : err,
    );

    return res.status(status).json({ error: { code, message } });
  }

  /*
    Only from here down is this the server's fault. The detail is logged in
    full and never sent: a Prisma error names the database host, the user, the
    model, the failing constraint and an absolute source path, and a validation
    error echoes the arguments it was given — which on sign-in is somebody's
    email address.
  */
  console.error("Unhandled error:", err);

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong on our end. Please try again.",
      ...(isDevelopment ? { debug: err instanceof Error ? err.message : String(err) } : {}),
    },
  });
}
