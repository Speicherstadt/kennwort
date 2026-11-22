import { describe, expect, it } from "vitest";
import { rpIdAllowed, rpIdFor } from "./rp-id.ts";

// K-406: the rpId a page may use, as WebAuthn and the HTML standard define it, read with tldts
const PORTAL = "https://portal.weber-haustechnik.test/login";

describe("rpIdFor", () => {
  it("takes the page's host when the page claims no rpId", () => {
    expect(rpIdFor(PORTAL, undefined)).toEqual({
      ok: true,
      value: {
        origin: "https://portal.weber-haustechnik.test",
        rpId: "portal.weber-haustechnik.test",
      },
    });
    expect(rpIdFor("https://portal.weber-haustechnik.test:8443/", undefined)).toEqual({
      ok: true,
      value: {
        origin: "https://portal.weber-haustechnik.test:8443",
        rpId: "portal.weber-haustechnik.test",
      },
    });
  });

  it("allows the host itself or a parent domain that is no public suffix", () => {
    expect(rpIdFor(PORTAL, "weber-haustechnik.test")).toMatchObject({
      ok: true,
      value: { rpId: "weber-haustechnik.test" },
    });
    expect(rpIdFor(PORTAL, "portal.weber-haustechnik.test")).toMatchObject({ ok: true });
    expect(rpIdFor(PORTAL, "Weber-Haustechnik.TEST")).toMatchObject({
      ok: true,
      value: { rpId: "weber-haustechnik.test" },
    });
    expect(rpIdFor("https://login.example.co.uk/", "example.co.uk")).toMatchObject({ ok: true });
  });

  it("refuses another site, a look-alike, a subdomain and a public suffix (SecurityError)", () => {
    for (const claimed of [
      "portal-weber-haustechnik.test",
      "weber-haustechnik.test.evil.test",
      "evil.test",
      "www.portal.weber-haustechnik.test",
      "test",
      "haustechnik.test",
      "",
      "weber-haustechnik.test:443",
      "weber-haustechnik.test/x",
      "weber haustechnik.test",
      "user@weber-haustechnik.test",
    ])
      expect(rpIdFor(PORTAL, claimed), claimed).toEqual({ ok: false, error: "SecurityError" });
    expect(rpIdFor("https://login.example.co.uk/", "co.uk")).toEqual({
      ok: false,
      error: "SecurityError",
    });
    expect(rpIdFor("https://weber.github.io/", "github.io")).toEqual({
      ok: false,
      error: "SecurityError",
    });
  });

  it("leaves pages that are no secure context or have no domain to the browser", () => {
    for (const url of [
      "http://portal.weber-haustechnik.test/",
      "ftp://portal.weber-haustechnik.test/",
      "https://192.168.1.10/",
      "https://[::1]/",
      "about:blank",
      "not a url",
    ])
      expect(rpIdFor(url, undefined), url).toEqual({ ok: false, error: "unsupported" });
  });

  it("allows http on localhost", () => {
    expect(rpIdFor("http://localhost:5176/", undefined)).toEqual({
      ok: true,
      value: { origin: "http://localhost:5176", rpId: "localhost" },
    });
  });
});

describe("rpIdAllowed", () => {
  it("is the host or a registrable suffix of it", () => {
    expect(rpIdAllowed("a.b.weber.test", "weber.test")).toBe(true);
    expect(rpIdAllowed("a.b.weber.test", "b.weber.test")).toBe(true);
    expect(rpIdAllowed("aweber.test", "weber.test")).toBe(false);
    expect(rpIdAllowed("weber.test", "a.weber.test")).toBe(false);
    expect(rpIdAllowed("a.s3.amazonaws.com", "s3.amazonaws.com")).toBe(false);
    expect(rpIdAllowed("localhost", "localhost")).toBe(true);
  });
});
