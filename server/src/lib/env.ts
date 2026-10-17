import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";

/// No default. An unset NODE_ENV is its own case and must match none of the
/// three flags below, because the safe branch has to be the one you get when
/// nothing is configured.
const environmentName = process.env.NODE_ENV ?? "";

export const isProduction = environmentName === "production";
export const isTest = environmentName === "test";

/// Deliberately not "anything that is not production". `npx ts-node src/index.ts`
/// leaves NODE_ENV unset, so a flag defined as a negation — or one that
/// defaults the unset case to development — would treat the documented way of
/// running the server as a debugging session and start attaching raw error
/// text to responses. Development has to be asked for by name.
export const isDevelopment = environmentName === "development";

/// server/, two levels up from src/lib.
const serverDirectory = resolve(__dirname, "..", "..");

/*
  A test run reads .env.test and never .env.

  The suites truncate what they are given, and .env is the database with your
  own work in it. A missing .env.test therefore has to stop the run: falling
  back would point the first database-backed suite at development data, and
  nothing would say so until rows went missing.
*/
if (isTest) {
  const testEnvPath = resolve(serverDirectory, ".env.test");

  if (!existsSync(testEnvPath)) {
    throw new Error(
      "server/.env.test is missing, and a test run must never fall back to server/.env.\n" +
        "Create it by copying server/.env.test.example, then point DATABASE_URL at a " +
        "database the suite is allowed to empty — a Neon branch of your database, or a " +
        "throwaway local one. server/.env holds the development database, and the tests " +
        "delete rows from whatever they are given.",
    );
  }

  dotenv.config({ path: testEnvPath });
} else {
  dotenv.config();
}

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

/// Comma-separated, so a staging host can be added without a code change. The
/// default is the Vite dev server, which is the only origin local work needs.
function corsOriginsFromEnv(): string[] {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw) return ["http://localhost:5173"];
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export const env = {
  port: numberFromEnv("PORT", 4000),

  corsOrigins: corsOriginsFromEnv(),

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
