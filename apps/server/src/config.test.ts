import { describe, expect, it } from "vitest";
import { readConfig } from "./config.ts";

const SECRET = "a-secret-of-at-least-thirty-two-characters";
const base = { KENNWORT_AUTH_SECRET: SECRET };

describe("readConfig", () => {
  it("has defaults for every setting but the secret", () => {
    expect(readConfig(base)).toEqual({
      ok: true,
      value: {
        port: 8100,
        database: "data/kennwort.db",
        logLevel: "info",
        publicUrl: "http://localhost:8100",
        authSecret: SECRET,
        behindProxy: false,
      },
    });
  });

  it("reads the settings from the environment", () => {
    const env = {
      ...base,
      KENNWORT_PORT: "18100",
      KENNWORT_DATABASE: ":memory:",
      KENNWORT_LOG_LEVEL: "warn",
      KENNWORT_PUBLIC_URL: "https://kennwort.weber-haustechnik.test",
      KENNWORT_BEHIND_PROXY: "true",
    };
    expect(readConfig(env)).toEqual({
      ok: true,
      value: {
        port: 18100,
        database: ":memory:",
        logLevel: "warn",
        publicUrl: "https://kennwort.weber-haustechnik.test",
        authSecret: SECRET,
        behindProxy: true,
      },
    });
  });

  it("takes only true or false for being behind a proxy", () => {
    expect(readConfig({ ...base, KENNWORT_BEHIND_PROXY: "yes" })).toEqual({
      ok: false,
      error: ["KENNWORT_BEHIND_PROXY"],
    });
  });

  it("needs a secret of at least 32 characters and an http(s) public address", () => {
    expect(readConfig({})).toEqual({ ok: false, error: ["KENNWORT_AUTH_SECRET"] });
    expect(readConfig({ KENNWORT_AUTH_SECRET: "short" })).toEqual({
      ok: false,
      error: ["KENNWORT_AUTH_SECRET"],
    });
    expect(readConfig({ ...base, KENNWORT_PUBLIC_URL: "ftp://x.test" })).toEqual({
      ok: false,
      error: ["KENNWORT_PUBLIC_URL"],
    });
  });

  it.each(["0x1F90", "1e3", " 8100 ", "0", "-1", ""])("refuses the port %j", (port) => {
    expect(readConfig({ ...base, KENNWORT_PORT: port })).toEqual({
      ok: false,
      error: ["KENNWORT_PORT"],
    });
  });

  it("names the settings it cannot read", () => {
    expect(readConfig({ ...base, KENNWORT_PORT: "70000", KENNWORT_LOG_LEVEL: "loud" })).toEqual({
      ok: false,
      error: ["KENNWORT_PORT", "KENNWORT_LOG_LEVEL"],
    });
  });

  it("takes only true or false for being behind a proxy", () => {
    expect(readConfig({ ...base, KENNWORT_BEHIND_PROXY: "yes" })).toEqual({
      ok: false,
      error: ["KENNWORT_BEHIND_PROXY"],
    });
  });

  it("needs a secret of at least 32 characters and an http(s) public address", () => {
    expect(readConfig({})).toEqual({ ok: false, error: ["KENNWORT_AUTH_SECRET"] });
    expect(readConfig({ KENNWORT_AUTH_SECRET: "short" })).toEqual({
      ok: false,
      error: ["KENNWORT_AUTH_SECRET"],
    });
    expect(readConfig({ ...base, KENNWORT_PUBLIC_URL: "ftp://x.test" })).toEqual({
      ok: false,
      error: ["KENNWORT_PUBLIC_URL"],
    });
  });
});
