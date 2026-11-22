import { ed25519KeyPair, verify } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { KEY_BLOCK_PURPOSE, keyBlockFields, proveKeyBlock } from "./key-block-proof.ts";

describe("the proof over a key block written anew (P-07)", () => {
  const ed = ed25519KeyPair(new Uint8Array(32).fill(3));
  const sealed = new Uint8Array(149).fill(4);

  it("is the account's own signature over the account and exactly this block, for its own purpose", () => {
    const proof = proveKeyBlock(ed.secretKey, "anna", sealed);
    expect(KEY_BLOCK_PURPOSE).toBe("key-block");
    expect(verify(ed.publicKey, proof, KEY_BLOCK_PURPOSE, ...keyBlockFields("anna", sealed))).toBe(
      true,
    );
    expect(verify(ed.publicKey, proof, KEY_BLOCK_PURPOSE, ...keyBlockFields("max", sealed))).toBe(
      false,
    );
    const other = sealed.slice();
    other[0] = 5;
    expect(verify(ed.publicKey, proof, KEY_BLOCK_PURPOSE, ...keyBlockFields("anna", other))).toBe(
      false,
    );
    expect(
      verify(ed.publicKey, proof, "unlock-renewal-account", ...keyBlockFields("anna", sealed)),
    ).toBe(false);
  });
});
