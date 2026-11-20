/**
 * Adding a device (P-04), both sides. The new device announces a one-time key and a secret for the
 * QR code, then polls: a package it cannot open with that secret was not made by an unlocked
 * device of the account and counts as failure. The unlocked device checks the key against the
 * fingerprint from the QR code, wraps AK, account ID, Secret Key and the hash of the sealed state,
 * and both show the comparison code before anyone confirms.
 */

import type { AccountApi } from "@kennwort/client/session/api.ts";
import type { PairingApi } from "@kennwort/client/session/pairing-api.ts";
import {
  type DevicePackage,
  openDevicePackage,
  PAIRING_SECRET_LENGTH,
  sealDevicePackage,
  stateHash,
  unlockWithDevicePackage,
} from "@kennwort/core";
import {
  constantTimeEqual,
  deviceCode,
  deviceFingerprint,
  randomBytes,
  xwingKeyPair,
} from "@kennwort/crypto";
import type { Opened } from "../session/session.ts";
import type { PairingLink } from "./link.ts";

export type NewDevicePairing = {
  keys: { publicKey: Uint8Array; secretKey: Uint8Array };
  id: string;
  pollToken: string;
  link: PairingLink;
};

export const announce = async (
  api: Pick<PairingApi, "announcePairing">,
  random: (length: number) => Uint8Array = randomBytes,
): Promise<NewDevicePairing | undefined> => {
  const keys = xwingKeyPair();
  const announced = await api.announcePairing(keys.publicKey);
  if (!announced) return undefined;
  const link = {
    id: announced.id,
    fingerprint: deviceFingerprint(keys.publicKey),
    secret: random(PAIRING_SECRET_LENGTH),
  };
  return { keys, id: announced.id, pollToken: announced.pollToken, link };
};

export type PollState =
  | { state: "waiting" }
  | { state: "package"; content: DevicePackage; code: string }
  | { state: "confirmed"; content: DevicePackage; code: string; token: string }
  | { state: "failed" };

export const poll = async (
  api: Pick<PairingApi, "pollPairing">,
  pairing: NewDevicePairing,
): Promise<PollState> => {
  const answer = await api.pollPairing(pairing.id, pairing.pollToken);
  if (!answer) return { state: "failed" };
  if (answer.state === "waiting") return answer;
  const { publicKey, secretKey } = pairing.keys;
  const opened = openDevicePackage(secretKey, publicKey, pairing.link.secret, answer.package);
  if (!opened.ok) return { state: "failed" };
  const code = deviceCode(publicKey, answer.package);
  return answer.state === "package"
    ? { state: "package", content: opened.value, code }
    : { state: "confirmed", content: opened.value, code, token: answer.token };
};

/** The new device's first unlock with the session the confirmation gave it */
export const joinAccount = async (
  api: Pick<AccountApi, "keys">,
  content: DevicePackage,
  token: string,
): Promise<Opened | undefined> => {
  const stored = await api.keys(token);
  if (!stored) return undefined;
  const unlocked = unlockWithDevicePackage(stored, content);
  return unlocked.ok ? { ...unlocked.value, accountId: content.accountId, token } : undefined;
};

export type AnswerError = "gone" | "other-key" | "unexpected";

/** The unlocked device answers the pairing in the link; returns the comparison code */
export const answerPairing = async (
  api: Pick<PairingApi, "pairingKey" | "answerPairing"> & Pick<AccountApi, "keys">,
  opened: Pick<Opened, "accountKey" | "accountId" | "token">,
  secretKey: Uint8Array,
  link: PairingLink,
): Promise<{ ok: true; code: string } | { ok: false; error: AnswerError }> => {
  const publicKey = await api.pairingKey(opened.token, link.id);
  if (!publicKey) return { ok: false, error: "gone" };
  // The server hands out the key; only the fingerprint from the QR code says it is the device's
  if (!constantTimeEqual(deviceFingerprint(publicKey), link.fingerprint))
    return { ok: false, error: "other-key" };
  const stored = await api.keys(opened.token);
  if (!stored) return { ok: false, error: "unexpected" };
  const pkg = sealDevicePackage(publicKey, link.secret, {
    accountKey: opened.accountKey,
    accountId: opened.accountId,
    secretKey,
    stateHash: stateHash(stored.state),
  });
  if (!(await api.answerPairing(opened.token, link.id, pkg))) return { ok: false, error: "gone" };
  return { ok: true, code: deviceCode(publicKey, pkg) };
};
