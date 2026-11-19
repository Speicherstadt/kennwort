import { describe, expect, it } from "vitest";
import { readConfig } from "./config.ts";

describe("readConfig", () => {
  it("has defaults for every setting", () => {
    expect(readConfig({})).toEqual({
      ok: true,
      value: { port: 8100, database: "data/kennwort.db", logLevel: "info" },
    });
  });

  it("reads the settings from the environment", () => {
    const env = {
      KENNWORT_PORT: "18100",
      KENNWORT_DATABASE: ":memory:",
      KENNWORT_LOG_LEVEL: "warn",
    };
    expect(readConfig(env)).toEqual({
      ok: true,
      value: { port: 18100, database: ":memory:", logLevel: "warn" },
    });
  });

  it("names the settings it cannot read", () => {
    expect(readConfig({ KENNWORT_PORT: "70000", KENNWORT_LOG_LEVEL: "loud" })).toEqual({
      ok: false,
      error: ["KENNWORT_PORT", "KENNWORT_LOG_LEVEL"],
    });
  });
});
