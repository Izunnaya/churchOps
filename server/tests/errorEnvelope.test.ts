import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../src/app";

/*
  The failure envelope, on the wire.

  notFoundHandler and errorHandler are mounted for the first time in this
  slice, so `{ error: { code, message } }` now exists as a contract a client can
  be written against. frontend/src/lib/api-client.ts already is: it reads
  `error.code` to tell a 409 from a 500 and shows `error.message` to the person
  at the screen.

  These cases come from the rules, not from errorHandler.ts:

  - "Never surface the words tenant, JWT, API, transaction or RBAC — or a raw
    error — to a user." (CLAUDE.md)
  - A record from another church is indistinguishable from one that does not
    exist, so a 404 must never hint at what else is there.
  - Every failure is JSON, because the client parses every response as JSON and
    an HTML page during an incident is unreadable to it.
  - Bad input is the caller's 400. A 500 means the server broke.

  No database and no port. The app is exercised directly through supertest.
*/

/// Set by vitest.config.mts for every run in this package.
const RUNNING_AS = process.env.NODE_ENV;

const ENVELOPE_KEYS = ["code", "message"];

/// Anything that would tell a caller how the server is built or where it lives.
const INTERNALS = [
  "node_modules",
  "src/",
  "src\\",
  ".ts:",
  "at Object.",
  "at Module.",
  "Error:",
  "SELECT",
  "INSERT",
  "prisma",
  "Prisma",
  "postgres",
  "churchId",
  "passwordHash",
  "DATABASE_URL",
  "JWT_SECRET",
];

/// Words the product is never allowed to put in front of a user.
const FORBIDDEN_VOCABULARY = ["tenant", "JWT", "RBAC", "transaction"];

const assertSafeEnvelope = (body: unknown, raw: string) => {
  expect(body).toHaveProperty("error");
  const envelope = (body as { error: Record<string, unknown> }).error;

  for (const key of ENVELOPE_KEYS) expect(envelope).toHaveProperty(key);
  expect(typeof envelope.code).toBe("string");
  expect(typeof envelope.message).toBe("string");

  for (const internal of INTERNALS) {
    expect(raw).not.toContain(internal);
  }
  for (const word of FORBIDDEN_VOCABULARY) {
    expect(String(envelope.message)).not.toContain(word);
  }
  // A stack trace has line/column pairs in it. None may reach the wire.
  expect(raw).not.toMatch(/:\d+:\d+/);
};

describe("the environment a server test runs in", () => {
  it("is NODE_ENV=test, so isProduction is false for every case below", () => {
    expect(RUNNING_AS).toBe("test");
  });
});

describe("an unmatched route", () => {
  it("answers 404 in the envelope, as JSON", async () => {
    const response = await request(app).get("/definitely-not-a-route");

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body.error.code).toBe("NOT_FOUND");
    assertSafeEnvelope(response.body, response.text);
  });

  it("answers identically for a route that exists only as an unmounted router", async () => {
    // /api/offerings has a written router that is deliberately not mounted. A
    // caller must not be able to tell the difference between "written but not
    // mounted" and "never existed" — that difference is a map of the backlog.
    const unmounted = await request(app).get("/api/offerings");
    const nonsense = await request(app).get("/api/q7x2k9");

    expect(unmounted.status).toBe(nonsense.status);
    expect(unmounted.headers["content-type"]).toBe(nonsense.headers["content-type"]);
    // Byte-identical, not merely the same code.
    expect(unmounted.text).toBe(nonsense.text);
    expect(unmounted.headers["content-length"]).toBe(nonsense.headers["content-length"]);
  });

  it("answers the same for a child path of an unmounted router", async () => {
    const detail = await request(app).get("/api/offerings/some-id");
    const nonsense = await request(app).get("/api/q7x2k9/some-id");

    expect(detail.status).toBe(nonsense.status);
    expect(detail.body.error.code).toBe(nonsense.body.error.code);
  });

  it("gives up nothing about what does exist", async () => {
    const response = await request(app).get("/api/offerings");

    expect(response.text).not.toContain("health");
    expect(response.text).not.toContain("auth");
    assertSafeEnvelope(response.body, response.text);
  });
});

describe("a method the route does not have", () => {
  // /health is declared GET-only. Express falls through to notFoundHandler, so
  // the answer is a 404 rather than a 405. That is the right answer for this
  // product: a 405 would confirm the path exists.
  it.each(["post", "put", "patch", "delete"] as const)(
    "%s /health answers in the envelope and confirms nothing",
    async (method) => {
      const response = await request(app)[method]("/health");

      expect(response.headers["content-type"]).toMatch(/application\/json/);
      assertSafeEnvelope(response.body, response.text);

      const nonsense = await request(app)[method]("/q7x2k9");
      expect(response.status).toBe(nonsense.status);
      expect(response.body.error.code).toBe(nonsense.body.error.code);
    },
  );
});

describe("a malformed JSON body", () => {
  /*
    The requirement: invalid input is 400, and nothing about the server's
    internals reaches the caller.

    What actually happens: express.json() throws a SyntaxError carrying
    `status: 400` and `type: "entity.parse.failed"`; errorHandler does not look
    at either, so the response is a 500 reading "Something went wrong on our
    end" — the server taking the blame for the caller's typo — with the raw
    parser message attached under `debug`.
  */
  const malformed = '{"name":"Tithe",,}';

  it("is still JSON in the envelope", async () => {
    const response = await request(app)
      .post("/api/offerings")
      .set("Content-Type", "application/json")
      .send(malformed);

    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toHaveProperty("error.code");
    expect(response.body).toHaveProperty("error.message");
  });

  it("answers 400 with a client-error code: the caller's mistake, not ours", async () => {
    const response = await request(app)
      .post("/api/offerings")
      .set("Content-Type", "application/json")
      .send(malformed);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("BAD_REQUEST");
    expect(response.body.error.code).not.toBe("INTERNAL_ERROR");
  });

  it("tells the caller to check what they sent, rather than blaming the server", async () => {
    const response = await request(app)
      .post("/api/offerings")
      .set("Content-Type", "application/json")
      .send(malformed);

    // "Something went wrong on our end. Please try again." invites a retry that
    // will fail the same way, and tells the person it was not their doing.
    expect(response.body.error.message).not.toContain("our end");
    expect(response.body.error.message.toLowerCase()).toContain("check what you sent");
  });

  it("carries no `debug`, and no parser wording at all", async () => {
    const response = await request(app)
      .post("/api/offerings")
      .set("Content-Type", "application/json")
      .send(malformed);

    // CLAUDE.md: never surface a raw error to a user. The parser's own
    // sentence, with its character offset, is one.
    expect(response.body.error).not.toHaveProperty("debug");
    expect(response.text).not.toMatch(/JSON at position/);
    expect(response.text).not.toContain("SyntaxError");
    expect(response.text).not.toContain("double-quoted");
  });

  it("carries only code and message, with nothing extra alongside them", async () => {
    const response = await request(app)
      .post("/api/offerings")
      .set("Content-Type", "application/json")
      .send(malformed);

    expect(Object.keys(response.body)).toEqual(["error"]);
    expect(Object.keys(response.body.error).sort()).toEqual(["code", "message"]);
  });

  it("does not echo the body it failed to parse", async () => {
    // Whatever the treasurer was sending, it must not come back out in an
    // error. A request body is the one place real figures live.
    const response = await request(app)
      .post("/api/offerings")
      .set("Content-Type", "application/json")
      .send('{"transferAmount":"4350000","note":"SENSITIVE-MARKER",,}');

    expect(response.text).not.toContain("SENSITIVE-MARKER");
    expect(response.text).not.toContain("4350000");
  });

  it("leaks no file path, stack frame or SQL in any case", async () => {
    const response = await request(app)
      .post("/api/offerings")
      .set("Content-Type", "application/json")
      .send(malformed);

    for (const internal of INTERNALS) {
      expect(response.text).not.toContain(internal);
    }
  });
});

describe("a body that is not JSON at all", () => {
  it("text/plain on an unmatched route still answers in the envelope", async () => {
    const response = await request(app)
      .post("/api/offerings")
      .set("Content-Type", "text/plain")
      .send("not json");

    expect(response.headers["content-type"]).toMatch(/application\/json/);
    assertSafeEnvelope(response.body, response.text);
  });

  it("an empty body on an unmatched route answers in the envelope", async () => {
    const response = await request(app).post("/api/offerings");

    expect(response.headers["content-type"]).toMatch(/application\/json/);
    assertSafeEnvelope(response.body, response.text);
  });
});

describe("what the 404 message carries", () => {
  it("reflects nothing of the request back to the caller", async () => {
    /*
      The message is a constant now. It used to be `No route for ${method}
      ${path}`, so a link could choose the sentence that appeared inside the
      app's error panel, and an internal route name reached someone with no use
      for one.
    */
    const probes = [
      "/%3Cscript%3Ealert(1)%3C/script%3E",
      "/api/offerings/UNIQUE-REFLECTION-MARKER",
      "/..%2f..%2fetc%2fpasswd",
    ];

    for (const path of probes) {
      const response = await request(app).get(path);

      expect(response.body.error.message).toBe(
        "We could not find what you were looking for.",
      );
      expect(response.text).not.toContain("script");
      expect(response.text).not.toContain("UNIQUE-REFLECTION-MARKER");
      expect(response.text).not.toContain("passwd");
      expect(response.text).not.toContain("offerings");
    }
  });

  it("is byte-identical for every unmatched path and method", async () => {
    // The isolation rule at the routing layer: a caller must not be able to
    // tell one absent thing from another by the shape of the refusal.
    const bodies = new Set<string>();

    for (const path of ["/api/offerings", "/api/offerings/abc", "/api/q7x2k9", "/nope"]) {
      bodies.add((await request(app).get(path)).text);
      bodies.add((await request(app).post(path)).text);
      bodies.add((await request(app).delete(path)).text);
    }

    expect(bodies.size).toBe(1);
  });

  it("stays a fixed-shape envelope however odd the path", async () => {
    for (const path of ["/..%2f..%2fetc%2fpasswd", "/%00", "/a".repeat(200)]) {
      const response = await request(app).get(path);
      expect(response.headers["content-type"]).toMatch(/application\/json/);
      expect(response.body.error.code).toBe("NOT_FOUND");
    }
  });
});

describe("no offering endpoint is reachable", () => {
  /*
    Asserted rather than assumed. The frontend's hooks are written against these
    paths and none of them works; anything claiming otherwise is claiming
    something that is not built.
  */
  const offeringPaths: [string, "get" | "post" | "patch" | "delete"][] = [
    ["/api/offerings", "get"],
    ["/api/offerings", "post"],
    ["/api/offerings/abc", "get"],
    ["/api/offerings/abc/finalize", "post"],
    ["/api/offerings/abc/approve", "post"],
    ["/api/offerings/abc/revisions", "post"],
    ["/api/offerings/abc/categories", "post"],
    ["/api/offerings/abc/categories/def", "patch"],
    ["/api/offerings/abc/categories/def", "delete"],
    ["/api/income-categories", "get"],
    ["/api/auth/sign-in", "post"],
  ];

  it.each(offeringPaths)("%s (%s) answers 404 NOT_FOUND", async (path, method) => {
    const response = await request(app)[method](path);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
});

describe("the other client errors express.json raises", () => {
  it("an oversized body answers 413, not 500", async () => {
    // express.json()'s default limit is 100kb, and it throws with status 413.
    const tooLarge = JSON.stringify({ notes: "x".repeat(200_000) });

    const response = await request(app)
      .post("/api/offerings")
      .set("Content-Type", "application/json")
      .send(tooLarge);

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("REQUEST_TOO_LARGE");
    expect(response.body.error).not.toHaveProperty("debug");
    // The body it refused must not come back out.
    expect(response.text).not.toContain("xxxx");
  });

  it("an unsupported charset answers 415, not 500", async () => {
    // Has to be a charset iconv-lite genuinely does not know. utf-7 and
    // iso-8859-* are decoded without complaint; a made-up name is not.
    const response = await request(app)
      .post("/api/offerings")
      .set("Content-Type", "application/json; charset=not-a-charset")
      .send("{}");

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe("UNSUPPORTED_FORMAT");
    expect(response.body.error).not.toHaveProperty("debug");
    expect(response.text).not.toContain("not-a-charset");
  });

  it("an unsupported content-encoding answers 415, not 500", async () => {
    const response = await request(app)
      .post("/api/offerings")
      .set("Content-Type", "application/json")
      .set("Content-Encoding", "bogus")
      .send("{}");

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe("UNSUPPORTED_FORMAT");
    expect(response.text).not.toContain("bogus");
  });

  it("a body that decodes to nothing readable answers 400", async () => {
    const response = await request(app)
      .post("/api/offerings")
      .set("Content-Type", "application/json; charset=utf-32")
      .send("{}");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("BAD_REQUEST");
  });

  it("no client error ever carries a 500 code or a debug key", async () => {
    const cases: [string, string][] = [
      ["application/json", '{"a":,}'],
      ["application/json; charset=not-a-charset", "{}"],
    ];

    for (const [contentType, body] of cases) {
      const response = await request(app)
        .post("/api/offerings")
        .set("Content-Type", contentType)
        .send(body);

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(response.body.error.code).not.toBe("INTERNAL_ERROR");
      expect(response.body.error).not.toHaveProperty("debug");
    }
  });
});
