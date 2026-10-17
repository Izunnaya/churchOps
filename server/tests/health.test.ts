import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../src/app";

/*
  The first server test. It proves the harness itself works — that the app can
  be exercised without binding a port, and that a failure comes back in the
  shape the client was written to expect.

  It touches no database on purpose. /health is a liveness check and the app
  mounts no router that queries anything yet, so this suite stays green on a
  machine with no Postgres. The database-backed suites arrive with the slice
  that mounts a router, and those need .env.test pointing at a database they
  may truncate.
*/
describe("GET /health", () => {
  it("answers 200 with a plain ok", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("does not require the database", async () => {
    // Guards the comment above app.get("/health"). If someone later adds a
    // query to the liveness check, this fails on any machine without Postgres
    // rather than at three in the morning when the database is the thing that
    // is down.
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
  });
});

describe("an unmatched route", () => {
  it("returns the error envelope, not Express's HTML page", async () => {
    const response = await request(app).get("/api/nothing-here");

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(typeof response.body.error.message).toBe("string");
  });

  it("says nothing about what does exist", async () => {
    // A 404 that distinguishes "no such route" from "route exists, wrong
    // method" hands an attacker a map. Both answers must read the same.
    const unknownRoute = await request(app).get("/api/offerings");
    const randomRoute = await request(app).get("/api/x9f2k");

    expect(unknownRoute.status).toBe(randomRoute.status);
    expect(unknownRoute.body.error.code).toBe(randomRoute.body.error.code);
  });
});
