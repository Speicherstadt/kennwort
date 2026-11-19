import { describe, expect, it } from "vitest";
import {
  ACCOUNT_KEY_LENGTH,
  keyBlockFingerprint,
  newAccountKey,
  newKeyBlock,
  newRecoveryKey,
  openAccountKey,
  openKeyBlock,
  passkeyUnlockKey,
  sealAccountKey,
  sealKeyBlock,
  type UnlockPath,
} from "./account.ts";
import { seal } from "./box.ts";
import { encode } from "./encoding.ts";
import { bundleFingerprint } from "./fingerprint.ts";
import { passphraseKeysWith } from "./passphrase.ts";
import { formatRecoveryKey, parseRecoveryKey } from "./secret-key.ts";
import { hex } from "./test-helpers.ts";

const account = new Uint8Array(16).fill(0xa1);
const other = new Uint8Array(16).fill(0xa2);
const root = new Uint8Array(32).fill(0x77);
const accountKey = newAccountKey();
const quick = { m: 8, t: 1, p: 1 };

describe("Account Key and key block", () => {
  it("draws a fresh 32-byte Account Key each time", () => {
    expect(accountKey.length).toBe(ACCOUNT_KEY_LENGTH);
    expect(hex(newAccountKey())).not.toBe(hex(accountKey));
  });

  const block = newKeyBlock(root);
  const sealed = sealKeyBlock(accountKey, account, block);

  it("gives back the key pairs and the root fingerprint under the right AK and account", () => {
    const opened = openKeyBlock(accountKey, account, sealed);
    if (!opened.ok) throw new Error(opened.error);
    expect(hex(opened.value.xwing.publicKey)).toBe(hex(block.xwing.publicKey));
    expect(hex(opened.value.ed.publicKey)).toBe(hex(block.ed.publicKey));
    expect(hex(opened.value.rootFingerprint)).toBe(hex(root));
    expect(hex(keyBlockFingerprint(opened.value))).toBe(
      hex(bundleFingerprint(block.xwing.publicKey, block.ed.publicKey)),
    );
  });

  it("fails with another AK or for another account", () => {
    expect(openKeyBlock(newAccountKey(), account, sealed)).toEqual({
      ok: false,
      error: "not-authentic",
    });
    expect(openKeyBlock(accountKey, other, sealed)).toEqual({ ok: false, error: "not-authentic" });
  });

  it("refuses an authentic box whose content is not a key block", () => {
    const place = { purpose: "key-block", context: [account] };
    const wrong = [
      new Uint8Array(3),
      encode(new Uint8Array(32), new Uint8Array(32)),
      encode(new Uint8Array(31), new Uint8Array(32), new Uint8Array(32)),
      encode(new Uint8Array(32), new Uint8Array(33), new Uint8Array(32)),
      encode(new Uint8Array(32), new Uint8Array(32), new Uint8Array(16)),
      encode(new Uint8Array(32), new Uint8Array(32), new Uint8Array(32), new Uint8Array()),
    ];
    for (const content of wrong) {
      expect(openKeyBlock(accountKey, account, seal(accountKey, content, place))).toEqual({
        ok: false,
        error: "malformed",
      });
    }
  });
});

describe("every way to the Account Key (P-03)", () => {
  const credentialId = new Uint8Array(20).fill(5);
  const credSalt = new Uint8Array(32).fill(6);
  const prf = new Uint8Array(32).fill(7);
  const passphrase = passphraseKeysWith(
    quick,
    "korrekt Pferd",
    new Uint8Array(16),
    new Uint8Array(16).fill(1),
    account,
  );
  const recoveryKey = newRecoveryKey();

  const ways: { name: string; path: UnlockPath; key: Uint8Array; wrongKey: Uint8Array }[] = [
    {
      name: "passkey PRF",
      path: { kind: "passkey", credentialId },
      key: passkeyUnlockKey(prf, credSalt, credentialId),
      wrongKey: passkeyUnlockKey(new Uint8Array(32).fill(8), credSalt, credentialId),
    },
    {
      name: "passphrase and Secret Key",
      path: { kind: "passphrase" },
      key: passphrase.unlock,
      wrongKey: passphraseKeysWith(
        quick,
        "korrekt Pferd",
        new Uint8Array(16),
        new Uint8Array(16).fill(2),
        account,
      ).unlock,
    },
    {
      name: "recovery kit",
      path: { kind: "recovery" },
      key: recoveryKey,
      wrongKey: newRecoveryKey(),
    },
  ];

  describe.each(ways)("$name", ({ path, key, wrongKey }) => {
    const sealed = sealAccountKey(key, accountKey, account, path);

    it("opens AK with the right key", () => {
      expect(openAccountKey(key, sealed, account, path)).toEqual({ ok: true, value: accountKey });
    });

    it("fails with a wrong key, for another account or on another path", () => {
      expect(openAccountKey(wrongKey, sealed, account, path)).toEqual({
        ok: false,
        error: "not-authentic",
      });
      expect(openAccountKey(key, sealed, other, path)).toEqual({
        ok: false,
        error: "not-authentic",
      });
      const elsewhere: UnlockPath =
        path.kind === "recovery" ? { kind: "passphrase" } : { kind: "recovery" };
      expect(openAccountKey(key, sealed, account, elsewhere)).toEqual({
        ok: false,
        error: "not-authentic",
      });
    });
  });

  it("binds a passkey's AK to its credential", () => {
    const key = passkeyUnlockKey(prf, credSalt, credentialId);
    const sealed = sealAccountKey(key, accountKey, account, { kind: "passkey", credentialId });
    const another = { kind: "passkey" as const, credentialId: new Uint8Array(20).fill(9) };
    expect(openAccountKey(key, sealed, account, another)).toEqual({
      ok: false,
      error: "not-authentic",
    });
  });

  it("derives a different passkey key for another salt or credential", () => {
    const base = hex(passkeyUnlockKey(prf, credSalt, credentialId));
    expect(hex(passkeyUnlockKey(prf, new Uint8Array(32), credentialId))).not.toBe(base);
    expect(hex(passkeyUnlockKey(prf, credSalt, new Uint8Array(20)))).not.toBe(base);
  });

  it("refuses an authentic box that does not hold 32 bytes", () => {
    const place = { purpose: "account-key", context: [account, "recovery"] };
    const sealed = seal(recoveryKey, new Uint8Array(31), place);
    expect(openAccountKey(recoveryKey, sealed, account, { kind: "recovery" })).toEqual({
      ok: false,
      error: "not-authentic",
    });
  });

  it("prints the Recovery Key as R1- text and reads it back", () => {
    const text = formatRecoveryKey(recoveryKey);
    expect(text).toMatch(/^R1(-[0-9A-Z]{5}){10}-[0-9A-Z]{2}-[0-9A-Z*~$=]$/);
    expect(parseRecoveryKey(text)).toEqual({ ok: true, value: recoveryKey });
    expect(parseRecoveryKey(text.replace("R1", "K1"))).toEqual({
      ok: false,
      error: "wrong-prefix",
    });
  });
});

describe("sealing refuses what opening would refuse", () => {
  it("a root fingerprint that is not 32 bytes", () => {
    expect(() => newKeyBlock(new Uint8Array(31))).toThrow("root fingerprint must be 32 bytes");
    const block = { ...newKeyBlock(root), rootFingerprint: new Uint8Array(33) };
    expect(() => sealKeyBlock(accountKey, account, block)).toThrow(
      "root fingerprint must be 32 bytes",
    );
  });

  it("an Account Key that is not 32 bytes", () => {
    expect(() =>
      sealAccountKey(newRecoveryKey(), new Uint8Array(16), account, { kind: "recovery" }),
    ).toThrow("account key must be 32 bytes");
  });
});
