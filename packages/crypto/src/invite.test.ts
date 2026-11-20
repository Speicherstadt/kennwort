import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { INVITE_MAC_LENGTH, inviteMac, verifyInviteMac } from "./invite.ts";
import { hex } from "./test-helpers.ts";

// P-08: the vector was computed with HKDF-SHA-512 and HMAC-SHA-512 from node:crypto over enc()
const secret = new Uint8Array(32).fill(0x31);
const invitationId = new Uint8Array(16).fill(0x32);
const invited = {
  accountId: new Uint8Array(16).fill(1),
  xwingPublicKey: new Uint8Array(1216).fill(2),
  edPublicKey: new Uint8Array(32).fill(3),
};

describe("inviteMac", () => {
  it("matches the vector", () => {
    expect(hex(inviteMac(secret, invitationId, invited))).toBe(
      "0d77121768ad9f95eb690bb2a17662c82a447d6045df4bd8f0d798fcf63aa5ad" +
        "6736bebbe7cdde46e0732bbd9d1a187c3895e39e7ea7f8bc6e67ab6dfa8b0952",
    );
    expect(inviteMac(secret, invitationId, invited)).toHaveLength(INVITE_MAC_LENGTH);
  });

  it("accepts its own MAC and refuses one of another length", () => {
    const mac = inviteMac(secret, invitationId, invited);
    expect(verifyInviteMac(secret, invitationId, invited, mac)).toBe(true);
    expect(verifyInviteMac(secret, invitationId, invited, mac.subarray(0, 32))).toBe(false);
    expect(verifyInviteMac(secret, invitationId, invited, new Uint8Array())).toBe(false);
  });

  it("refuses the MAC after any change of secret, invitation or bundle", () => {
    const bytes = (length: number) => fc.uint8Array({ minLength: length, maxLength: length });
    fc.assert(
      fc.property(
        fc.constantFrom("secret", "invitationId", "accountId", "xwingPublicKey", "edPublicKey"),
        fc.nat(),
        bytes(1).filter(([b]) => b !== 0),
        (field, at, [flip]) => {
          const mac = inviteMac(secret, invitationId, invited);
          const all = { secret, invitationId, ...invited };
          const changed = Uint8Array.from(all[field]);
          const index = at % changed.length;
          changed[index] = (changed[index] ?? 0) ^ (flip ?? 1);
          const next = { ...all, [field]: changed };
          const { secret: s, invitationId: id, ...bundle } = next;
          expect(verifyInviteMac(s, id, bundle, mac)).toBe(false);
        },
      ),
    );
  });

  it("does not let bytes move between the bundle's parts", () => {
    const mac = inviteMac(secret, invitationId, invited);
    const shifted = {
      accountId: new Uint8Array(15).fill(1),
      xwingPublicKey: Uint8Array.of(1, ...new Uint8Array(1216).fill(2)),
      edPublicKey: invited.edPublicKey,
    };
    expect(verifyInviteMac(secret, invitationId, shifted, mac)).toBe(false);
  });
});
