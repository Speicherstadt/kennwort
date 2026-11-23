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
        push: { subject: "http://localhost:8100", extraHosts: [] },
        pwnedUrl: "https://api.pwnedpasswords.com/range/",
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
        push: { subject: "https://kennwort.weber-haustechnik.test", extraHosts: [] },
        pwnedUrl: "https://api.pwnedpasswords.com/range/",
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

  it("takes a mirror for the leak check, or off (K-603)", () => {
    const mirror = readConfig({
      ...base,
      KENNWORT_PWNED_URL: "http://pwned.weber.test:8080/range/",
    });
    expect(mirror.ok && mirror.value.pwnedUrl).toBe("http://pwned.weber.test:8080/range/");
    const off = readConfig({ ...base, KENNWORT_PWNED_URL: "off" });
    expect(off.ok && off.value.pwnedUrl).toBeUndefined();
    for (const url of ["ftp://pwned.test/range/", "https://pwned.test/range", "anything"])
      expect(readConfig({ ...base, KENNWORT_PWNED_URL: url })).toEqual({
        ok: false,
        error: ["KENNWORT_PWNED_URL"],
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

  it("reads Web Push: off, its sender and more push services (K-602)", () => {
    expect(readConfig({ ...base, KENNWORT_PUSH: "false" })).toEqual({
      ok: true,
      value: expect.objectContaining({ push: undefined }),
    });
    const env = {
      ...base,
      KENNWORT_PUSH_SUBJECT: "mailto:it@weber-haustechnik.test",
      KENNWORT_PUSH_HOSTS: "push.weber.test,autopush.example",
    };
    expect(readConfig(env)).toEqual({
      ok: true,
      value: expect.objectContaining({
        push: {
          subject: "mailto:it@weber-haustechnik.test",
          extraHosts: ["push.weber.test", "autopush.example"],
        },
      }),
    });
    for (const [name, value] of [
      ["KENNWORT_PUSH", "yes"],
      ["KENNWORT_PUSH_SUBJECT", "http://weber.test"],
      ["KENNWORT_PUSH_SUBJECT", "it@weber.test"],
      ["KENNWORT_PUSH_HOSTS", "push.weber.test, other.test"],
      ["KENNWORT_PUSH_HOSTS", "https://push.weber.test"],
    ])
      expect(readConfig({ ...base, [name as string]: value })).toEqual({
        ok: false,
        error: [name],
      });
  });
});
