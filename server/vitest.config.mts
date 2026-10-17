import { defineConfig } from "vitest/config";

/*
  Server tests run in Node, against the real Express app through supertest.

  NODE_ENV=test below makes src/lib/env.ts load `.env.test` and nothing else.
  Anything that writes rows must run against a database it is allowed to
  truncate, and the one with your own work in it is not that. A missing
  .env.test throws on import with instructions, rather than falling back to
  .env — the fallback is what would let a suite empty the development
  database, and it would do it quietly.
*/
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: { NODE_ENV: "test" },
    // One file at a time. These share a database, and parallel suites
    // truncating each other's rows is the classic way a green suite starts
    // failing only on a busy machine.
    fileParallelism: false,
  },
});
