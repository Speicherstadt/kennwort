import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import { describe, expect, it } from "vitest";
import { entryAddresses, entryHosts, fillAllowed, matchesHost, pageHost } from "./matches.ts";

// K-402, K-403: matches for the page by exact host, read with tldts and the Public Suffix List; the
// popup lists by it, the inline menu lists by it, and the service worker fills only by it (P-17)
const entry = (...urls: string[]): ShownEntry =>
  ({
    id: "e",
    fields: [
      { id: "username", label: "", value: "jonas", kind: "text" },
      ...urls.map((value, i) => ({ id: `u${i}`, label: "", value, kind: "url" as const })),
    ],
  }) as unknown as ShownEntry;

describe("pageHost", () => {
  it.each([
    ["https://portal.weber-haustechnik.test/login?x=1", "portal.weber-haustechnik.test"],
    ["http://PORTAL.Weber-Haustechnik.test:8080/", "portal.weber-haustechnik.test"],
    ["https://bücher.test/", "xn--bcher-kva.test"],
    ["https://portal.weber-haustechnik.test./", "portal.weber-haustechnik.test"],
  ])("reads the host of %s", (url, host) => {
    expect(pageHost(url)).toBe(host);
  });

  it.each([
    undefined,
    "",
    "chrome://extensions",
    "chrome-extension://abc/popup.html",
    "file:///home/jonas/a.html",
    "about:blank",
    "data:text/html,<p>x</p>",
    "javascript:alert(1)",
    "not a url",
    // A public suffix is never one site: a stored "github.io" or "co.uk" would cover thousands
    "https://github.io/",
    "https://co.uk/",
    "https://test/",
  ])("finds no web page in %s", (url) => {
    expect(pageHost(url)).toBeUndefined();
  });
});

describe("pageHost with tldts", () => {
  it.each([
    ["https://jonas.github.io/", "jonas.github.io"],
    ["http://localhost:5176/", "localhost"],
    ["http://192.168.1.10/", "192.168.1.10"],
    ["http://[::1]:8080/", "[::1]"],
  ])("keeps the exact host of %s", (url, host) => {
    expect(pageHost(url)).toBe(host);
  });
});

describe("entryHosts", () => {
  it("reads every web address of an entry, with or without scheme, and nothing else", () => {
    const login = entry("https://portal.weber-haustechnik.test/login", "Bank.Test", "  ");
    expect(entryHosts(login)).toEqual(["portal.weber-haustechnik.test", "bank.test"]);
  });

  it("does not read hosts from fields that are not web addresses", () => {
    expect(entryHosts(entry())).toEqual([]);
  });

  it("refuses addresses that are no web pages", () => {
    expect(entryHosts(entry("javascript:alert(1)", "ftp://files.test", "mailto:a@b.test"))).toEqual(
      [],
    );
  });
});

describe("matchesHost", () => {
  const portal = entry("https://portal.weber-haustechnik.test/login");

  it("matches the exact host, whatever the path, port, case or scheme", () => {
    expect(matchesHost(portal, "portal.weber-haustechnik.test")).toBe(true);
    expect(
      matchesHost(entry("PORTAL.weber-haustechnik.test:443"), "portal.weber-haustechnik.test"),
    ).toBe(true);
  });

  it.each([
    "weber-haustechnik.test",
    "www.portal.weber-haustechnik.test",
    "evil.portal.weber-haustechnik.test",
    "portal.weber-haustechnik.test.evil.test",
    "portal-weber-haustechnik.test",
    "portal.weber-haustechnik.tes",
  ])("does not match the neighbouring host %s", (host) => {
    expect(matchesHost(portal, host)).toBe(false);
  });

  it("is not fooled by a user name in the stored address", () => {
    const tricky = entry("https://portal.weber-haustechnik.test@evil.test/");
    expect(matchesHost(tricky, "portal.weber-haustechnik.test")).toBe(false);
    expect(matchesHost(tricky, "evil.test")).toBe(true);
  });

  it("matches nothing without a page", () => {
    expect(matchesHost(portal, undefined)).toBe(false);
  });
});

describe("entryAddresses", () => {
  it("reads host and scheme of each stored address, https where none is stored", () => {
    expect(entryAddresses(["http://router.test/admin", "bank.test", "github.io"])).toEqual([
      { host: "router.test", secure: false },
      { host: "bank.test", secure: true },
    ]);
  });
});

describe("fillAllowed", () => {
  const portal = ["https://portal.weber-haustechnik.test/login"];

  it("fills on the exact host of a stored address", () => {
    expect(fillAllowed("https://portal.weber-haustechnik.test/start", portal)).toBe(true);
  });

  it.each([
    "https://portal.weber-haustechnik.test.evil.test/login",
    "https://portal-weber-haustechnik.test/login",
    "https://www.portal.weber-haustechnik.test/login",
    "https://weber-haustechnik.test/login",
    "chrome-extension://abc/popup.html",
    "about:blank",
  ])("does not fill on %s", (url) => {
    expect(fillAllowed(url, portal)).toBe(false);
  });

  it("does not fill a password stored for https into the same host over http", () => {
    expect(fillAllowed("http://portal.weber-haustechnik.test/login", portal)).toBe(false);
    expect(
      fillAllowed("http://portal.weber-haustechnik.test/", ["portal.weber-haustechnik.test"]),
    ).toBe(false);
  });

  it("fills over http where the address itself is stored with http", () => {
    expect(fillAllowed("http://router.test/", ["http://router.test/admin"])).toBe(true);
    expect(fillAllowed("https://router.test/", ["http://router.test/admin"])).toBe(true);
  });

  it("does not fill without addresses", () => {
    expect(fillAllowed("https://portal.weber-haustechnik.test/", [])).toBe(false);
  });
});
