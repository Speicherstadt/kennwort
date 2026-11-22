import { deviceFingerprint, encode, wrap, xwingKeyPair } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import {
  openRecoveryPackage,
  RECOVERY_PACKAGE_LENGTH,
  sealDevicePackage,
  sealRecoveryPackage,
} from "./pairing.ts";

// P-13: the package an owner hands the employee's new device, bound to the QR code's secret
const k = (n: number, fill = 0) => new Uint8Array(n).fill(fill);
const content = { accountKey: k(32, 1), accountId: k(16, 2), stateHash: k(32, 3) };
const device = xwingKeyPair();
const secret = k(32, 0x5a);
const to = { publicKey: device.publicKey, fingerprint: deviceFingerprint(device.publicKey) };

describe("the recovery package", () => {
  it("opens with the one-time key and the pairing secret and holds what was put in", () => {
    const pkg = sealRecoveryPackage(device.publicKey, secret, content);
    expect(pkg).toHaveLength(RECOVERY_PACKAGE_LENGTH);
    expect(openRecoveryPackage(device, secret, pkg)).toEqual({ ok: true, value: content });
    expect(openRecoveryPackage(xwingKeyPair(), secret, pkg)).toEqual({
      ok: false,
      error: "not-authentic",
    });
  });

  it("refuses an AK the server wrapped to the device's key without the secret from the QR code", () => {
    const payload = encode(content.accountKey, content.accountId, content.stateHash);
    for (const forged of [
      wrap(to, payload, { purpose: "recovery-device", context: [k(32, 1)] }),
      wrap(to, payload, { purpose: "recovery-device", context: [] }),
      sealRecoveryPackage(device.publicKey, k(32, 1), content),
    ])
      expect(openRecoveryPackage(device, secret, forged)).toEqual({
        ok: false,
        error: "not-authentic",
      });
  });

  it("is not a device package, nor a device package a recovery package", () => {
    const asDevice = sealDevicePackage(device.publicKey, secret, { ...content, secretKey: k(16) });
    expect(openRecoveryPackage(device, secret, asDevice)).toEqual({
      ok: false,
      error: "not-authentic",
    });
  });

  it("refuses a package of the wrong shape", () => {
    const wrapped = (...parts: Uint8Array[]) =>
      wrap(to, encode(...parts), { purpose: "recovery-device", context: [secret] });
    for (const pkg of [
      wrapped(k(32), k(16)),
      wrapped(k(32), k(16), k(32), k(1)),
      wrapped(k(31), k(16), k(32)),
      wrapped(k(32), k(17), k(32)),
      wrapped(k(32), k(16), k(31)),
      wrap(to, Uint8Array.of(0, 0, 0, 9), { purpose: "recovery-device", context: [secret] }),
    ])
      expect(openRecoveryPackage(device, secret, pkg)).toEqual({ ok: false, error: "malformed" });
  });

  it("takes only a 32-byte pairing secret", () => {
    expect(() => sealRecoveryPackage(device.publicKey, k(31), content)).toThrow(RangeError);
  });
});
