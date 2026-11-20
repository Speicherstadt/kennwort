import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { shareKeyCommitment, unwrapShareKey, wrapShareKey } from "./share.ts";
import { xwingKeyPair } from "./wrap.ts";

// X-Wing key generation is slow in pure TypeScript; one fixed pair keeps the runs short
const pair = xwingKeyPair(new Uint8Array(32).fill(6));
const fingerprint = new Uint8Array(32).fill(7);
const id = fc.uint8Array({ minLength: 16, maxLength: 16 });
const key = fc.uint8Array({ minLength: 32, maxLength: 32 });
const runs = { numRuns: 20 };

describe("P-10 properties", () => {
  it("gives every entry key to its recipient, for exactly its entry", () => {
    fc.assert(
      fc.property(key, id, id, id, id, (entryKey, vaultId, entryId, accountId, otherEntry) => {
        const place = { vaultId, entryId };
        const pkg = wrapShareKey(
          { publicKey: pair.publicKey, fingerprint },
          accountId,
          entryKey,
          place,
        );
        const me = { secretKey: pair.secretKey, fingerprint, accountId };
        const commitment = shareKeyCommitment(entryKey, place);
        expect(unwrapShareKey(me, pkg, place, commitment)).toEqual({ ok: true, value: entryKey });
        fc.pre(Buffer.compare(entryId, otherEntry) !== 0);
        const elsewhere = { vaultId, entryId: otherEntry };
        expect(unwrapShareKey(me, pkg, elsewhere, commitment).ok).toBe(false);
        expect(unwrapShareKey(me, pkg, place, shareKeyCommitment(entryKey, elsewhere))).toEqual({
          ok: false,
          error: "not-committed",
        });
      }),
      runs,
    );
  });
});
