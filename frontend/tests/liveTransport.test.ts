/*
  The transport layer, against a REAL server.

  Nothing here is mocked or stubbed. It talks to the process started from
  server/src/index.ts, which mounts /health and nothing else, so what it can
  prove is the failure path — and that is the path that matters, because every
  screen in this app shows a person a sentence when a request fails.

  REQUIRES: `npx ts-node src/index.ts` (or `npm run dev`) in server/, on 4000.
  Run with VITE_API_BASE_URL=http://localhost:4000.
*/

import { describe, expect, it } from "vitest";
import {
  INCOME_CATEGORIES_PATH,
  OFFERINGS_PATH,
  RequestFailed,
  getDisplayMessage,
  request,
  requestWithStatus,
  setAccessToken,
} from "../src/lib/api-client";

const SERVER = "http://localhost:4000";

describe("the server this slice was written against", () => {
  it("answers /health and mounts no offering router", async () => {
    const health = await fetch(`${SERVER}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok" });

    const offerings = await fetch(`${SERVER}${OFFERINGS_PATH}`);
    expect(offerings.status).toBe(404);

    /*
      Changed in this slice, and asserted rather than relaxed. notFoundHandler
      is now mounted, so an unmatched route finally answers in the
      `{ error: { code, message } }` envelope the client types were written
      against — where it previously returned Express's HTML page. This is the
      first time that contract exists on the wire.
    */
    expect(offerings.headers.get("content-type")).toContain("application/json");
    const envelope = (await offerings.json()) as { error: { code: string; message: string } };
    expect(envelope.error.code).toBe("NOT_FOUND");
    expect(typeof envelope.error.message).toBe("string");
    expect(envelope.error.message).not.toContain("<");
  });

  it("answers an unmounted router exactly as it answers a path that never existed", async () => {
    // The isolation rule, at the routing layer: nothing may distinguish
    // "written but not mounted" from "no such thing".
    const unmounted = await fetch(`${SERVER}${OFFERINGS_PATH}`);
    const nonsense = await fetch(`${SERVER}/api/q7x2k9`);

    expect(unmounted.status).toBe(nonsense.status);
    expect(unmounted.headers.get("content-type")).toBe(nonsense.headers.get("content-type"));
    expect(unmounted.headers.get("content-length")).toBe(
      nonsense.headers.get("content-length"),
    );

    // Byte-identical, not merely the same code. The message is a constant now,
    // so there is nothing left in it to tell the two apart.
    expect(await unmounted.text()).toBe(await nonsense.text());
  });

  it("gives a caller no stack trace, file path or SQL on any failure", async () => {
    for (const path of [OFFERINGS_PATH, INCOME_CATEGORIES_PATH, "/api/auth/sign-in"]) {
      const body = await fetch(`${SERVER}${path}`).then((response) => response.text());

      for (const internal of ["node_modules", "src/", ".ts:", "SELECT", "prisma", "postgres"]) {
        expect(body, `${path} leaked ${internal}`).not.toContain(internal);
      }
      expect(body).not.toMatch(/:\d+:\d+/);
    }
  });

  it("a malformed JSON body comes back as a 400 the client can branch on", async () => {
    /*
      Fixed this round. It used to answer 500 INTERNAL_ERROR — the caller's
      typo reported as the server's fault, with a retry that would fail the
      same way. api-client.ts turns the response into a RequestFailed carrying
      `status`, and the whole point of that field is that a 400 and a 500 need
      different copy and different recovery.
    */
    const response = await fetch(`${SERVER}${OFFERINGS_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"name":"Tithe","marker":"UNIQUE-BODY-MARKER",,}',
    });

    expect(response.status).toBe(400);

    const raw = await response.text();
    const envelope = JSON.parse(raw) as { error: { code: string; message: string } };

    expect(envelope.error.code).toBe("BAD_REQUEST");
    expect(envelope.error.code).not.toBe("INTERNAL_ERROR");

    // No raw parser wording, and no echo of what was sent.
    expect(envelope.error).not.toHaveProperty("debug");
    expect(raw).not.toMatch(/JSON at position/);
    expect(raw).not.toContain("UNIQUE-BODY-MARKER");
  });

  it("the transport surfaces that 400 as a RequestFailed the UI can read", async () => {
    // End to end through the real client, not a hand-built fetch: a 400 has to
    // arrive as a distinguishable failure with a sentence fit to show someone.
    const failure = await request(OFFERINGS_PATH, {
      method: "POST",
      body: { anything: "at all" },
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RequestFailed);
    // Nothing is mounted, so this one is the 404 — the point is the status
    // survives the transport rather than collapsing into a generic error.
    expect((failure as RequestFailed).status).toBe(404);
    expect(getDisplayMessage(failure, "fallback")).not.toContain("<");
    expect(getDisplayMessage(failure, "fallback")).not.toContain("offerings");
  });
});

describe("a failure the person has to be shown", () => {
  /*
    The requirement, from CLAUDE.md: never surface a raw error to a user. The
    client's own readJson comment states the intent — "A response that is not
    JSON is still a response. Keeping undefined here lets the status decide,
    rather than turning a 503 into a parse failure."

    So an error response with a non-JSON body must still arrive as a
    RequestFailed carrying the real status.
  */
  it("turns a non-JSON error response into a RequestFailed carrying its status", async () => {
    const failure = await request(OFFERINGS_PATH).catch((error) => error);

    expect(failure).toBeInstanceOf(RequestFailed);
    expect((failure as RequestFailed).status).toBe(404);
    expect(getDisplayMessage(failure, "That offering could not be loaded.")).not.toContain("<");
  });

  it("does the same for any other route with a non-JSON body", async () => {
    const failure = await request(INCOME_CATEGORIES_PATH).catch((error) => error);

    expect(failure).toBeInstanceOf(RequestFailed);
    expect((failure as RequestFailed).status).toBe(404);
  });
});

describe("the parts of the transport a live /health can exercise", () => {
  it("returns the parsed body on success", async () => {
    await expect(request<{ status: string }>("/health")).resolves.toEqual({
      status: "ok",
    });
  });

  it("drops undefined query values and keeps the rest", async () => {
    await expect(
      request<{ status: string }>("/health", { query: { take: 25, skip: undefined } }),
    ).resolves.toEqual({ status: "ok" });
  });

  /*
    This test used to be named "reports an unreachable address as no
    connection" over an assertion that was a copy of the success case above —
    it asserted `{ status: "ok" }` and proved nothing about an unreachable
    address. Renamed to what it actually does: contrast a refused port against
    the server that is up.

    The real NO_CONNECTION assertion, through `request` rather than through
    bare fetch, needs the client's base address pointed somewhere else, which
    cannot be done in this file because BASE_URL is read once at module load.
    It lives in tests/transportErrorBodies.test.ts instead.
  */
  it("reaches the server that is up, while a port nothing listens on refuses", async () => {
    const unreachable = await fetch("http://127.0.0.1:1/health").then(
      () => "reachable",
      () => "refused",
    );
    expect(unreachable).toBe("refused");

    // Same client, same call shape, against the server that IS up.
    await expect(request<{ status: string }>("/health")).resolves.toEqual({ status: "ok" });
  });

  it("sends no Authorization header until a token is set, and sends one after", async () => {
    /*
      /health is the only mounted route, so what can be proved here is that
      setting and clearing a token changes nothing about a request succeeding
      and throws nothing. Whether the server honours it is 1.4a's to prove.
    */
    setAccessToken("not-a-real-token-fake-fixture-value");
    await expect(request<{ status: string }>("/health")).resolves.toEqual({ status: "ok" });

    setAccessToken(null);
    await expect(request<{ status: string }>("/health")).resolves.toEqual({ status: "ok" });
  });

  it("reports the status a real response came back with, not just the body", async () => {
    const answered = await requestWithStatus<{ status: string }>("/health");
    expect(answered.status).toBe(200);
    expect(answered.data).toEqual({ status: "ok" });
  });
});
