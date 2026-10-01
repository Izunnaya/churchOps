import "dotenv/config";

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number.`);
  return parsed;
}

export const isProduction = process.env.NODE_ENV === "production";

/// Only what the server needs to start. DATABASE_URL arrives with 0.2 and the
/// token settings with 1.3, each checked by the slice that first needs them.
export const env = {
  port: numberFromEnv("PORT", 4000),
};
