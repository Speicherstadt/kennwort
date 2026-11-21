import { defineConfig } from "vitest/config";

// Only the tests of packages/core, for Stryker's mutation run (stryker.config.json).
// STRYKER_TESTS narrows them for one part of the CI matrix: the import parsers are used by their
// own tests only, so `core-import` runs just those against its mutants (many are static, and a
// static mutant runs every test it is given).
// The parsers' fuzzing runs in `bun run test`; it touches every line, so Stryker would run its
// seconds-long inputs against every mutant. Their mutants are killed by the fixture tests.
export default defineConfig({
  test: {
    include: [process.env.STRYKER_TESTS ?? "src/**/*.test.ts"],
    exclude: ["src/import/**/*.property.test.ts"],
  },
});
