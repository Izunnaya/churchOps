import { afterEach } from "vitest";

/*
  Runs before every test file, in every environment.

  Testing Library cleans up after itself only when a global `afterEach` exists.
  This project runs vitest without `globals`, so that hook is never found and a
  rendered tree would stay in the document for the next test in the file —
  queries would then match two copies of the same screen. Registering cleanup
  here means no suite has to remember it.

  The import is deferred because this file also loads for the node suites, which
  have no document, and importing Testing Library there would both fail and cost
  them time they should not pay.
*/
if (typeof document !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  afterEach(cleanup);
}
