import app from "./app";
import { env, isDevelopment } from "./lib/env";
import prisma from "./lib/prisma";

/*
  Starts the server, and refuses to start without the database.

  The connection is checked before the port is bound, deliberately. A server
  that accepts requests and then fails every one of them on its first query is
  harder to diagnose than one that never came up: the treasurer sees errors
  that look like her own doing, and the logs blame whichever endpoint she
  happened to open first.
*/
async function start(): Promise<void> {
  try {
    await prisma.$connect();
  } catch (connectionError) {
    console.error(
      "Could not reach the database. Check DATABASE_URL in server/.env — " +
        "if this project's own local Postgres is not running, start it with " +
        "`npx prisma dev`.",
    );
    /// The Prisma error itself names the host and the connecting user in its
    /// P1001/P1000 text, and startup logs get pasted into issues. Outside
    /// development the code is enough to look the failure up.
    if (isDevelopment) {
      console.error(connectionError);
    } else {
      /// Prisma puts the P-code on `errorCode` when the client cannot start up
      /// and on `code` for a request that failed, so both are read.
      const details = connectionError as { errorCode?: unknown; code?: unknown } | null;
      const code =
        typeof details?.errorCode === "string"
          ? details.errorCode
          : typeof details?.code === "string"
            ? details.code
            : "no error code";
      console.error(`Database connection failed (${code}).`);
    }
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    console.log(`Listening on http://localhost:${env.port}`);
  });

  /// Nodemon restarts by signalling the process. Closing the pool on the way
  /// out stops a restart loop leaving connections behind until Postgres
  /// refuses new ones.
  const shutDown = async () => {
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutDown());
  process.on("SIGTERM", () => void shutDown());
}

void start();
