import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import { describe, expect, it } from "vitest";
import type { Ceremony } from "../passkey/messages.ts";
import { passkeyView } from "./passkey-view.ts";

// K-406: the prompt waits for the account and the entries, hands what it cannot serve to the
// browser's own WebAuthn, and shows itself for a sign-in no passkey fits as for one that does
const ceremony: Ceremony = {
  kind: "get",
  origin: "https://portal.weber-haustechnik.test",
  rpId: "portal.weber-haustechnik.test",
  challenge: "AA",
  allow: [],
  userVerification: "preferred",
};
const input = {
  phase: "open" as const,
  load: "ready" as const,
  entries: [],
  vaults: [] as Vault[],
  ceremony,
};

describe("passkeyView", () => {
  it("waits while the account starts or the entries load", () => {
    expect(passkeyView({ ...input, phase: "starting" })).toEqual({ kind: "waiting" });
    expect(passkeyView({ ...input, load: "loading" })).toEqual({ kind: "waiting" });
  });

  it("falls back while locked or not connected, and when the entries fail or are untrusted", () => {
    for (const phase of ["locked", "connect"] as const)
      expect(passkeyView({ ...input, phase })).toEqual({ kind: "fallback" });
    for (const load of ["failed", "untrusted"] as const)
      expect(passkeyView({ ...input, load })).toEqual({ kind: "fallback" });
  });

  // Unseen only for a match would tell the page which passkeys exist (WebAuthn §14.5.2)
  it("says that no passkey fits a sign-in instead of falling back unseen", () => {
    expect(passkeyView(input)).toEqual({ kind: "none" });
  });

  it("offers only vaults this account may write, without one a note", () => {
    const create: Ceremony = {
      kind: "create",
      origin: ceremony.origin,
      rpId: ceremony.rpId,
      rpName: "",
      user: { id: "AQ", name: "", displayName: "" },
      challenge: "AA",
      algorithms: [-7],
      exclude: [],
    };
    const vaults = [
      { idText: "a", name: "Büro", role: "edit", log: { rotationDue: false } },
      { idText: "b", name: "Kunden", role: "read", log: { rotationDue: false } },
      { idText: "c", name: "Bau", role: "admin", log: { rotationDue: true } },
    ] as unknown as Vault[];
    expect(passkeyView({ ...input, ceremony: create, vaults })).toEqual({
      kind: "create",
      vaults: [{ idText: "a", name: "Büro" }],
    });
    expect(passkeyView({ ...input, ceremony: create, vaults: vaults.slice(1) })).toEqual({
      kind: "no-vault",
    });
  });
});
