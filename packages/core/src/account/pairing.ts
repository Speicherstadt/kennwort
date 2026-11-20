/**
 * Adding a device (P-04): the unlocked device wraps AK, the account ID, the Secret Key and the
 * hash of the account state it holds to the new device's one-time X-Wing key (F-02, purpose
 * `device`). The new device accepts the state the server gives it only when its hash matches, so it
 * takes over the checked root key and trusts no one on first contact. The Secret Key travels too,
 * so the new device can later unlock with the passphrase like any other.
 */
import {
  constantTimeEqual,
  decode,
  deviceFingerprint,
  digest,
  encode,
  unwrap,
  wrap,
} from "@kennwort/crypto";
import { err, ok, type Result } from "../result.ts";
import { type Stored, type Unlocked, unlockWithAccountKey } from "./unlock.ts";

export type DevicePackage = {
  accountKey: Uint8Array;
  accountId: Uint8Array;
  secretKey: Uint8Array;
  stateHash: Uint8Array;
};

const DEVICE = { purpose: "device", context: [] };
const LENGTHS = [32, 16, 16, 32] as const;

/** The hash the package carries: of the sealed account state, as the server stores it */
export const stateHash = (sealedState: Uint8Array) => digest(sealedState);

export const sealDevicePackage = (oneTimePublicKey: Uint8Array, content: DevicePackage) =>
  wrap(
    { publicKey: oneTimePublicKey, fingerprint: deviceFingerprint(oneTimePublicKey) },
    encode(content.accountKey, content.accountId, content.secretKey, content.stateHash),
    DEVICE,
  );

export const openDevicePackage = (
  oneTimeSecretKey: Uint8Array,
  oneTimePublicKey: Uint8Array,
  pkg: Uint8Array,
): Result<DevicePackage, "not-authentic" | "malformed"> => {
  const opened = unwrap(oneTimeSecretKey, deviceFingerprint(oneTimePublicKey), pkg, DEVICE);
  if (!opened.ok) return err("not-authentic");
  const parts = decode(opened.value);
  if (!parts.ok || parts.value.length !== 4 || parts.value.some((p, i) => p.length !== LENGTHS[i]))
    return err("malformed");
  const [accountKey, accountId, secretKey, hash] = parts.value as [
    Uint8Array,
    Uint8Array,
    Uint8Array,
    Uint8Array,
  ];
  return ok({ accountKey, accountId, secretKey, stateHash: hash });
};

/**
 * The new device's first unlock: the ciphertexts the server gives must be of the account in the
 * package and hold exactly the state the unlocked device had, else another state is slipped in
 */
export const unlockWithDevicePackage = (
  stored: Stored,
  content: DevicePackage,
): Result<Unlocked, "other-account" | "other-state" | "damaged"> => {
  if (!constantTimeEqual(stored.accountId, content.accountId)) return err("other-account");
  if (!constantTimeEqual(stateHash(stored.state), content.stateHash)) return err("other-state");
  const unlocked = unlockWithAccountKey(content.accountKey, stored);
  return unlocked.ok ? unlocked : err("damaged");
};
