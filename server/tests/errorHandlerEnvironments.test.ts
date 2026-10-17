import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { resolve } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

/*
  What the 500 branch sends, under each NODE_ENV, measured rather than read.

  `errorHandler` attaches `debug: err.message` only when the environment is
  explicitly "development". That is one ternary, and the whole safety of it
  rests on which values match — so each value gets its own process, its own
  thrown error and its own response. Four runs, four answers, no inference.

  The values that matter:
    unset        the documented way to run the server (`npx ts-node src/index.ts`)
    development  the one branch that is allowed to leak
    production   the deployed case
    test         what a suite sees

  Each child mounts the real middleware through tests/errorHandlerHarness.js.
*/

/*
  vitest's default per-test timeout is 5 seconds. Each child here boots
  ts-node, which costs a second or two on an idle machine and considerably more
  on a loaded one, and this file once timed out at 5s and then passed on its
  own. A test that fails only when the machine is busy teaches people to re-run
  rather than to read, so the budget is stated here and made generous.

  The spawn cost is also paid once per NODE_ENV rather than once per test, by
  the cache below — four children for the whole file instead of nine.
*/
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const HARNESS = resolve(__dirname, "errorHandlerHarness.js");
const SERVER_DIRECTORY = resolve(__dirname, "..");

/// Planted in the thrown error by the harness. None of it may reach a caller
/// outside the development branch, and the credential-shaped part never may.
const INTERNAL_MARKER = "SECRET-INTERNAL-DETAIL";
const LEAKY_FRAGMENTS = [
  "prisma.ts",
  "C:/Users",
  "postgresql://",
  "hunter2",
  "db.example.internal",
  'relation "Offering"',
  ":12:3",
];

const running: ChildProcessWithoutNullStreams[] = [];

afterAll(() => {
  for (const child of running) child.kill();
});

/*
  One child per NODE_ENV, shared by every test that asks for it. The harness is
  stateless — it throws the same error at every request — so reuse changes no
  result, and it takes the file from nine ts-node boots to four.
*/
const harnesses = new Map<string, Promise<{ port: number }>>();

const startHarness = (nodeEnv: string | undefined): Promise<{ port: number }> => {
  const key = nodeEnv ?? "<unset>";
  const existing = harnesses.get(key);
  if (existing) return existing;

  const started = spawnHarness(nodeEnv);
  harnesses.set(key, started);
  return started;
};

const spawnHarness = (nodeEnv: string | undefined): Promise<{ port: number }> => {
  const environment = { ...process.env };
  if (nodeEnv === undefined) delete environment.NODE_ENV;
  else environment.NODE_ENV = nodeEnv;

  // The harness imports src/lib/env.ts, which under NODE_ENV=test insists on
  // .env.test and otherwise reads .env. Both live in server/.
  const child = spawn(process.execPath, [HARNESS], {
    cwd: SERVER_DIRECTORY,
    env: environment,
  });
  running.push(child);

  return new Promise((resolveReady, rejectReady) => {
    let stderr = "";
    const timer = setTimeout(
      () => rejectReady(new Error(`harness did not start for NODE_ENV=${nodeEnv}: ${stderr}`)),
      45_000,
    );

    child.stdout.on("data", (chunk: Buffer) => {
      const match = /READY (\d+)/.exec(chunk.toString());
      if (match) {
        clearTimeout(timer);
        resolveReady({ port: Number(match[1]) });
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      rejectReady(new Error(`harness exited ${code} for NODE_ENV=${nodeEnv}: ${stderr}`));
    });
  });
};

type Answer = { status: number; body: { error: Record<string, unknown> }; text: string };

const ask = async (port: number, path: string): Promise<Answer> => {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  const text = await response.text();
  return { status: response.status, body: JSON.parse(text), text };
};

/*
  Every environment except an explicit "development" must answer identically,
  and must carry nothing of the error.
*/
describe.each([
  ["unset", undefined],
  ["production", "production"],
  ["test", "test"],
] as const)("NODE_ENV=%s", (label, nodeEnv) => {
  it("answers 500 with no debug key and nothing of the error", async () => {
    const { port } = await startHarness(nodeEnv);
    const answer = await ask(port, "/boom");

    expect(answer.status).toBe(500);
    expect(answer.body.error.code).toBe("INTERNAL_ERROR");
    expect(answer.body.error.message).toBe(
      "Something went wrong on our end. Please try again.",
    );

    expect(answer.body.error).not.toHaveProperty("debug");
    expect(answer.text, `NODE_ENV=${label} leaked the thrown message`).not.toContain(
      INTERNAL_MARKER,
    );
    for (const fragment of LEAKY_FRAGMENTS) {
      expect(answer.text, `NODE_ENV=${label} leaked ${fragment}`).not.toContain(fragment);
    }
  });

  it("carries only code and message, for a thrown non-Error too", async () => {
    const { port } = await startHarness(nodeEnv);
    const answer = await ask(port, "/boom-string");

    expect(answer.status).toBe(500);
    expect(Object.keys(answer.body.error).sort()).toEqual(["code", "message"]);
    expect(answer.text).not.toContain(INTERNAL_MARKER);
  });
});

/*
  The one branch that is allowed to leak, asserted so it is a deliberate
  behaviour rather than an accident — and so the contrast above means
  something.
*/
describe("NODE_ENV=development", () => {
  it("attaches debug, and is the ONLY environment that does", async () => {
    const { port } = await startHarness("development");
    const answer = await ask(port, "/boom");

    expect(answer.status).toBe(500);
    expect(answer.body.error).toHaveProperty("debug");
    expect(String(answer.body.error.debug)).toContain(INTERNAL_MARKER);
  });

  it("still keeps the user-facing message free of the detail", async () => {
    // Whatever `debug` holds, `message` is what the client renders to a person.
    const { port } = await startHarness("development");
    const answer = await ask(port, "/boom");

    expect(answer.body.error.message).toBe(
      "Something went wrong on our end. Please try again.",
    );
    expect(String(answer.body.error.message)).not.toContain(INTERNAL_MARKER);
  });
});

/*
  The unset case deserves its own statement, because it is the one the README
  documents and the one a misconfigured deployment lands on. "Not development"
  has to be the default, not something you remember to set.
*/
describe("the default an unconfigured process gets", () => {
  it("is the safe branch, identical to production", async () => {
    const unset = await startHarness(undefined);
    const production = await startHarness("production");

    const unsetAnswer = await ask(unset.port, "/boom");
    const productionAnswer = await ask(production.port, "/boom");

    expect(unsetAnswer.status).toBe(productionAnswer.status);
    expect(unsetAnswer.text).toBe(productionAnswer.text);
  });
});
