/*
  Can anything get out of the transport as something other than a RequestFailed?

  --- what this is, and what it is not --------------------------------------

  This is NOT a mock of the church API and it asserts nothing about any
  endpoint. No endpoint exists: no router is mounted. `fetch` is not stubbed,
  `Response` is not faked, and no module of src/ is replaced.

  What it does is stand up a real node:http origin that answers with exact
  bytes, and point the real `request` from src/lib/api-client.ts at it through
  the one knob the client documents, VITE_API_BASE_URL. Every round trip below
  is a real HTTP request through the real global fetch. The origin exists to
  produce the bodies a proxy, a gateway, an unmounted route or a half-written
  response actually produce in the wild, which a correct server never will.

  The requirement, from CLAUDE.md: "Never surface the words tenant, JWT, API,
  transaction or RBAC - or a raw error - to a user." A TypeError thrown while
  reaching into a body that has no `error` object is a raw error reaching the
  screen, and it is how the earlier defect showed up. So the contract asserted
  here is absolute: for every failing response, whatever the bytes,
  `request` rejects with a RequestFailed carrying the real status, a non-empty
  string code and a non-empty string message fit to show someone.
*/

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

type CannedReply = { status: number; contentType?: string; body?: string };

/// The reply the next request will get. Set per test.
let nextReply: CannedReply = { status: 200, body: "{}" };
let origin = "";
let server: Server;

beforeAll(async () => {
  server = createServer((_request, response) => {
    const { status, contentType, body } = nextReply;
    if (contentType) response.setHeader("Content-Type", contentType);
    response.statusCode = status;
    if (body === undefined) {
      response.end();
      return;
    }
    response.end(body);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

/*
  A fresh copy of the real client, reading its base address the way it does in
  the browser. resetModules is what makes BASE_URL re-evaluate; without it the
  module constant from an earlier import would stick.
*/
async function clientPointedAtOrigin() {
  vi.stubEnv("VITE_API_BASE_URL", origin);
  return import("../src/lib/api-client");
}

async function failureFrom(reply: CannedReply) {
  nextReply = reply;
  const { request } = await clientPointedAtOrigin();
  return request("/whatever").then(
    (value) => ({ threw: false as const, value }),
    (error: unknown) => ({ threw: true as const, error }),
  );
}

/*
  Every failure, however malformed the body, has to satisfy all of this. A test
  below that only checked `instanceof RequestFailed` would miss a code of
  `undefined` reaching a `switch`, or an empty message reaching a toast.
*/
async function expectShowableFailure(reply: CannedReply) {
  const outcome = await failureFrom(reply);
  const { RequestFailed, getDisplayMessage } = await clientPointedAtOrigin();

  expect(outcome.threw).toBe(true);
  if (!outcome.threw) throw new Error("unreachable");

  const failure = outcome.error;
  expect(failure).toBeInstanceOf(RequestFailed);
  expect(failure).not.toBeInstanceOf(TypeError);
  expect(failure).not.toBeInstanceOf(SyntaxError);

  const requestFailed = failure as InstanceType<typeof RequestFailed>;
  expect(requestFailed.name).toBe("RequestFailed");
  expect(requestFailed.status).toBe(reply.status);

  expect(typeof requestFailed.code).toBe("string");
  expect(requestFailed.code.length).toBeGreaterThan(0);

  expect(typeof requestFailed.message).toBe("string");
  expect(requestFailed.message.length).toBeGreaterThan(0);

  // Nothing written for a machine, and no markup, reaches the person.
  const shown = getDisplayMessage(failure, "Something went wrong. Please try again.");
  expect(typeof shown).toBe("string");
  expect(shown).not.toContain("<");
  expect(shown).not.toContain("[object");
  expect(shown).not.toContain("undefined");

  return requestFailed;
}

/*
  Bodies a correct server never sends. Each one is a shape that a naive
  `payload.error.code` would walk off the end of.
*/
const malformedBodies: CannedReply[] = [
  // The one that found the defect: an unmounted route, so Express answers HTML.
  { status: 404, contentType: "text/html", body: "<!DOCTYPE html><html><body>Cannot GET /x</body></html>" },
  // A gateway that answered with nothing at all.
  { status: 502, contentType: "text/plain", body: "" },
  { status: 504, body: undefined },
  // Valid JSON, but not an object.
  { status: 500, contentType: "application/json", body: "null" },
  { status: 500, contentType: "application/json", body: '"a bare string"' },
  { status: 500, contentType: "application/json", body: "42" },
  { status: 500, contentType: "application/json", body: "true" },
  { status: 500, contentType: "application/json", body: "[1,2,3]" },
  // An object, but `error` is not an object.
  { status: 409, contentType: "application/json", body: '{"error":null}' },
  { status: 409, contentType: "application/json", body: '{"error":["boom"]}' },
  { status: 409, contentType: "application/json", body: '{"error":"boom"}' },
  { status: 409, contentType: "application/json", body: '{"error":7}' },
  { status: 409, contentType: "application/json", body: '{"error":true}' },
  // An object with an `error` object, but nothing usable inside it.
  { status: 422, contentType: "application/json", body: '{"error":{}}' },
  { status: 422, contentType: "application/json", body: '{"error":{"code":"","message":""}}' },
  { status: 422, contentType: "application/json", body: '{"error":{"code":1,"message":{"a":1}}}' },
  { status: 422, contentType: "application/json", body: '{"error":{"code":null,"message":null}}' },
  { status: 422, contentType: "application/json", body: '{"error":{"code":["A"],"message":["B"]}}' },
  // An object with no `error` key at all: the success envelope on a failure status.
  { status: 422, contentType: "application/json", body: '{"data":{"id":"x"}}' },
  { status: 403, contentType: "application/json", body: "{}" },
  // Truncated mid-write: the content type promises JSON and the bytes are not.
  { status: 500, contentType: "application/json", body: '{"error":{"code":' },
  // Markup where a whole body should be. Note this is NOT the same case as an
  // envelope whose `message` field contains markup: see the test at the bottom
  // of this file for that one, which has a different and deliberate answer.
  { status: 500, contentType: "text/html", body: "<script>alert(1)</script>" },
];

describe("a malformed failure body still arrives as something a screen can show", () => {
  for (const reply of malformedBodies) {
    const described = reply.body === undefined ? "<no body>" : JSON.stringify(reply.body);
    it(`${reply.status} with ${reply.contentType ?? "no content type"} and ${described}`, async () => {
      await expectShowableFailure(reply);
    });
  }
});

describe("the fallbacks each malformed body falls back to", () => {
  it("uses UNKNOWN and the generic sentence when the envelope is unusable", async () => {
    const failure = await expectShowableFailure({
      status: 409,
      contentType: "application/json",
      body: '{"error":["boom"]}',
    });

    expect(failure.code).toBe("UNKNOWN");
    expect(failure.message).toBe("Something went wrong. Please try again.");
    expect(failure.details).toBeUndefined();
  });

  it("treats an empty-string code and message as absent rather than passing them on", async () => {
    const failure = await expectShowableFailure({
      status: 422,
      contentType: "application/json",
      body: '{"error":{"code":"","message":""}}',
    });

    expect(failure.code).toBe("UNKNOWN");
    expect(failure.message).toBe("Something went wrong. Please try again.");
  });

  it("drops a code that is not a string, so nothing written for a machine is branched on", async () => {
    const failure = await expectShowableFailure({
      status: 422,
      contentType: "application/json",
      body: '{"error":{"code":1,"message":{"a":1}}}',
    });

    expect(failure.code).toBe("UNKNOWN");
    expect(failure.message).toBe("Something went wrong. Please try again.");
  });

  it("drops details that are not an object", async () => {
    const failure = await expectShowableFailure({
      status: 400,
      contentType: "application/json",
      body: '{"error":{"code":"VALIDATION","message":"Check the figures.","details":"nope"}}',
    });

    expect(failure.code).toBe("VALIDATION");
    expect(failure.details).toBeUndefined();
  });

  it("keeps a message even when the code is missing, and vice versa", async () => {
    const messageOnly = await expectShowableFailure({
      status: 409,
      contentType: "application/json",
      body: '{"error":{"message":"That correction collided with another one."}}',
    });
    expect(messageOnly.code).toBe("UNKNOWN");
    expect(messageOnly.message).toBe("That correction collided with another one.");

    const codeOnly = await expectShowableFailure({
      status: 409,
      contentType: "application/json",
      body: '{"error":{"code":"REVISION_CONFLICT"}}',
    });
    expect(codeOnly.code).toBe("REVISION_CONFLICT");
    expect(codeOnly.message).toBe("Something went wrong. Please try again.");
  });
});

describe("the well-formed envelope is still carried through intact", () => {
  it("keeps the status, the code and the server's own wording", async () => {
    const failure = await expectShowableFailure({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "REVISION_CONFLICT",
          message: "That correction collided with another one. Check the figure and try again.",
        },
      }),
    });

    expect(failure.status).toBe(409);
    expect(failure.code).toBe("REVISION_CONFLICT");
    expect(failure.message).toBe(
      "That correction collided with another one. Check the figure and try again.",
    );
  });

  it("keeps per-field validation details, which the form needs", async () => {
    const failure = await expectShowableFailure({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "VALIDATION_FAILED",
          message: "Check the highlighted fields.",
          details: { fields: { name: "Give the category a name" } },
        },
      }),
    });

    expect(failure.details).toEqual({ fields: { name: "Give the category a name" } });
  });

  it("keeps a 409 distinguishable from a 500, which is the reason RequestFailed exists", async () => {
    const conflict = await expectShowableFailure({
      status: 409,
      contentType: "application/json",
      body: '{"error":{"code":"REVISION_CONFLICT","message":"Already corrected."}}',
    });
    const serverError = await expectShowableFailure({
      status: 500,
      contentType: "application/json",
      body: '{"error":{"code":"INTERNAL","message":"Something went wrong."}}',
    });

    expect(conflict.status).not.toBe(serverError.status);
    expect(conflict.code).not.toBe(serverError.code);
  });
});

describe("successful responses that are not the shape the caller expected", () => {
  it("returns undefined for a 204 and does not throw", async () => {
    nextReply = { status: 204, body: undefined };
    const { requestWithStatus } = await clientPointedAtOrigin();

    const answered = await requestWithStatus<undefined>("/whatever", { method: "DELETE" });
    expect(answered.status).toBe(204);
    expect(answered.data).toBeUndefined();
  });

  it("does not turn a 200 with a non-JSON body into a thrown parse failure", async () => {
    nextReply = { status: 200, contentType: "text/html", body: "<html></html>" };
    const { requestWithStatus } = await clientPointedAtOrigin();

    const answered = await requestWithStatus<unknown>("/whatever");
    expect(answered.status).toBe(200);
    expect(answered.data).toBeUndefined();
  });

  it("reports the status a 201 came back with, which the revision endpoint turns on", async () => {
    nextReply = { status: 201, contentType: "application/json", body: '{"created":true}' };
    const { requestWithStatus } = await clientPointedAtOrigin();

    const answered = await requestWithStatus<{ created: boolean }>("/whatever", {
      method: "POST",
      body: { reason: "miscount" },
    });
    expect(answered.status).toBe(201);
    expect(answered.data).toEqual({ created: true });
  });
});

describe("a server message that itself contains markup", () => {
  /*
    Deliberately NOT in the malformed list above, and deliberately not stripped.

    The client's own contract is that `message` is the server's wording, written
    for the person reading the screen, and is shown as it stands. The transport
    is the wrong place to edit it: escaping belongs to the renderer, and React
    escapes text children, so markup in a message renders as the characters a
    person sees rather than as markup a browser runs.

    What is asserted is therefore pass-through, not sanitising. If this ever
    starts failing it means the transport began rewriting server copy, which
    would silently change what a treasurer is told.

    The finding this leaves open is a SERVER one, not a client one: nothing
    stops errorHandler.ts putting markup, or a raw error, into `message`. That
    is reported, not patched here.
  */
  it("passes the server's wording through unchanged rather than editing it", async () => {
    nextReply = {
      status: 500,
      contentType: "application/json",
      body: '{"error":{"code":"INTERNAL","message":"<script>alert(1)</script>"}}',
    };
    const { request, RequestFailed, getDisplayMessage } = await clientPointedAtOrigin();

    const failure = await request("/whatever").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RequestFailed);
    expect((failure as InstanceType<typeof RequestFailed>).status).toBe(500);
    expect(getDisplayMessage(failure, "fallback")).toBe("<script>alert(1)</script>");
  });
});

describe("no response at all", () => {
  it("reports an address nothing is listening on as no connection, with status 0", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://127.0.0.1:1");
    const { request, RequestFailed, isNoConnection, getDisplayMessage, NO_CONNECTION } =
      await import("../src/lib/api-client");

    const failure = await request("/whatever").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RequestFailed);
    expect(isNoConnection(failure)).toBe(true);
    expect((failure as InstanceType<typeof RequestFailed>).code).toBe(NO_CONNECTION);
    expect((failure as InstanceType<typeof RequestFailed>).status).toBe(0);
    expect(getDisplayMessage(failure, "unused fallback")).toBe(
      "Check your connection and try again.",
    );
  });
});
