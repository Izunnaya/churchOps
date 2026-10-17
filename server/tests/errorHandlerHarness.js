/*
  A throwaway HTTP server that mounts the REAL errorHandler behind a route that
  throws, so the 500 branch can be exercised under a given NODE_ENV.

  It exists because `isDevelopment` and friends are read from process.env when
  src/lib/env.ts is first imported, so the only honest way to check what each
  NODE_ENV produces is a separate process per value. Reading the ternary and
  concluding is exactly what this is here to avoid.

  Nothing is stubbed: src/middleware/errorHandler.ts is imported and mounted as
  written. The throwing route is the stimulus, not a substitute for anything.

  Started by tests/errorHandlerEnvironments.test.ts. Not a test file itself, so
  vitest's include pattern (test.ts files only) leaves it alone.

  Prints `READY <port>` on stdout once listening.
*/

require("ts-node").register({ transpileOnly: true });

const express = require("express");
const { errorHandler, notFoundHandler } = require("../src/middleware/errorHandler");

const app = express();

app.use(express.json());

/*
  Everything a real internal failure would carry: an absolute path, a line and
  column, a table name and a credential-shaped fragment. If any of it reaches
  the wire the assertions will say which.
*/
app.get("/boom", () => {
  throw new Error(
    "SECRET-INTERNAL-DETAIL: relation \"Offering\" does not exist at " +
      "C:/Users/someone/Projects/Church-ops/server/src/lib/prisma.ts:12:3 " +
      "(postgresql://user:hunter2@db.example.internal/neondb)",
  );
});

/// A thrown non-Error, which takes the String(err) path instead.
app.get("/boom-string", () => {
  throw "SECRET-INTERNAL-DETAIL as a bare string";
});

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(0, "127.0.0.1", () => {
  process.stdout.write(`READY ${server.address().port}\n`);
});
