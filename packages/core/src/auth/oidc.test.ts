import { describe, expect, it } from "vitest";
import { encodeBytes } from "../sync/bytes.ts";
import { OidcLinkWire, OidcProviderWire, OidcStatusWire, OidcTicketWire } from "./oidc.ts";

const id = encodeBytes(new Uint8Array(16).fill(0x40));
const root = encodeBytes(new Uint8Array(32).fill(1));

describe("OidcProviderWire", () => {
  it("takes a name of 1 to 40 characters", () => {
    expect(OidcProviderWire.parse({ name: "Weber SSO" })).toEqual({ name: "Weber SSO" });
    expect(OidcProviderWire.safeParse({ name: "" }).success).toBe(false);
    expect(OidcProviderWire.safeParse({ name: "x".repeat(40) }).success).toBe(true);
    expect(OidcProviderWire.safeParse({ name: "x".repeat(41) }).success).toBe(false);
  });
});

describe("OidcTicketWire", () => {
  it("reads a known account by its ID, without a session", () => {
    expect(OidcTicketWire.parse({ kind: "known", accountId: id, token: "x" })).toEqual({
      kind: "known",
      accountId: new Uint8Array(16).fill(0x40),
    });
    expect(OidcTicketWire.safeParse({ kind: "known", accountId: root }).success).toBe(false);
  });

  it("reads an enrolment with the provider's name for the person and the root key", () => {
    expect(OidcTicketWire.parse({ kind: "enrol", name: "Sandra", rootPublicKey: root })).toEqual({
      kind: "enrol",
      name: "Sandra",
      rootPublicKey: new Uint8Array(32).fill(1),
    });
    expect(OidcTicketWire.parse({ kind: "enrol", name: null, rootPublicKey: root })).toMatchObject({
      name: null,
    });
    for (const bad of [
      { kind: "enrol", name: "x".repeat(201), rootPublicKey: root },
      { kind: "enrol", name: "Sandra", rootPublicKey: null },
      { kind: "enrol", name: "Sandra", rootPublicKey: id },
      { kind: "session", accountId: id },
    ])
      expect(OidcTicketWire.safeParse(bad).success).toBe(false);
    expect(
      OidcTicketWire.safeParse({ kind: "enrol", name: "x".repeat(200), rootPublicKey: root })
        .success,
    ).toBe(true);
  });
});

describe("OidcStatusWire", () => {
  const admin = {
    name: "Weber SSO",
    linked: false,
    enrolment: true,
    enrolmentUrl: "https://kennwort.weber.test/auth/oidc/start?company=x",
    groupsClaim: "groups",
    groups: [{ id: "g", name: "Technik", viaIdp: 2 }],
  };

  it("reads a member's view and an admin's", () => {
    expect(OidcStatusWire.parse({ name: "Weber SSO", linked: true })).toEqual({
      name: "Weber SSO",
      linked: true,
    });
    expect(OidcStatusWire.parse(admin)).toEqual(admin);
  });

  it.each([
    ["an empty name", { name: "" }],
    ["a link that is no boolean", { linked: "yes" }],
    ["an address that is no web address", { enrolmentUrl: "javascript:alert(1)" }],
    ["an empty claim", { groupsClaim: "" }],
    ["a group without a name", { groups: [{ id: "g", name: "", viaIdp: 0 }] }],
    ["a group without an ID", { groups: [{ id: "", name: "T", viaIdp: 0 }] }],
    ["a negative count", { groups: [{ id: "g", name: "T", viaIdp: -1 }] }],
    ["a count that is no integer", { groups: [{ id: "g", name: "T", viaIdp: 1.5 }] }],
  ])("refuses %s", (_, change) => {
    expect(OidcStatusWire.safeParse({ ...admin, ...change }).success).toBe(false);
  });
});

describe("OidcLinkWire", () => {
  it("takes only a web address", () => {
    expect(OidcLinkWire.parse({ url: "https://sso.test/authorize?x=1" }).url).toBe(
      "https://sso.test/authorize?x=1",
    );
    expect(OidcLinkWire.safeParse({ url: "javascript:alert(1)" }).success).toBe(false);
  });
});
