import { encodeBytes } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import { parseInvitationLink } from "./invitation-link.ts";

// K-605: Max of Müller Elektro invites Jonas, who pastes the link into his account
const ID = "BQUFBQUFBQUFBQUFBQUFBQ";
const s = encodeBytes(new Uint8Array(32).fill(8));
const root = encodeBytes(new Uint8Array(32).fill(7));
const link = `https://kennwort.test/invite/${ID}#token=abc&s=${s}&root=${root}`;

describe("an invitation link pasted on „Firmen“", () => {
  it("gives ID, token, secret and root from path and fragment", () => {
    expect(parseInvitationLink(`  ${link} `)).toEqual({
      id: ID,
      token: "abc",
      secret: new Uint8Array(32).fill(8),
      rootFingerprint: new Uint8Array(32).fill(7),
    });
  });

  it("refuses anything else", () => {
    expect(parseInvitationLink("kein Link")).toBeUndefined();
    expect(parseInvitationLink(link.replace("/invite/", "/einladung/"))).toBeUndefined();
    expect(parseInvitationLink(link.replace(ID, "kurz"))).toBeUndefined();
    expect(parseInvitationLink(link.replace(ID, `${ID}/x`))).toBeUndefined();
    expect(parseInvitationLink(link.split("#")[0] ?? "")).toBeUndefined();
    expect(parseInvitationLink(link.replace(`root=${root}`, "root=x"))).toBeUndefined();
  });
});
