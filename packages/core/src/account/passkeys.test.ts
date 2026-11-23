import { newAccountKey, newKeyBlock, seal, sealAccountKey, sealKeyBlock } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { encodeBytes } from "../sync/bytes.ts";
import { sealPasskeyUnlock, unlockWithPasskey, withUnlockKey } from "./passkey-unlock.ts";
import {
  activeSalt,
  addPasskey,
  mergePasskeys,
  newPasskeySalt,
  PASSKEY_SALT_LENGTH,
  passkeysToJson,
  removePasskey,
  UnlockPasskeys,
} from "./passkeys.ts";
import { type AccountState, emptyState, mergeStates, openState, sealState } from "./state.ts";
import type { Stored } from "./unlock.ts";

// K-707: Anna of Weber Haustechnik unlocks with the passkey of her laptop
const credential = new Uint8Array(20).fill(3);
const other = new Uint8Array(20).fill(4);
const credentialText = encodeBytes(credential);
const salt = new Uint8Array(32).fill(5);
const prf = new Uint8Array(32).fill(6);
const accountId = new Uint8Array(16).fill(1);
const root = new Uint8Array(32).fill(2);

const withPasskey = (state: AccountState, id = credential, s = salt) => ({
  ...state,
  passkeys: addPasskey(state.passkeys, id, s, 1000) ?? {},
});

const account = (state: AccountState = withPasskey(emptyState(root))) => {
  const accountKey = newAccountKey();
  const stored: Stored = {
    accountId,
    accountSalt: new Uint8Array(16),
    keyBlock: sealKeyBlock(accountKey, accountId, newKeyBlock(root)),
    state: sealState(accountKey, accountId, 0, state),
    stateCounter: 0,
    unlock: {
      passphrase: new Uint8Array(),
      recovery: new Uint8Array(),
      passkeys: [
        {
          credentialId: credential,
          sealed: sealPasskeyUnlock(prf, salt, credential, accountKey, accountId),
        },
      ],
    },
  };
  return { accountKey, stored };
};

describe("passkeys in the account state", () => {
  it("makes a random salt of 32 bytes", () => {
    const asked: number[] = [];
    expect(
      newPasskeySalt((length) => {
        asked.push(length);
        return new Uint8Array(length).fill(9);
      }),
    ).toEqual(new Uint8Array(32).fill(9));
    expect(asked).toEqual([32]);
    expect(PASSKEY_SALT_LENGTH).toBe(32);
    expect(newPasskeySalt()).toHaveLength(32);
    expect(newPasskeySalt()).not.toEqual(newPasskeySalt());
  });

  it("adds a passkey once, never again after its removal", () => {
    const added = addPasskey({}, credential, salt, 1000) ?? {};
    expect(added).toEqual({ [credentialText]: { salt, at: 1000 } });
    expect(addPasskey(added, credential, salt, 2000)).toBeUndefined();
    const removed = removePasskey(added, credential) ?? {};
    expect(removed).toEqual({ [credentialText]: { salt, at: 1000, removed: true } });
    expect(addPasskey(removed, credential, salt, 3000)).toBeUndefined();
    expect(removePasskey(removed, credential)).toBeUndefined();
    expect(removePasskey({}, credential)).toBeUndefined();
  });

  it("adds only a salt of 32 bytes and a credential ID", () => {
    expect(addPasskey({}, credential, new Uint8Array(31), 1)).toBeUndefined();
    expect(addPasskey({}, new Uint8Array(), salt, 1)).toBeUndefined();
    expect(addPasskey({}, credential, salt, -1)).toBeUndefined();
  });

  it("knows the salt of an active passkey only", () => {
    const added = addPasskey({}, credential, salt, 1) ?? {};
    expect(activeSalt(added, credential)).toEqual(salt);
    expect(activeSalt(added, other)).toBeUndefined();
    expect(activeSalt(removePasskey(added, credential) ?? {}, credential)).toBeUndefined();
  });

  it("merges both sides, a removal on either side wins", () => {
    const mine = addPasskey({}, credential, salt, 1) ?? {};
    const theirs = addPasskey({}, other, salt, 2) ?? {};
    expect(mergePasskeys(mine, theirs)).toEqual({ ...mine, ...theirs });
    const removed = removePasskey(mine, credential) ?? {};
    expect(mergePasskeys(mine, removed)).toEqual(removed);
    expect(mergePasskeys(removed, mine)).toEqual(removed);
  });

  it("goes through the sealed state and its merge", () => {
    const accountKey = newAccountKey();
    const state = withPasskey(emptyState(root));
    const sealed = sealState(accountKey, accountId, 0, state);
    const opened = openState(accountKey, accountId, 0, sealed);
    expect(opened.ok && opened.value.passkeys).toEqual(state.passkeys);
    const merged = mergeStates(emptyState(root), state);
    expect(merged.ok && merged.value.passkeys).toEqual(state.passkeys);
    expect(emptyState(root).passkeys).toEqual({});
    expect(JSON.parse(JSON.stringify(passkeysToJson(state.passkeys)))).toEqual({
      [credentialText]: { salt: encodeBytes(salt), at: 1000 },
    });
  });

  it("reads a state written before passkeys as one without", () => {
    const accountKey = newAccountKey();
    const old = { rootFingerprint: encodeBytes(root), bundles: {}, logs: {}, versions: {} };
    const sealed = seal(accountKey, new TextEncoder().encode(JSON.stringify(old)), {
      purpose: "account-state",
      context: [accountId, 0],
    });
    const opened = openState(accountKey, accountId, 0, sealed);
    expect(opened.ok && opened.value.passkeys).toEqual({});
  });

  it("parses only well-formed passkeys", () => {
    expect(UnlockPasskeys.safeParse({ "a+b": { salt: encodeBytes(salt), at: 1 } }).success).toBe(
      false,
    );
    expect(UnlockPasskeys.safeParse({ abc: { salt: encodeBytes(salt), at: 1 } }).success).toBe(
      true,
    );
    expect(
      UnlockPasskeys.safeParse({ abc: { salt: encodeBytes(salt), at: 1, removed: false } }).success,
    ).toBe(false);
  });
});

describe("unlocking with a passkey (P-03)", () => {
  it("overwrites the unlock key once used, also when the use throws", () => {
    let seen: Uint8Array = new Uint8Array();
    expect(
      withUnlockKey(prf, salt, credential, (key) => {
        seen = key;
        return key.some((b) => b !== 0);
      }),
    ).toBe(true);
    expect(seen).toEqual(new Uint8Array(32));
    expect(() =>
      withUnlockKey(prf, salt, credential, (key) => {
        seen = key;
        throw new Error("x");
      }),
    ).toThrow("x");
    expect(seen).toEqual(new Uint8Array(32));
  });

  it("opens the account with the PRF output", () => {
    const { accountKey, stored } = account();
    const unlocked = unlockWithPasskey(stored, credential, salt, prf);
    expect(unlocked.ok && unlocked.value.accountKey).toEqual(accountKey);
    expect(unlocked.ok && unlocked.value.keyBlock.rootFingerprint).toEqual(root);
  });

  it("fails with another PRF output, salt or credential", () => {
    const { stored } = account();
    expect(unlockWithPasskey(stored, credential, salt, new Uint8Array(32))).toEqual({
      ok: false,
      error: "wrong-key",
    });
    expect(unlockWithPasskey(stored, credential, new Uint8Array(32), prf)).toEqual({
      ok: false,
      error: "wrong-key",
    });
    expect(unlockWithPasskey(stored, other, salt, prf)).toEqual({
      ok: false,
      error: "not-set-up",
    });
  });

  it("refuses a wrapped key the server tampered with", () => {
    const { stored } = account();
    const [way] = stored.unlock.passkeys ?? [];
    const sealed = Uint8Array.from(way?.sealed ?? []);
    sealed[sealed.length - 1] = (sealed.at(-1) ?? 0) ^ 1;
    const tampered = {
      ...stored,
      unlock: { ...stored.unlock, passkeys: [{ credentialId: credential, sealed }] },
    };
    expect(unlockWithPasskey(tampered, credential, salt, prf)).toEqual({
      ok: false,
      error: "wrong-key",
    });
  });

  it("refuses a wrap the server moved to another credential ID", () => {
    const { stored } = account();
    const [way] = stored.unlock.passkeys ?? [];
    const moved = {
      ...stored,
      unlock: {
        ...stored.unlock,
        passkeys: [{ credentialId: other, sealed: way?.sealed ?? new Uint8Array() }],
      },
    };
    expect(unlockWithPasskey(moved, other, salt, prf).ok).toBe(false);
  });

  it("refuses a wrap under the passphrase's way", () => {
    const { accountKey, stored } = account();
    const key = new Uint8Array(32).fill(8);
    const passphraseWay = sealAccountKey(key, accountKey, accountId, { kind: "passphrase" });
    const swapped = {
      ...stored,
      unlock: { ...stored.unlock, passkeys: [{ credentialId: credential, sealed: passphraseWay }] },
    };
    expect(unlockWithPasskey(swapped, credential, salt, prf).ok).toBe(false);
  });

  it("refuses a passkey the account state does not name (E-01, E-03)", () => {
    const { stored } = account(emptyState(root));
    expect(unlockWithPasskey(stored, credential, salt, prf)).toEqual({
      ok: false,
      error: "unknown-way",
    });
    const removed = withPasskey(emptyState(root));
    const gone = account({
      ...removed,
      passkeys: removePasskey(removed.passkeys, credential) ?? {},
    });
    expect(unlockWithPasskey(gone.stored, credential, salt, prf)).toEqual({
      ok: false,
      error: "unknown-way",
    });
  });

  it("refuses a state that names the passkey with another salt", () => {
    const { stored } = account(withPasskey(emptyState(root), credential, new Uint8Array(32)));
    expect(unlockWithPasskey(stored, credential, salt, prf)).toEqual({
      ok: false,
      error: "unknown-way",
    });
  });

  it("refuses a damaged key block", () => {
    const { stored } = account();
    const damaged = { ...stored, keyBlock: new Uint8Array(64) };
    expect(unlockWithPasskey(damaged, credential, salt, prf)).toEqual({
      ok: false,
      error: "damaged",
    });
  });

  it("finds no way without any passkey on the server", () => {
    const { stored } = account();
    const { passkeys: _, ...unlock } = stored.unlock;
    expect(unlockWithPasskey({ ...stored, unlock }, credential, salt, prf)).toEqual({
      ok: false,
      error: "not-set-up",
    });
  });
});
