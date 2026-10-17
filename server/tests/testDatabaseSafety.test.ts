import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
  Which database a test run is pointed at, proved rather than assumed.

  The rule: a test run reads .env.test and never .env. The suites truncate what
  they are given, and .env is the development database — a live hosted Postgres
  — so a silent fallback would delete somebody's work with nothing to say it
  had.

  ---------------------------------------------------------------------------
  NOTHING IN THIS FILE MAY PRINT A CONNECTION STRING.

  An earlier version compared URLs with `toBe`. vitest prints both sides of a
  failed assertion, so the first time the assertion flipped the live Neon
  string — password included — went into a terminal and then into a report.
  Asserting a value you never meant to reveal is safe only while it passes,
  which is the one state you cannot rely on in a test.

  So every comparison below is on a SHA-256 digest or on a boolean. A digest
  distinguishes two strings without carrying either, and a boolean carries
  nothing at all. The raw values never enter an `expect`, a message, or a
  variable that an assertion can reach.
  ---------------------------------------------------------------------------

  This file reads configuration and the process environment. It opens no
  connection.
*/

const serverDirectory = resolve(__dirname, "..");
const developmentEnvPath = resolve(serverDirectory, ".env");
const testEnvPath = resolve(serverDirectory, ".env.test");

/// The only form a secret is allowed to take anywhere in this file.
const digest = (value: string | undefined): string =>
  value === undefined ? "absent" : createHash("sha256").update(value).digest("hex");

const readUrlFrom = (path: string): string | undefined => {
  if (!existsSync(path)) return undefined;
  const match = /^DATABASE_URL=(.*)$/m.exec(readFileSync(path, "utf8"));
  return match?.[1].trim().replace(/^["']|["']$/g, "");
};

/// Host and port only — never the user, password or database name. Still only
/// ever compared as a digest.
const hostOf = (url: string | undefined): string | undefined =>
  url === undefined ? undefined : /@([^/?]+)/.exec(url)?.[1];

const developmentUrlDigest = digest(readUrlFrom(developmentEnvPath));
const testUrlDigest = digest(readUrlFrom(testEnvPath));
const developmentHostDigest = digest(hostOf(readUrlFrom(developmentEnvPath)));
const testHostDigest = digest(hostOf(readUrlFrom(testEnvPath)));

/*
  Booleans computed outside any assertion, so the string they describe is never
  in scope where vitest could print it.
*/
const developmentUrlExists = readUrlFrom(developmentEnvPath) !== undefined;
const testUrlExists = readUrlFrom(testEnvPath) !== undefined;
const testUrlIsRemote = /@(?!localhost|127\.0\.0\.1)/.test(readUrlFrom(testEnvPath) ?? "@localhost");

describe("the environment a test run gets", () => {
  it("runs as NODE_ENV=test", () => {
    expect(process.env.NODE_ENV).toBe("test");
  });

  it("has a .env.test to read", () => {
    expect(existsSync(testEnvPath)).toBe(true);
    expect(testUrlExists).toBe(true);
  });

  it("has a .env that is a different database from it", () => {
    // If these were ever the same file or the same URL, every assertion below
    // would pass while proving nothing.
    expect(developmentUrlExists).toBe(true);
    expect(testUrlDigest).not.toBe(developmentUrlDigest);
    expect(testHostDigest).not.toBe(developmentHostDigest);
  });

  /*
    The one that matters. `src/lib/env.ts` must resolve DATABASE_URL from
    .env.test under NODE_ENV=test, and must not fall back to .env.
  */
  it("resolves DATABASE_URL from .env.test, not from .env", async () => {
    await import("../src/lib/env");

    const resolvedDigest = digest(process.env.DATABASE_URL);

    expect(resolvedDigest).toBe(testUrlDigest);
    expect(resolvedDigest).not.toBe(developmentUrlDigest);
  });

  it("the test database is local, so a run cannot reach the hosted one", () => {
    expect(testUrlIsRemote).toBe(false);
  });

  it("no test file in this package opens a database connection yet", () => {
    // True today, and the reason the earlier fallback never bit. It stops
    // being true the moment a router is mounted.
    const testFiles = readdirSync(__dirname).filter((name) => name.endsWith(".test.ts"));

    const importingPrisma = testFiles
      // This file names the module in prose; it is the checker, not a subject.
      .filter((name) => name !== "testDatabaseSafety.test.ts")
      .filter((name) =>
        /^\s*import[^;]*lib\/prisma|new PrismaClient/m.test(
          readFileSync(resolve(__dirname, name), "utf8"),
        ),
      );

    expect(importingPrisma).toEqual([]);
  });
});

describe("what is committable", () => {
  it("both .example files carry keys with no values", () => {
    for (const example of [".env.example", ".env.test.example"]) {
      const contents = readFileSync(resolve(serverDirectory, example), "utf8");

      const assignments = contents
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"));

      expect(assignments.length).toBeGreaterThan(0);

      // The KEY is safe to name in a failure; whatever follows `=` is not, so
      // the assertion is on a boolean and the message carries the key alone.
      for (const assignment of assignments) {
        const key = assignment.split("=")[0];
        const isKeyOnly = /^[A-Z0-9_]+=$/.test(assignment);
        expect(isKeyOnly, `${example}: ${key} has a value next to it`).toBe(true);
      }
    }
  });

  it("neither .example file names a real host or credential", () => {
    // Compared as digests of the lines, never by printing either side.
    const developmentHost = hostOf(readUrlFrom(developmentEnvPath));
    const testHost = hostOf(readUrlFrom(testEnvPath));

    for (const example of [".env.example", ".env.test.example"]) {
      const contents = readFileSync(resolve(serverDirectory, example), "utf8");

      const namesDevelopmentHost =
        developmentHost !== undefined && contents.includes(developmentHost);
      const namesTestHost = testHost !== undefined && contents.includes(testHost);

      expect(namesDevelopmentHost, `${example} names the development host`).toBe(false);
      expect(namesTestHost, `${example} names the test host`).toBe(false);
    }
  });

  it("no .env file is reachable by git", () => {
    const ignored = readFileSync(resolve(serverDirectory, ".gitignore"), "utf8");

    expect(ignored).toMatch(/^\.env$/m);
    expect(ignored).toMatch(/^\.env\.\*$/m);
    expect(ignored).toMatch(/^!\.env\.example$/m);
    expect(ignored).toMatch(/^!\.env\.test\.example$/m);
  });
});

/*
  The guard itself — env.ts throwing when .env.test is absent — is NOT exercised
  here. Doing so means moving the engineer's own gitignored .env.test out of the
  way mid-run, and a crash between the move and the restore destroys a local
  file this suite had no business touching. Reported as unverified rather than
  risked.
*/
