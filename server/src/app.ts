import cors from "cors";
import express from "express";
import { env } from "./lib/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

/*
  The Express application, with no server attached.

  It is separate from index.ts so a test can exercise it through supertest
  without binding a port — two suites binding 4000 at once is a flake nobody
  enjoys diagnosing, and a test that needs a free port is a test that fails for
  reasons unrelated to the code.

  No feature router is mounted yet. The written auth, offering and
  income-category routers all sit behind scopeToChurch, which resolves the
  caller's church from the session, and the account models have no church
  column yet — so mounting them would publish endpoints that refuse every
  request. They go up with the slice that gives a session its church.
*/
export const app = express();

/*
  An explicit allow-list, set before the first router rather than after it.
  The default `cors()` answers every origin with `*`, which pairs badly with a
  session carried in an Authorization header: any page on the internet could
  read a church's figures with a token it had got hold of. CORS_ORIGIN holds
  the deployed frontend; local work falls back to the Vite dev server.
*/
app.use(cors({ origin: env.corsOrigins }));
app.use(express.json());

/// Liveness only. It deliberately does not touch the database: that is what
/// the startup connection check in index.ts is for, and a liveness probe that
/// fails when Postgres is down is answering a different question.
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

/*
  Last, and in this order. notFoundHandler turns an unmatched route into the
  same `{ error: { code, message } }` envelope every other failure uses, rather
  than Express's default HTML page — which is what a client would otherwise
  have to parse during an incident.
*/
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
