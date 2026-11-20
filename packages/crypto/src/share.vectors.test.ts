import { hkdfSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import vectors from "../vectors/wrap-v1.json" with { type: "json" };
import { encode } from "./encoding.ts";
import { shareKeyCommitment, unwrapShareKey } from "./share.ts";
import { fromHex, hex } from "./test-helpers.ts";
import { xwingKeyPair } from "./wrap.ts";

// The F-02 vector for purpose "share" (wrap-v1.json, made by generate-wrap.ts without this code)
const vector = vectors.find((v) => v.name === "entry key shared with a recipient");
if (!vector) throw new Error("no share vector");
const [vaultId, entryId, accountId] = vector.context.map((part) =>
  fromHex((part as { hex: string }).hex),
) as [Uint8Array, Uint8Array, Uint8Array];
const place = { vaultId, entryId };
// HKDF-SHA-512 from node:crypto over enc("kennwort/key-commit/v1", "share", vault-ID, entry-ID)
const COMMITMENT = "8a17d0e6ba67cc7d43a82d322989b7fc512d9d1cbbbbed8ebaf776116e459eba";

describe("P-10 vector: entry key shared with a recipient", () => {
  it("binds the entry key as HKDF-SHA-512 does (node:crypto)", () => {
    const info = encode("kennwort/key-commit/v1", "share", vaultId, entryId);
    const payload = fromHex(vector.payload);
    const expected = new Uint8Array(hkdfSync("sha512", payload, new Uint8Array(), info, 32));
    expect(hex(expected)).toBe(COMMITMENT);
    expect(hex(shareKeyCommitment(payload, place))).toBe(COMMITMENT);
  });

  it("unwraps the vector's package for its recipient against the binding", () => {
    const me = {
      secretKey: xwingKeyPair(fromHex(vector.seed)).secretKey,
      fingerprint: fromHex(vector.fingerprint),
      accountId,
    };
    const opened = unwrapShareKey(me, fromHex(vector.package), place, fromHex(COMMITMENT));
    expect(opened.ok && hex(opened.value)).toBe(vector.payload);
  });
});
