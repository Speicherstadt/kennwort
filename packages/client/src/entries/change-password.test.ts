import { describe, expect, it } from "vitest";
import { changeLink } from "./change-password.ts";

const wellKnown = (origin: string) => ({
  url: `${origin}/.well-known/change-password`,
  wellKnown: true,
});
const startPage = (origin: string) => ({ url: `${origin}/`, wellKnown: false });

// K-603: „Jetzt ändern“ opens the site's well-known address for changing a password
describe("changeLink", () => {
  it.each([
    ["https://www.sparkasse.test/login?x=1#top", wellKnown("https://www.sparkasse.test")],
    ["http://portal.weber-haustechnik.test/", wellKnown("http://portal.weber-haustechnik.test")],
    ["portal.weber-haustechnik.test/kunden", wellKnown("https://portal.weber-haustechnik.test")],
    ["  shop.test  ", wellKnown("https://shop.test")],
    ["HTTPS://Shop.Test/", wellKnown("https://shop.test")],
  ])("uses the origin of %j", (website, expected) => {
    expect(changeLink(website)).toEqual(expected);
  });

  it.each([
    ["https://portal.weber.test:8443/login", wellKnown("https://portal.weber.test:8443")],
    ["portal.weber.test:8443", wellKnown("https://portal.weber.test:8443")],
    ["portal.weber.test:8443/login", wellKnown("https://portal.weber.test:8443")],
    ["https://portal.weber.test:443/", wellKnown("https://portal.weber.test")],
    ["http://portal.weber.test:80/", wellKnown("http://portal.weber.test")],
  ])("keeps a port: %j", (website, expected) => {
    expect(changeLink(website)).toEqual(expected);
  });

  it("writes an international name as the browser does (IDN, punycode)", () => {
    expect(changeLink("https://müller-heizung.test/konto")).toEqual(
      wellKnown("https://xn--mller-heizung-wob.test"),
    );
    expect(changeLink("bäckerei.test")).toEqual(wellKnown("https://xn--bckerei-5wa.test"));
  });

  it("drops a user and password in the address", () => {
    expect(changeLink("https://jonas:Geheim-1@nas.weber.test/")).toEqual(
      wellKnown("https://nas.weber.test"),
    );
  });

  it.each([
    ["http://192.168.178.1/", startPage("http://192.168.178.1")],
    ["192.168.178.1", startPage("https://192.168.178.1")],
    ["http://192.168.178.1:8080/admin", startPage("http://192.168.178.1:8080")],
    ["http://[fd00::1]/", startPage("http://[fd00::1]")],
    ["http://localhost:3000/", startPage("http://localhost:3000")],
    ["localhost:3000", startPage("https://localhost:3000")],
    ["http://nas/", startPage("http://nas")],
  ])(
    "opens the device's start page for an IP address or a name without a dot: %j",
    (website, expected) => {
      expect(changeLink(website)).toEqual(expected);
    },
  );

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(document.cookie)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "ftp://files.weber.test/",
    "mailto:info@weber.test",
    "chrome-extension://abc/popup.html",
    "otpauth://totp/x?secret=ABC",
    "vbscript:msgbox(1)",
  ])("gives no link for another scheme: %j", (website) => {
    expect(changeLink(website)).toBeUndefined();
  });

  it.each(["", "   ", "http://", "https://exa mple.test", "//", "http://[::1"])(
    "gives no link for %j",
    (website) => {
      expect(changeLink(website)).toBeUndefined();
    },
  );
});
