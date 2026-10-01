import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { badRequest } from "../lib/errors";

type Schemas = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

/// Field-level messages go straight to the form, so the validation state the
/// design calls for on every action screen has something to render.
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    for (const key of ["body", "query", "params"] as const) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key]);
      if (!result.success) {
        const fields: Record<string, string> = {};
        for (const issue of result.error.issues) {
          const path = issue.path.join(".") || key;
          if (!fields[path]) fields[path] = issue.message;
        }
        return next(badRequest("Please check the highlighted fields.", { fields }));
      }

      if (key === "query") Object.assign(req.query, result.data);
      else req[key] = result.data as never;
    }
    next();
  };
}
