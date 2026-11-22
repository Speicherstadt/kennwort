/**
 * The calls of company recovery (K-307 part c, P-13); every answer is parsed before it is used, and
 * none of them is trusted: the policy, the fingerprint and the signatures are checked by the caller.
 */
import {
  type ClientAction,
  depositToWire,
  encodeBytes,
  HeldDepositWire,
  type Policy,
  type RecoveryBundle,
  RecoveryBundleWire,
  RecoveryGrantWire,
  recoveryKeyToWire,
} from "@kennwort/core";
import type { Deposit } from "@kennwort/crypto";
import type { Call } from "./api.ts";

export const recoveryCalls = (call: Call) => ({
  /** An owner's new recovery key with a grant for every owner and the policy naming it */
  saveRecoveryKey: async (
    token: string,
    policy: Policy,
    publicKey: Uint8Array,
    grants: { accountId: Uint8Array; grant: Uint8Array }[],
  ) =>
    (
      await call(
        "PUT",
        "/api/company/recovery-key",
        recoveryKeyToWire(policy, publicKey, grants),
        token,
      )
    ).status === 200,
  /** The recovery key wrapped to this owner */
  recoveryGrant: async (token: string) => {
    const answer = await call("GET", "/api/account/recovery-grant", undefined, token);
    const parsed = RecoveryGrantWire.safeParse(answer.json);
    return answer.status === 200 && parsed.success ? parsed.data.recoveryGrant : undefined;
  },
  /** This account's deposit as the server holds it; undefined when it holds none */
  heldDeposit: async (token: string): Promise<Deposit | undefined> => {
    const answer = await call("GET", "/api/account/recovery-deposit", undefined, token);
    const parsed = HeldDepositWire.safeParse(answer.json);
    return answer.status === 200 && parsed.success ? parsed.data.deposit : undefined;
  },
  saveDeposit: async (token: string, deposit: Deposit) =>
    (await call("PUT", "/api/account/recovery-deposit", depositToWire(deposit), token)).status ===
    200,
  /** What an owner needs to recover a member: the deposit and the sealed key block and state */
  memberRecovery: async (
    token: string,
    accountId: Uint8Array,
  ): Promise<RecoveryBundle | undefined> => {
    const answer = await call(
      "GET",
      `/api/members/${encodeBytes(accountId)}/recovery`,
      undefined,
      token,
    );
    const parsed = RecoveryBundleWire.safeParse(answer.json);
    return answer.status === 200 && parsed.success ? parsed.data : undefined;
  },
  /** The owner answers the member's new device with the recovery package (P-04 pairing) */
  answerRecovery: async (
    token: string,
    pairingId: string,
    pkg: Uint8Array,
    accountId: Uint8Array,
  ) =>
    (
      await call(
        "PUT",
        `/api/pairings/${encodeURIComponent(pairingId)}`,
        { package: encodeBytes(pkg), accountId: encodeBytes(accountId) },
        token,
      )
    ).status === 200,
  /** A client action the client signs itself into the audit log (P-20) */
  auditAction: async (
    token: string,
    action: ClientAction,
    subject: string,
    signature: Uint8Array,
  ) =>
    (
      await call(
        "POST",
        "/api/audit",
        { action, subject, signature: encodeBytes(signature) },
        token,
      )
    ).status === 201,
});

export type RecoveryApi = ReturnType<typeof recoveryCalls>;
