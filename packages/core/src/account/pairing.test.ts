import {
  deviceFingerprint,
  encode,
  passphraseKeysWith,
  wrap,
  xwingKeyPair,
} from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { createAccount } from "./create.ts";
import {
  openDevicePackage,
  sealDevicePackage,
  stateHash,
  unlockWithDevicePackage,
} from "./pairing.ts";
import { emptyState } from "./state.ts";

// P-04: the package a new device gets, and the checks of its first unlock
const quick = (p: string, salt: Uint8Array, key: Uint8Array, account: Uint8Array) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);
const account = createAccount(
  "Heizung Wasser Licht Kupfer",
  emptyState(new Uint8Array(32).fill(1)),
  {
    derive: quick,
  },
);
const stored = {
  accountId: account.accountId,
  accountSalt: account.upload.accountSalt,
  keyBlock: account.upload.keyBlock,
  state: account.upload.state,
  stateCounter: 0,
  unlock: account.upload.unlock,
};
const content = {
  accountKey: account.accountKey,
  accountId: account.accountId,
  secretKey: account.secretKey,
  stateHash: stateHash(account.upload.state),
};
const device = xwingKeyPair();
const secret = new Uint8Array(32).fill(0x5a);

describe("the device package", () => {
  it("opens only with the one-time key it was wrapped to, and holds what was put in", () => {
    const pkg = sealDevicePackage(device.publicKey, secret, content);
    expect(openDevicePackage(device.secretKey, device.publicKey, secret, pkg)).toEqual({
      ok: true,
      value: content,
    });
    const other = xwingKeyPair();
    expect(openDevicePackage(other.secretKey, other.publicKey, secret, pkg)).toEqual({
      ok: false,
      error: "not-authentic",
    });
    expect(openDevicePackage(device.secretKey, other.publicKey, secret, pkg)).toEqual({
      ok: false,
      error: "not-authentic",
    });
  });

  it("is bound to purpose device: a package wrapped for anything else does not open", () => {
    const to = { publicKey: device.publicKey, fingerprint: deviceFingerprint(device.publicKey) };
    const payload = encode(
      content.accountKey,
      content.accountId,
      content.secretKey,
      content.stateHash,
    );
    const elsewhere = wrap(to, payload, { purpose: "vault-key", context: [] });
    expect(openDevicePackage(device.secretKey, device.publicKey, secret, elsewhere)).toEqual({
      ok: false,
      error: "not-authentic",
    });
  });

  // Review of K-303: the server knows the one-time key and could wrap its own package to it; without
  // the pairing secret from the QR code that package does not open, whatever code it shows
  it("opens only with the pairing secret from the QR code", () => {
    const to = { publicKey: device.publicKey, fingerprint: deviceFingerprint(device.publicKey) };
    const payload = encode(
      content.accountKey,
      content.accountId,
      content.secretKey,
      content.stateHash,
    );
    const fakes = [
      wrap(to, payload, { purpose: "device", context: [] }),
      wrap(to, payload, { purpose: "device", context: [new Uint8Array(32).fill(1)] }),
      sealDevicePackage(device.publicKey, new Uint8Array(32).fill(1), content),
    ];
    for (const fake of fakes)
      expect(openDevicePackage(device.secretKey, device.publicKey, secret, fake)).toEqual({
        ok: false,
        error: "not-authentic",
      });
  });

  it("takes only a 32-byte pairing secret", () => {
    expect(() => sealDevicePackage(device.publicKey, new Uint8Array(31), content)).toThrow(
      new RangeError("pairing secret must be 32 bytes"),
    );
    expect(() =>
      openDevicePackage(device.secretKey, device.publicKey, new Uint8Array(33), new Uint8Array(1)),
    ).toThrow(RangeError);
  });

  it("refuses a package of the wrong shape", () => {
    const to = { publicKey: device.publicKey, fingerprint: deviceFingerprint(device.publicKey) };
    const wrapped = (...parts: Uint8Array[]) =>
      wrap(to, encode(...parts), { purpose: "device", context: [secret] });
    const k = (n: number) => new Uint8Array(n);
    for (const pkg of [
      wrapped(k(32), k(16), k(16)),
      wrapped(k(32), k(16), k(16), k(32), k(1)),
      wrapped(k(31), k(16), k(16), k(32)),
      wrapped(k(32), k(15), k(16), k(32)),
      wrapped(k(32), k(16), k(17), k(32)),
      wrapped(k(32), k(16), k(16), k(33)),
      wrap(to, Uint8Array.of(0, 0, 0, 9), { purpose: "device", context: [secret] }),
    ])
      expect(openDevicePackage(device.secretKey, device.publicKey, secret, pkg)).toEqual({
        ok: false,
        error: "malformed",
      });
  });
});

describe("unlockWithDevicePackage", () => {
  it("opens the account when account and state are the ones in the package", () => {
    const unlocked = unlockWithDevicePackage(stored, content);
    expect(unlocked.ok && unlocked.value.state).toEqual(account.state);
    expect(unlocked.ok && unlocked.value.keyBlock.ed.publicKey).toEqual(
      account.keyBlock.ed.publicKey,
    );
  });

  it("refuses another account, another state or ciphertexts its AK does not open", () => {
    expect(unlockWithDevicePackage({ ...stored, accountId: new Uint8Array(16) }, content)).toEqual({
      ok: false,
      error: "other-account",
    });
    expect(unlockWithDevicePackage({ ...stored, state: new Uint8Array(60) }, content)).toEqual({
      ok: false,
      error: "other-state",
    });
    expect(unlockWithDevicePackage(stored, { ...content, accountKey: new Uint8Array(32) })).toEqual(
      {
        ok: false,
        error: "damaged",
      },
    );
  });

  it("hashes the sealed state with SHA-512/256", () => {
    expect(stateHash(new Uint8Array([1, 2, 3]))).toHaveLength(32);
    expect(stateHash(new Uint8Array([1, 2, 3]))).not.toEqual(stateHash(new Uint8Array([1, 2, 4])));
  });
});
