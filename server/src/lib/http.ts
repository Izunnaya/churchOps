import type { Request } from "express";
import { badRequest } from "./errors";

/// Express 5 types route params as `string | string[]`, since a pattern can
/// bind the same name more than once. None of ours do, so narrow in one place
/// rather than casting at every call site.
export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || value.length === 0) {
    throw badRequest(`Missing ${name} in the URL.`);
  }
  return value;
}
