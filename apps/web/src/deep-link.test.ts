import { describe, expect, it } from "vitest";
import { deepLinkPath, openTarget } from "./deep-link.ts";

// K-604: deep links from other apps carry IDs only
const vault = "nioK9_lCCjhGEv7Fay7e2Q";
const entry = "DL-IaM1I4SSIpcF2NdvCJw";

describe("deepLinkPath", () => {
  it.each([
    [`web+kennwort://vault/${vault}`, `/vaults/${vault}`],
    [`web+kennwort://vault/${vault}/entry/${entry}`, `/vaults/${vault}/${entry}`],
    [`web+kennwort://entry/${entry}`, `/entries/${entry}`],
    [`kennwort://vault/${vault}/entry/${entry}`, `/vaults/${vault}/${entry}`],
    [`web+kennwort:vault/${vault}`, `/vaults/${vault}`],
    [`web+kennwort://vault/${vault}/`, `/vaults/${vault}`],
  ])("leads %s to %s", (link, path) => {
    expect(deepLinkPath(link)).toBe(path);
  });

  it.each([
    ["another scheme", `https://evil.test/vaults/${vault}`],
    ["javascript", "javascript:alert(1)"],
    ["no ID", "web+kennwort://vault"],
    ["an unknown kind", `web+kennwort://settings/${vault}`],
    ["an ID with other characters", "web+kennwort://vault/..%2F..%2Fsettings"],
    ["more parts", `web+kennwort://vault/${vault}/entry/${entry}/more`],
    ["a part that is not entry", `web+kennwort://vault/${vault}/share/${entry}`],
    ["an entry without its ID", `web+kennwort://vault/${vault}/entry`],
    ["an entry with more", `web+kennwort://entry/${entry}/x`],
    ["an ID longer than 64", `web+kennwort://vault/${"a".repeat(65)}`],
    ["no URL at all", "not a link"],
  ])("refuses %s", (_, link) => {
    expect(deepLinkPath(link)).toBeUndefined();
  });

  it("ignores a query and a fragment: a link carries no secret into the app", () => {
    expect(deepLinkPath(`web+kennwort://vault/${vault}?s=x#secret`)).toBe(`/vaults/${vault}`);
  });
});

describe("openTarget", () => {
  it("opens the linked page, or all entries for anything else", () => {
    const link = encodeURIComponent(`web+kennwort://vault/${vault}/entry/${entry}`);
    expect(openTarget(`?link=${link}`)).toBe(`/vaults/${vault}/${entry}`);
    expect(openTarget("?link=https%3A%2F%2Fevil.test")).toBe("/entries");
    expect(openTarget("")).toBe("/entries");
  });
});
