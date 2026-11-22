import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { migrate, openDatabase } from "../db/database.ts";
import { createLog } from "../log.ts";
import { isExtensionOrigin } from "./extension-cors.ts";

// K-402: the extension's popup talks to the company's server from its own origin
// (chrome-extension://…, moz-extension://…, safari-web-extension://…). Only that origin gets CORS headers, only on the paths
// the popup calls, and never with credentials: the API takes a bearer token, not a cookie.
const app = () => {
  const db = openDatabase(":memory:");
  migrate(db);
  return createApp({ db, log: createLog("error", () => {}), authenticate: async () => undefined });
};

const CHROME = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
const FIREFOX = "moz-extension://0f8d3a4e-7b1c-4c3e-9a51-2d6f8e9b7c10";
// K-407: Safari's address changes with every launch; WebKit writes the UUID in capitals
const SAFARI = "safari-web-extension://E2C2B5A3-2D69-4D6A-B8A3-9E1F5C8F2C41";

const preflight = (path: string, origin: string) =>
  app().request(path, {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "PUT",
      "access-control-request-headers": "authorization,content-type,x-kennwort-device",
    },
  });

describe("CORS for the extension", () => {
  it.each([CHROME, FIREFOX, SAFARI])("lets %s call the API with a bearer token", async (origin) => {
    const response = await preflight("/api/vaults", origin);
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    const allowed = response.headers.get("access-control-allow-headers") ?? "";
    for (const header of [
      "authorization",
      "content-type",
      "x-kennwort-device",
      "x-kennwort-device-name",
    ])
      expect(allowed).toContain(header);
    expect(response.headers.get("access-control-allow-methods")).toContain("PUT");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("answers the API and the sign-in key with the extension's origin", async () => {
    for (const path of ["/api/vaults", "/auth/login-key/challenge"]) {
      const response = await app().request(path, {
        method: path.startsWith("/auth") ? "POST" : "GET",
        headers: { origin: CHROME, "content-type": "application/json" },
        body: path.startsWith("/auth") ? "{}" : null,
      });
      expect(response.headers.get("access-control-allow-origin")).toBe(CHROME);
      expect(response.headers.get("vary")).toContain("Origin");
    }
  });

  it("gives a web page no CORS headers, not even one that names itself like an extension", async () => {
    for (const origin of [
      "https://evil.test",
      "http://localhost:5176",
      `${CHROME}.evil.test`,
      "chrome-extension://ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP",
      "chrome-extension://short",
      "safari-web-extension://not-a-uuid",
      `${SAFARI}.evil.test`,
      "webkit-extension://E2C2B5A3-2D69-4D6A-B8A3-9E1F5C8F2C41",
      "null",
    ]) {
      const response = await preflight("/api/vaults", origin);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    }
  });

  it("opens nothing else to the extension: not Better Auth, setup, pairing or invitations", async () => {
    for (const path of ["/auth/sign-in/passkey", "/auth/setup", "/auth/pairings/x", "/health"]) {
      const response = await preflight(path, CHROME);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    }
  });
});

describe("isExtensionOrigin", () => {
  it("knows the extension origins of Chrome, Firefox and Safari and nothing else", () => {
    expect(isExtensionOrigin(CHROME)).toBe(true);
    expect(isExtensionOrigin(FIREFOX)).toBe(true);
    expect(isExtensionOrigin(SAFARI)).toBe(true);
    expect(isExtensionOrigin(SAFARI.toLowerCase())).toBe(true);
    expect(isExtensionOrigin(`${SAFARI}/`)).toBe(false);
    expect(isExtensionOrigin("moz-extension://0F8D3A4E-7B1C-4C3E-9A51-2D6F8E9B7C10")).toBe(false);
    expect(isExtensionOrigin(`${FIREFOX}/`)).toBe(false);
    expect(isExtensionOrigin("moz-extension://not-a-uuid")).toBe(false);
    expect(isExtensionOrigin("")).toBe(false);
  });
});
