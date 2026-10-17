import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

/*
  Separate from vite.config.ts on purpose: the PWA plugin has no part in a run,
  and most suites are plain Node modules that never touch a document.

  A test that needs a real DOM opts in per file, with a docblock on the first
  line of the file:

      // @vitest-environment jsdom

  Everything else keeps the node environment below, so a browser is paid for
  only in the files that render. Measured here, jsdom adds about two seconds of
  start-up to a file; the contract and money suites would gain nothing for it.

  liveTransport.test.ts needs the server from server/src/index.ts actually
  running. VITE_API_BASE_URL decides whether that file runs at all: unset, it is
  excluded, so a default `npm test` on a machine with no server up cannot report
  an absence as a failure. Setting it also gives the transport its base address,
  but the file's own raw fetch calls go to http://localhost:4000 regardless, so
  that is the address to run the server on:

      VITE_API_BASE_URL=http://localhost:4000 npm test
*/
const liveServerAddress = process.env.VITE_API_BASE_URL;

export default defineConfig({
  // The same `@` the app builds with. Without it a test can import a module
  // from src/ only by relative path, and that module's own `@` imports fail.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  /*
    Test files may be .tsx, so the transform needs the same JSX handling the app
    gets. Said here rather than leaning on tsconfig discovery, which has to walk
    the solution file to reach tsconfig.test.json, and rather than adding the
    React plugin: that plugin is for Fast Refresh, which a test run has no use
    for. This costs the .ts suites nothing, because JSX is only parsed in .tsx.
    Vite 8 transforms with oxc, so an `esbuild` block here would be ignored.
  */
  oxc: {
    jsx: { runtime: "automatic", importSource: "react" },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: liveServerAddress
      ? [...configDefaults.exclude]
      : [...configDefaults.exclude, "tests/liveTransport.test.ts"],
    // Registers Testing Library's between-test cleanup for the jsdom files, and
    // does nothing at all in the node ones. See the file for why.
    setupFiles: ["./vitest.setup.ts"],
  },
});
