/**
 * Company recovery on the wire (K-307 part c, P-13): what client and server exchange, parsed by Zod
 * at both ends. The server keeps it and checks what it can; the clients check the rest.
 */
import type { Deposit } from "@kennwort/crypto";
import { z } from "zod";
import { bytes, encodeBytes } from "../sync/bytes.ts";
import { type Policy, PolicyWire, policyToWire } from "./policy.ts";
import { RECOVERY_GRANT_LENGTH } from "./recovery-key.ts";

/** A deposit's package: version, X-Wing ciphertext and the box around AK (F-02) */
export const DEPOSIT_PACKAGE_LENGTH = 1 + 1120 + 1 + 24 + 32 + 16;

export const DepositWire = z.object({
  pkg: bytes(DEPOSIT_PACKAGE_LENGTH),
  commitment: bytes(32),
  signature: bytes(65),
});

export const depositToWire = (deposit: Deposit) => ({
  pkg: encodeBytes(deposit.pkg),
  commitment: encodeBytes(deposit.commitment),
  signature: encodeBytes(deposit.signature),
});

/** GET /api/account/recovery-deposit: the account's own deposit, if the server holds one */
export const HeldDepositWire = z.object({ deposit: DepositWire });

/** GET /api/members/:id/recovery: what an owner needs to recover that member */
export const RecoveryBundleWire = z.object({
  deposit: DepositWire,
  keyBlock: bytes(),
  state: bytes(),
  stateCounter: z.number().int().nonnegative(),
});

/** GET /api/account/recovery-grant: the recovery key wrapped to this owner */
export const RecoveryGrantWire = z.object({ recoveryGrant: bytes(RECOVERY_GRANT_LENGTH) });

/** PUT /api/company/recovery-key: a new key, its grant for every owner and the policy naming it */
export const RecoveryKeyUpload = z.object({
  policy: PolicyWire,
  publicKey: bytes(1216),
  grants: z.array(z.object({ accountId: bytes(16), grant: bytes(RECOVERY_GRANT_LENGTH) })).min(1),
});

export const recoveryKeyToWire = (
  policy: Policy,
  publicKey: Uint8Array,
  grants: { accountId: Uint8Array; grant: Uint8Array }[],
) => ({
  policy: policyToWire(policy),
  publicKey: encodeBytes(publicKey),
  grants: grants.map((g) => ({ accountId: encodeBytes(g.accountId), grant: encodeBytes(g.grant) })),
});
