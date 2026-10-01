import "dotenv/config";

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number.`);
  return parsed;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing. Add it to your .env file.`);
  return value;
}

export const isProduction = process.env.NODE_ENV === "production";

export const env = {
  port: numberFromEnv("PORT", 4000),

  /// A getter, not a value, so a missing secret fails when a token is signed
  /// rather than at import time. Without that the server could not start at all
  /// until 1.3 lands, and there is deliberately no fallback: a default signing
  /// secret is worse than a crash.
  get jwtSecret(): string {
    return required("JWT_SECRET");
  },

  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? "15m",
  refreshTokenTtlDays: numberFromEnv("REFRESH_TOKEN_TTL_DAYS", 30),
};
