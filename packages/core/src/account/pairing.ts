/**
 * Adding a device (P-04): the unlocked device wraps AK, the account ID, the Secret Key and the
 * hash of the account state it holds to the new device's one-time X-Wing key (F-02, purpose
 * `device`). The new device accepts the state the server gives it only when its hash matches, so it
 * takes over the checked root key and trusts no one on first contact. The Secret Key travels too,
 * so the new device can later unlock with the passphrase like any other.
 *
 * Company recovery (P-13) uses the same pairing: an owner wraps the employee's AK, account ID and
 * the hash of the employee's sealed state (purpose `recovery-device`, no Secret Key, which the owner
 * never knew); the new device makes a new Secret Key and new unlock ways.
 *
 * The wrap's context holds the pairing secret from the QR code, which the server never sees: a
 * package the server made itself does not open, however long it grinds for a matching comparison
 * code (review of K-303; F-02 says nothing about who wrapped).
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
/** What an owner hands the employee's new device in company recovery (P-13) */
export type RecoveryPackage = Omit<DevicePackage, "secretKey">;

export const PAIRING_SECRET_LENGTH = 32;
const DEVICE_LENGTHS = [32, 16, 16, 32] as const;
const RECOVERY_LENGTHS = [32, 16, 32] as const;
/** Version, X-Wing ciphertext, then the box around the three parts of a recovery package */
export const RECOVERY_PACKAGE_LENGTH = 1 + 1120 + 1 + 24 + (3 * 4 + 80) + 16;

const pairingContext = (purpose: string, pairingSecret: Uint8Array) => {
  if (pairingSecret.length !== PAIRING_SECRET_LENGTH)
    throw new RangeError("pairing secret must be 32 bytes");
  return { purpose, context: [pairingSecret] };
};

const sealParts = (
  purpose: string,
  oneTimePublicKey: Uint8Array,
  pairingSecret: Uint8Array,
  parts: Uint8Array[],
) =>
  wrap(
    { publicKey: oneTimePublicKey, fingerprint: deviceFingerprint(oneTimePublicKey) },
    encode(...parts),
    pairingContext(purpose, pairingSecret),
  );

type OpenError = "not-authentic" | "malformed";

/** The parts of a package of this purpose, each of its exact length */
const openParts = (
  purpose: string,
  lengths: readonly number[],
  keys: { secretKey: Uint8Array; publicKey: Uint8Array },
  pairingSecret: Uint8Array,
  pkg: Uint8Array,
): Result<Uint8Array[], OpenError> => {
  const fingerprint = deviceFingerprint(keys.publicKey);
  const opened = unwrap(keys.secretKey, fingerprint, pkg, pairingContext(purpose, pairingSecret));
  if (!opened.ok) return err("not-authentic");
  const parts = decode(opened.value);
  if (
    !parts.ok ||
    parts.value.length !== lengths.length ||
    parts.value.some((p, i) => p.length !== lengths[i])
  )
    return err("malformed");
  return ok(parts.value);
};

/** The hash the package carries: of the sealed account state, as the server stores it */
export const stateHash = (sealedState: Uint8Array) => digest(sealedState);

export const sealDevicePackage = (
  oneTimePublicKey: Uint8Array,
  pairingSecret: Uint8Array,
  content: DevicePackage,
) =>
  sealParts("device", oneTimePublicKey, pairingSecret, [
    content.accountKey,
    content.accountId,
    content.secretKey,
    content.stateHash,
  ]);

export const openDevicePackage = (
  oneTimeSecretKey: Uint8Array,
  oneTimePublicKey: Uint8Array,
  pairingSecret: Uint8Array,
  pkg: Uint8Array,
): Result<DevicePackage, OpenError> => {
  const keys = { secretKey: oneTimeSecretKey, publicKey: oneTimePublicKey };
  const parts = openParts("device", DEVICE_LENGTHS, keys, pairingSecret, pkg);
  if (!parts.ok) return parts;
  const [accountKey, accountId, secretKey, hash] = parts.value as [
    Uint8Array,
    Uint8Array,
    Uint8Array,
    Uint8Array,
  ];
  return ok({ accountKey, accountId, secretKey, stateHash: hash });
};

/** The owner's side of company recovery (P-13): the employee's AK to its new device */
export const sealRecoveryPackage = (
  oneTimePublicKey: Uint8Array,
  pairingSecret: Uint8Array,
  content: RecoveryPackage,
) =>
  sealParts("recovery-device", oneTimePublicKey, pairingSecret, [
    content.accountKey,
    content.accountId,
    content.stateHash,
  ]);

export const openRecoveryPackage = (
  keys: { secretKey: Uint8Array; publicKey: Uint8Array },
  pairingSecret: Uint8Array,
  pkg: Uint8Array,
): Result<RecoveryPackage, OpenError> => {
  const parts = openParts("recovery-device", RECOVERY_LENGTHS, keys, pairingSecret, pkg);
  if (!parts.ok) return parts;
  const [accountKey, accountId, hash] = parts.value as [Uint8Array, Uint8Array, Uint8Array];
  return ok({ accountKey, accountId, stateHash: hash });
};

/**
 * The new device's first unlock: the ciphertexts the server gives must be of the account in the
 * package and hold exactly the state the unlocked device (or the recovering owner) had, else
 * another state is slipped in
 */
export const unlockWithDevicePackage = (
  stored: Stored,
  content: RecoveryPackage,
): Result<Unlocked, "other-account" | "other-state" | "damaged"> => {
  if (!constantTimeEqual(stored.accountId, content.accountId)) return err("other-account");
  if (!constantTimeEqual(stateHash(stored.state), content.stateHash)) return err("other-state");
  const unlocked = unlockWithAccountKey(content.accountKey, stored);
  return unlocked.ok ? unlocked : err("damaged");
};
