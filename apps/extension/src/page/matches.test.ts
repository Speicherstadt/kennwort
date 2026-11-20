import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import { describe, expect, it } from "vitest";
import { entryHosts, matchesHost, pageHost } from "./matches.ts";

// K-402: matches for the page by exact host, a strict comparison of the extension's own until
// K-403 brings the Public Suffix List (tldts); nothing here fills anything in
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
  ])("finds no web page in %s", (url) => {
    expect(pageHost(url)).toBeUndefined();
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
