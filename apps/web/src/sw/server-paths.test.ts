import { describe, expect, it } from "vitest";
import { asInertDocument, isServerNavigation, isServerPath } from "./server-paths.ts";

const ORIGIN = "https://kennwort.test";

describe("isServerPath", () => {
  it("names /api and /auth and what lies under them, nothing that only starts alike", () => {
    expect(["/api", "/api/vaults", "/auth", "/auth/setup"].every(isServerPath)).toBe(true);
    expect(["/", "/apis", "/authors", "/assets/api.js"].some(isServerPath)).toBe(false);
  });
});

describe("isServerNavigation", () => {
  it("is a navigation of the app's origin to a server path", () => {
    expect(isServerNavigation(ORIGIN, `${ORIGIN}/api/x`, "navigate", "GET")).toBe(true);
    expect(isServerNavigation(ORIGIN, `${ORIGIN}/auth/callback`, "navigate", "GET")).toBe(true);
    expect(isServerNavigation(ORIGIN, `${ORIGIN}/api/x`, "cors", "GET")).toBe(false);
    expect(isServerNavigation(ORIGIN, `${ORIGIN}/entries`, "navigate", "GET")).toBe(false);
    expect(isServerNavigation(ORIGIN, "https://idp.test/api/x", "navigate", "GET")).toBe(false);
    // Any other method: no verified release has an answer to it, so only the server does
    expect(isServerNavigation(ORIGIN, `${ORIGIN}/vault`, "navigate", "POST")).toBe(true);
    expect(isServerNavigation(ORIGIN, `${ORIGIN}/vault`, "cors", "POST")).toBe(false);
    expect(isServerNavigation(ORIGIN, "https://idp.test/vault", "navigate", "POST")).toBe(false);
  });
});

describe("asInertDocument", () => {
  it("passes a redirect on as it is, so sign-in flows through /auth still work", () => {
    const redirect = new Response(null, { status: 302, headers: { location: "/" } });
    expect(asInertDocument(redirect)).toBe(redirect);
  });

  it.each([
    ["text/html", "<script>steal()</script>"],
    ["image/svg+xml", '<svg xmlns="http://www.w3.org/2000/svg"><script>steal()</script></svg>'],
    ["application/json", '{"error":"x"}'],
  ])("turns a %s answer into sandboxed plain text", async (type, body) => {
    const shown = asInertDocument(
      new Response(body, { status: 400, headers: { "content-type": type } }),
    );
    expect(shown.status).toBe(400);
    expect(shown.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(shown.headers.get("content-security-policy")).toBe("sandbox");
    expect(shown.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await shown.text()).toBe(body);
  });

  it("keeps an answer without a body without one", () => {
    expect(asInertDocument(new Response(null, { status: 204 })).status).toBe(204);
  });
});
