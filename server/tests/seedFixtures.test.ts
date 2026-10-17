import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
  The seed, read as a committed artefact.

  Two rules apply to it and neither is negotiable:

  - "No real member data, figures, or credentials in the repo. Fake seed data
    only." (CLAUDE.md, CONVENTIONS section 2)
  - Every isolation test needs a second church to try and fail to reach, with
    data confusable enough that a query which forgets to scope returns
    something plausible rather than something obviously wrong.

  This reads the file. It opens no connection — the state of the live database
  is reported separately, because a test suite must never be pointed at it.
*/

const seedPath = resolve(__dirname, "..", "prisma", "seed.ts");
const seed = readFileSync(seedPath, "utf8");

/// Everything in the file that is written as a quoted string.
const quotedStrings = [...seed.matchAll(/["'`]([^"'`\n]{2,})["'`]/g)].map((match) => match[1]);

describe("the seed creates two churches", () => {
  it("declares exactly two, with distinct slugs", () => {
    const slugs = [...seed.matchAll(/slug:\s*"([^"]+)"/g)].map((match) => match[1]);

    expect(slugs).toHaveLength(2);
    expect(new Set(slugs).size).toBe(2);
  });

  it("upserts on the slug, so a re-run updates rather than duplicating", () => {
    // Re-running a seed is routine. A seed that multiplies its rows makes
    // "two churches" stop being a fact the isolation tests can rely on.
    expect(seed).toMatch(/upsert\(\{/);
    expect(seed).toMatch(/where:\s*\{\s*slug:/);
  });

  it("gives the two different module sets, so nothing can assume they match", () => {
    const moduleBlocks = [...seed.matchAll(/enabledModules:\s*\[([^\]]*)\]/g)].map(
      (match) => match[1].replace(/\s+/g, ""),
    );

    expect(moduleBlocks).toHaveLength(2);
    expect(moduleBlocks[0]).not.toBe(moduleBlocks[1]);
  });
});

describe("nothing in the seed is real", () => {
  it("contains no email address", () => {
    expect(seed).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]{2,}/);
  });

  it("contains no phone number in any Nigerian form", () => {
    expect(seed).not.toMatch(/\+234\d{6,}/);
    expect(seed).not.toMatch(/\b0[789]\d{9}\b/);
  });

  it("contains no person's name field at all", () => {
    // Members, users and leaders arrive with the slice that gives every
    // church-owned model its churchId. Until then there is nobody to get wrong.
    expect(seed).not.toMatch(/\bfullName:/);
    expect(seed).not.toMatch(/\bfirstName:/);
    expect(seed).not.toMatch(/\bpasswordHash:/);
  });

  it("contains no money figure", () => {
    expect(seed).not.toMatch(/Kobo\s*:/);
    expect(seed).not.toMatch(/amount\s*:/i);
  });

  it("contains no credential or connection string", () => {
    expect(seed).not.toMatch(/postgres(ql)?:\/\//);
    expect(seed).not.toMatch(/\bsecret\b/i);
    for (const value of quotedStrings) {
      // A long opaque token is what a leaked key looks like.
      expect(value).not.toMatch(/^[A-Za-z0-9_-]{32,}$/);
    }
  });

  it("says in the file itself that the data is invented", () => {
    expect(seed).toMatch(/[Ff]ictional data only/);
  });
});

/*
  What the seed does NOT yet provide, asserted as it stands today rather than
  as the gap it leaves.

  The confusable fixtures every isolation test needs — the same category name
  in both churches, a member with the same name in both, near-identical emails
  — do not exist, because no church-owned model carries a churchId yet. The
  seed's own comment says so. These assertions pin the current shape so the
  gap is visible in the suite rather than only in a report; they are replaced,
  not deleted, by the slice that adds the fixtures.
*/
describe("the fixtures the isolation tests will need", () => {
  it("are not here yet: the seed creates Church rows and nothing else", () => {
    const modelsWritten = [...seed.matchAll(/prisma\.(\w+)\./g)].map((match) => match[1]);

    expect(new Set(modelsWritten)).toEqual(new Set(["church"]));
  });

  it("the seed records why, rather than leaving it to be discovered", () => {
    expect(seed).toMatch(/churchId/);
    expect(seed).toMatch(/0\.6/);
  });
});
