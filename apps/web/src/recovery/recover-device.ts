/**
 * The member's new device in company recovery (K-307 part c, P-13): it lost passphrase, Recovery
 * Key and Secret Key. It announces a pairing like any new device (P-04); a package it cannot open
 * with the secret from its own QR code was not made by an owner and counts as failure, so an AK the
 * server wrapped never gets in. After the owner confirmed, the device checks that the AK opens the
 * account's key block and exactly the state the owner saw, and that the company root certified the
 * key block's keys for this account. Then the member chooses a new passphrase; the device makes a
 * new Secret Key and a new Recovery Key and replaces the unlock ways, proven by the account's own
 * Ed25519 key.
 */
import type { AccountApi } from "@kennwort/client/session/api.ts";
import type { MembersApi } from "@kennwort/client/session/members-api.ts";
import type { PairingApi } from "@kennwort/client/session/pairing-api.ts";
import {
  checkRecovered,
  type Derive,
  openRecoveryPackage,
  type RecoveryPackage,
  renewUnlockWithAccountKey,
  unlockWithDevicePackage,
} from "@kennwort/core";
import { constantTimeEqual, deviceCode, randomBytes, SECRET_KEY_LENGTH } from "@kennwort/crypto";
import type { NewDevicePairing } from "../pairing/pairing.ts";
import type { NewKeys, Opened } from "../session/session.ts";

export type RecoveryPoll =
  | { state: "waiting" }
  | { state: "package"; content: RecoveryPackage; code: string }
  | { state: "confirmed"; content: RecoveryPackage; code: string; token: string }
  | { state: "failed" };

export const pollRecovery = async (
  api: Pick<PairingApi, "pollPairing">,
  pairing: NewDevicePairing,
): Promise<RecoveryPoll> => {
  const answer = await api.pollPairing(pairing.id, pairing.pollToken);
  if (!answer) return { state: "failed" };
  if (answer.state === "waiting") return answer;
  const opened = openRecoveryPackage(pairing.keys, pairing.link.secret, answer.package);
  if (!opened.ok) return { state: "failed" };
  const code = deviceCode(pairing.keys.publicKey, answer.package);
  return answer.state === "package"
    ? { state: "package", content: opened.value, code }
    : { state: "confirmed", content: opened.value, code, token: answer.token };
};

export type RecoverDeps = {
  api: Pick<AccountApi, "keys" | "replaceUnlock"> & Pick<MembersApi, "company" | "members">;
  derive?: Derive;
  random?: (length: number) => Uint8Array;
};

export type FinishError = "unreachable" | "other-account" | "uncertified" | "failed";

/** Checks the account the package opens, then new unlock ways under a new Secret Key */
export const finishRecovery = async (
  deps: RecoverDeps,
  content: RecoveryPackage,
  token: string,
  passphrase: string,
): Promise<
  { ok: true; value: { opened: Opened; keys: NewKeys } } | { ok: false; error: FinishError }
> => {
  const { api } = deps;
  const [stored, company, members] = await Promise.all([
    api.keys(token),
    api.company(token),
    api.members(token),
  ]);
  if (!stored || !company || !members) return { ok: false, error: "unreachable" };
  const unlocked = unlockWithDevicePackage(stored, content);
  if (!unlocked.ok) return { ok: false, error: "other-account" };
  const { accountKey, keyBlock } = unlocked.value;
  const { accountId } = content;
  const me = members.find((m) => constantTimeEqual(m.id, accountId));
  const checked = checkRecovered(
    keyBlock,
    accountId,
    company.rootPublicKey,
    me?.certificate ?? null,
  );
  if (!checked.ok) {
    accountKey.fill(0);
    return { ok: false, error: "uncertified" };
  }
  const secretKey = (deps.random ?? randomBytes)(SECRET_KEY_LENGTH);
  const options = deps.derive ? { derive: deps.derive } : {};
  const renewed = renewUnlockWithAccountKey(
    accountKey,
    accountId,
    passphrase,
    secretKey,
    keyBlock.ed.secretKey,
    options,
  );
  if (!(await api.replaceUnlock(token, renewed.upload))) {
    // Not opened after all: AK does not linger in memory
    accountKey.fill(0);
    return { ok: false, error: "failed" };
  }
  return {
    ok: true,
    value: {
      opened: { ...unlocked.value, accountId, token },
      keys: { accountId, secretKey, recoveryKey: renewed.recoveryKey },
    },
  };
};
