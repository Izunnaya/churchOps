export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, message, "BAD_REQUEST", details);

export const unauthorized = (message = "You are not signed in.") =>
  new AppError(401, message, "UNAUTHORIZED");

export const forbidden = (message = "You do not have access to that.") =>
  new AppError(403, message, "FORBIDDEN");

export const notFound = (what = "That record") =>
  new AppError(404, `${what} could not be found.`, "NOT_FOUND");

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, message, "CONFLICT", details);
