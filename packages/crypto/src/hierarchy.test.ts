import { describe, expect, it } from "vitest";
import {
  keyBlockFingerprint,
  newAccountKey,
  newKeyBlock,
  openAccountKey,
  openKeyBlock,
  sealAccountKey,
  sealKeyBlock,
} from "./account.ts";
import { passphraseKeysWith } from "./passphrase.ts";
import {
  newEntryKey,
  newVaultKey,
  openEntry,
  openEntryKey,
  sealEntry,
  sealEntryKey,
  unwrapVaultKey,
  vaultKeyCommitment,
  wrapVaultKey,
} from "./vault.ts";

// The whole way down, as a new device takes it: passphrase → AK → key block → vault key → entry
describe("key hierarchy from passphrase to entry", () => {
  const quick = { m: 8, t: 1, p: 1 };
  const anna = new Uint8Array(16).fill(0xa0);
  const salt = new Uint8Array(16).fill(1);
  const secretKey = new Uint8Array(16).fill(2);
  const root = new Uint8Array(32).fill(3);
  const vault = { vaultId: new Uint8Array(16).fill(0xb0), epoch: 0 };
  const entry = { ...vault, entryId: new Uint8Array(16).fill(0xe0) };
  const content = new TextEncoder().encode('{"title":"Lieferantenportal Müller GmbH"}');

  // What the server stores after account and vault were set up
  const accountKey = newAccountKey();
  const block = newKeyBlock(root);
  const unlock = passphraseKeysWith(quick, "Weber Haustechnik 2026", salt, secretKey, anna).unlock;
  const vaultKey = newVaultKey();
  const entryKey = newEntryKey();
  const stored = {
    sealedAccountKey: sealAccountKey(unlock, accountKey, anna, { kind: "passphrase" }),
    sealedKeyBlock: sealKeyBlock(accountKey, anna, block),
    vaultPackage: wrapVaultKey(
      { publicKey: block.xwing.publicKey, fingerprint: keyBlockFingerprint(block) },
      anna,
      vaultKey,
      vault,
    ),
    commitment: vaultKeyCommitment(vaultKey, vault),
    sealedEntryKey: sealEntryKey(vaultKey, entryKey, entry),
    sealedEntry: sealEntry(entryKey, content, entry, 1),
  };

  const readEntry = (passphrase: string) => {
    const key = passphraseKeysWith(quick, passphrase, salt, secretKey, anna).unlock;
    const ak = openAccountKey(key, stored.sealedAccountKey, anna, { kind: "passphrase" });
    if (!ak.ok) return ak;
    const keys = openKeyBlock(ak.value, anna, stored.sealedKeyBlock);
    if (!keys.ok) return keys;
    const me = {
      secretKey: keys.value.xwing.secretKey,
      fingerprint: keyBlockFingerprint(keys.value),
      memberId: anna,
    };
    const vk = unwrapVaultKey(me, stored.vaultPackage, vault, stored.commitment);
    if (!vk.ok) return vk;
    const ek = openEntryKey(vk.value, stored.sealedEntryKey, entry);
    if (!ek.ok) return ek;
    return openEntry(ek.value, stored.sealedEntry, entry, 1);
  };

  it("reads the entry with the right passphrase", () => {
    expect(readEntry("Weber Haustechnik 2026")).toEqual({ ok: true, value: content });
  });

  it("stops at the first level with a wrong passphrase", () => {
    expect(readEntry("Weber Haustechnik 2025")).toEqual({ ok: false, error: "not-authentic" });
  });
});
