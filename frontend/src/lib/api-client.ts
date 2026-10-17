/*
  The one place that owns the transport. Every hook in api/ goes through
  `request`; nothing else in the app calls fetch, reads the base address, or
  decides how a failure is shaped. It sits in lib/ rather than api/ because
  api/ is one file per backend resource exporting its hooks, and this is
  neither.

  The session scheme is a bearer token in the `Authorization` header, settled
  in CONVENTIONS section 6 ("Session transport", decided 2026-10-12), which
  also records what that choice costs. It is not reopened here.

  Reversing it is three lines in this file — drop the Authorization header,
  drop the token holder below, add `credentials: "include"` — and that is why
  the scheme lives in one place. No hook, page or form knows which is in use.
*/

import type { ErrorEnvelope } from "@/types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

/*
  One exported constant per resource.

  docs/BUILD-PLAN.md 3.2 writes this singular — `POST /api/offering` — while
  server/src/index.ts mounts nothing at all yet. The routers themselves are
  resource-shaped and plural, so these follow them. Michael settles the spelling
  when 3.2 lands; it changes these two lines and nothing else.
*/
export const OFFERINGS_PATH = "/api/offerings";
export const INCOME_CATEGORIES_PATH = "/api/income-categories";

/*
  Every failure, carrying enough to tell them apart. A 409 on the revision
  endpoint means "this correction collided with another one" and needs its own
  copy and its own recovery; a 500 does not. Throwing a bare Error would make
  those the same thing.

  `message` is the server's own wording from errorHandler.ts, written for the
  person reading the screen. Showing it is safe. Showing `code` is not — it is
  for branching in code, never for display.
*/
export class RequestFailed extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ErrorEnvelope["error"]["details"];

  constructor(
    status: number,
    code: string,
    message: string,
    details?: ErrorEnvelope["error"]["details"],
  ) {
    super(message);
    this.name = "RequestFailed";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/// No response at all: the device is offline, or the server could not be
/// reached. Status 0 because there was none.
export const NO_CONNECTION = "NO_CONNECTION";

export function isNoConnection(error: unknown): boolean {
  return error instanceof RequestFailed && error.code === NO_CONNECTION;
}

/*
  What to put in front of the person. The server writes its own messages for
  them, so a RequestFailed is shown as it stands. Anything else — a bug in this
  app, a parse failure — falls back to the caller's wording, because a raw error
  is never shown.
*/
export function getDisplayMessage(error: unknown, fallback: string): string {
  return error instanceof RequestFailed && error.message ? error.message : fallback;
}

/*
  Set after sign-in and cleared on sign-out. Held in memory on purpose: nothing
  protected survives a closed tab, and a browser Back after sign-out has no
  token to replay. Slice 1.4a owns where it is set from.
*/
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
};

/// What came back, with the status it came back with. The revision endpoint is
/// the reason: 201 recorded a correction, 200 replayed one already recorded,
/// and the body is identical either way.
export type Answered<T> = { data: T; status: number };

export async function requestWithStatus<T>(
  path: string,
  options: RequestOptions = {},
): Promise<Answered<T>> {
  const { method = "GET", body, query } = options;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}${toQueryString(query)}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new RequestFailed(
      0,
      NO_CONNECTION,
      "Check your connection and try again.",
    );
  }

  const payload = await readJson(response);

  if (!response.ok) {
    const failure = readErrorEnvelope(payload);
    throw new RequestFailed(
      response.status,
      failure.code ?? "UNKNOWN",
      failure.message ?? "Something went wrong. Please try again.",
      failure.details,
    );
  }

  return { data: payload as T, status: response.status };
}

/// The usual case, where only the body matters.
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const answered = await requestWithStatus<T>(path, options);
  return answered.data;
}

/*
  Only some failures carry the server's envelope. An unmounted route, a proxy
  502 or a gateway timeout answers with HTML or with nothing, so `payload` is
  `undefined` and every step down to the field has to be checked. Reaching
  through a missing `error` is what turned a 404 into a TypeError on the
  screen — the opposite of what readJson below is for.

  A field that is present but not a string is treated as absent, so nothing
  that was never written for a person can reach a toast.
*/
function readErrorEnvelope(payload: unknown): {
  code?: string;
  message?: string;
  details?: ErrorEnvelope["error"]["details"];
} {
  if (typeof payload !== "object" || payload === null) return {};

  const { error } = payload as { error?: unknown };
  if (typeof error !== "object" || error === null) return {};

  const { code, message, details } = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };

  return {
    ...(typeof code === "string" && code ? { code } : {}),
    ...(typeof message === "string" && message ? { message } : {}),
    ...(typeof details === "object" && details !== null
      ? { details: details as ErrorEnvelope["error"]["details"] }
      : {}),
  };
}

async function readJson(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;

  try {
    return await response.json();
  } catch {
    // A response that is not JSON is still a response. Keeping undefined here
    // lets the status decide, rather than turning a 503 into a parse failure.
    return undefined;
  }
}

function toQueryString(query: RequestOptions["query"]): string {
  if (!query) return "";

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) search.set(key, String(value));
  }

  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}
