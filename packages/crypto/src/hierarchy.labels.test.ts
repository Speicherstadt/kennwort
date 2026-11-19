import { hkdfSync } from "node:crypto";
import sodium from "libsodium-wrappers-sumo";
import { beforeAll, describe, expect, it } from "vitest";
import { openAccountKey, openKeyBlock, passkeyUnlockKey } from "./account.ts";
import { encode, type Part } from "./encoding.ts";
import { hex } from "./test-helpers.ts";
import { openEntry, openEntryKey, pad, vaultKeyCommitment } from "./vault.ts";

// Every label of the key hierarchy, checked against boxes sealed by libsodium and HKDF from
// node:crypto, so a changed label shows as a failing test (docs/sicherheitsdesign.md, F-01, F-04)
beforeAll(() => sodium.ready);

const key = new Uint8Array(32).fill(0x11);
const id = (byte: number) => new Uint8Array(16).fill(byte);
const nonce = new Uint8Array(24).fill(0x42);
const sodiumBox = (k: Uint8Array, plaintext: Uint8Array, purpose: string, context: Part[]) =>
  Uint8Array.of(
    1,
    ...nonce,
    ...sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      plaintext,
      encode("kennwort/box/v1", purpose, ...context),
      null,
      nonce,
      k,
    ),
  );
const nodeKdf = (ikm: Uint8Array, salt: Uint8Array, ...info: Part[]) =>
  hex(new Uint8Array(hkdfSync("sha512", ikm, salt, encode(...(info as [Part])), 32)));

describe("labels of the key hierarchy", () => {
  const account = id(1);
  const accountKey = new Uint8Array(32).fill(0x22);

  it("passkey unlock key: kennwort/unlock-passkey/v1", () => {
    const prf = new Uint8Array(32).fill(3);
    const salt = new Uint8Array(32).fill(4);
    expect(hex(passkeyUnlockKey(prf, salt, id(5)))).toBe(
      nodeKdf(prf, salt, "kennwort/unlock-passkey/v1", id(5)),
    );
  });

  it("Account Key box: purpose account-key with account, path and credential", () => {
    const recovery = sodiumBox(key, accountKey, "account-key", [account, "recovery"]);
    expect(openAccountKey(key, recovery, account, { kind: "recovery" }).ok).toBe(true);
    const passphrase = sodiumBox(key, accountKey, "account-key", [account, "passphrase"]);
    expect(openAccountKey(key, passphrase, account, { kind: "passphrase" }).ok).toBe(true);
    const passkey = sodiumBox(key, accountKey, "account-key", [account, "passkey", id(9)]);
    expect(openAccountKey(key, passkey, account, { kind: "passkey", credentialId: id(9) }).ok).toBe(
      true,
    );
  });

  it("key block box: purpose key-block with the account", () => {
    const content = encode(
      new Uint8Array(32).fill(1),
      new Uint8Array(32).fill(2),
      new Uint8Array(32).fill(3),
    );
    expect(openKeyBlock(key, account, sodiumBox(key, content, "key-block", [account])).ok).toBe(
      true,
    );
  });

  it("vault key commitment: kennwort/key-commit/v1, vault-key, vault and epoch", () => {
    expect(hex(vaultKeyCommitment(key, { vaultId: id(6), epoch: 4 }))).toBe(
      nodeKdf(key, new Uint8Array(), "kennwort/key-commit/v1", "vault-key", id(6), 4),
    );
  });

  it("entry key box: purpose entry-key with vault, entry and epoch", () => {
    const at = { vaultId: id(6), entryId: id(7), epoch: 4 };
    expect(
      openEntryKey(key, sodiumBox(key, accountKey, "entry-key", [id(6), id(7), 4]), at).ok,
    ).toBe(true);
  });

  it("entry box: purpose entry with vault, entry and version, content padded", () => {
    const at = { vaultId: id(6), entryId: id(7), epoch: 4 };
    const content = new TextEncoder().encode("WLAN Büro");
    const sealed = sodiumBox(key, pad(content), "entry", [id(6), id(7), 12]);
    expect(openEntry(key, sealed, at, 12)).toEqual({ ok: true, value: content });
  });
});
