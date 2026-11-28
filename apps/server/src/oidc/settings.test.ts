import { describe, expect, it } from "vitest";
import { readConfig } from "../config.ts";
import { readOidcSettings } from "./settings.ts";

const base = {
  KENNWORT_OIDC_ISSUER: "https://sso.weber-haustechnik.test/realms/weber",
  KENNWORT_OIDC_CLIENT_ID: "kennwort",
  KENNWORT_OIDC_CLIENT_SECRET: "client-secret",
};

describe("readOidcSettings", () => {
  it("is off without an issuer", () => {
    expect(readOidcSettings({})).toEqual({ ok: true, value: undefined });
  });

  it("has defaults for name and scopes", () => {
    expect(readOidcSettings(base)).toEqual({
      ok: true,
      value: {
        issuer: "https://sso.weber-haustechnik.test/realms/weber",
        clientId: "kennwort",
        clientSecret: "client-secret",
        name: "OpenID Connect",
        scopes: "openid profile",
      },
    });
  });

  it("reads name and scopes; a public client has no secret", () => {
    const { KENNWORT_OIDC_CLIENT_SECRET: _, ...publicClient } = base;
    expect(
      readOidcSettings({
        ...publicClient,
        KENNWORT_OIDC_NAME: "Weber SSO",
        KENNWORT_OIDC_SCOPES: "openid profile email",
      }),
    ).toEqual({
      ok: true,
      value: expect.objectContaining({
        clientSecret: undefined,
        name: "Weber SSO",
        scopes: "openid profile email",
      }),
    });
  });

  it.each([
    [
      "an issuer without a client",
      { KENNWORT_OIDC_ISSUER: base.KENNWORT_OIDC_ISSUER },
      "KENNWORT_OIDC_CLIENT_ID",
    ],
    [
      "an issuer over plain http",
      { ...base, KENNWORT_OIDC_ISSUER: "http://sso.test" },
      "KENNWORT_OIDC_ISSUER",
    ],
    [
      "scopes without openid",
      { ...base, KENNWORT_OIDC_SCOPES: "profile email" },
      "KENNWORT_OIDC_SCOPES",
    ],
  ])("refuses %s", (_, env, setting) => {
    expect(readOidcSettings(env)).toEqual({ ok: false, error: [setting] });
  });

  it("takes plain http only for an issuer on this machine (tests, e2e)", () => {
    const local = readOidcSettings({ ...base, KENNWORT_OIDC_ISSUER: "http://localhost:28200" });
    expect(local.ok && local.value?.issuer).toBe("http://localhost:28200");
  });

  it("is part of the server's settings", () => {
    const config = readConfig({ KENNWORT_AUTH_SECRET: "x".repeat(32), ...base });
    expect(config.ok && config.value.oidc?.clientId).toBe("kennwort");
    expect(
      readConfig({ KENNWORT_AUTH_SECRET: "x".repeat(32), KENNWORT_OIDC_ISSUER: "nope" }),
    ).toEqual({
      ok: false,
      error: ["KENNWORT_OIDC_ISSUER"],
    });
  });
});
