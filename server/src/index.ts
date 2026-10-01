import cors from "cors";
import express from "express";
import { env } from "./lib/env";

const app = express();

app.use(cors());
app.use(express.json());

/// Liveness only. It deliberately does not touch the database: 0.2 adds that,
/// and a health check that fails when Postgres is down is a different check.
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(env.port, () => {
  console.log(`Listening on http://localhost:${env.port}`);
});
