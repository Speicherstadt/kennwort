/**
 * Creating a vault and changing its members (P-05, P-06), as a manager's client does it: each step
 * is a log entry the manager signs, and for a new member the vault key of the epoch wrapped to the
 * member's certified bundle (F-02). verifyLog checks every entry these functions make; the server
 * only stores them. Removing a member without a new vault key leaves the old key with them, which
 * the key rotation (rotation.ts, P-11) ends.
 */
import {
  type KeyBlock,
  keyBlockFingerprint,
  newVaultKey,
  randomBytes,
  unwrapVaultKey,
  vaultKeyCommitment,
  wrapVaultKey,
} from "@kennwort/crypto";
import { err, ok, type Result } from "../result.ts";
import { type Certificate, certificateFingerprint } from "./certificate.ts";
import {
  GENESIS_HASH,
  type LogEntry,
  type LogFields,
  signEntry,
  type VaultRole,
} from "./log-entry.ts";
import type { LogState } from "./verify-log.ts";

export type Signer = { accountId: Uint8Array; edSecretKey: Uint8Array };
export type Keyring = { vaultId: Uint8Array; epoch: number; vaultKey: Uint8Array };

/** The vault key of an epoch wrapped to a member's certified bundle */
export const wrapTo = (member: Certificate, ring: Keyring) =>
  wrapVaultKey(
    { publicKey: member.xwingPublicKey, fingerprint: certificateFingerprint(member) },
    member.accountId,
    ring.vaultKey,
    { vaultId: ring.vaultId, epoch: ring.epoch },
  );

/** Where the next entry goes: after the newest one, which it also names as last seen (E-08) */
export const nextLink = (state: LogState) => ({
  seq: state.seq + 1,
  prevHash: state.hash,
  lastSeen: state.hash,
});

export type NewVault = { ring: Keyring; genesis: LogEntry; wrappedKey: Uint8Array };

/** A new vault with its creator as manager; the vault ID is the client's to pick */
export const createVault = (
  signer: Signer,
  me: Certificate,
  time: number,
  random: (length: number) => Uint8Array = randomBytes,
): NewVault => {
  const ring = { vaultId: random(16), epoch: 0, vaultKey: newVaultKey() };
  const genesis = signEntry(signer.edSecretKey, {
    vaultId: ring.vaultId,
    seq: 0,
    prevHash: GENESIS_HASH,
    epoch: 0,
    action: "create",
    accountId: signer.accountId,
    fingerprint: certificateFingerprint(me),
    role: "manage",
    validUntil: 0,
    vkCommitment: vaultKeyCommitment(ring.vaultKey, ring),
    time,
    signerId: signer.accountId,
    lastSeen: new Uint8Array(),
  });
  return { ring, genesis, wrappedKey: wrapTo(me, ring) };
};

export type Access = { role: VaultRole; validUntil: number };

/** A new member with a role, optionally until a time (Unix seconds; 0 for none) */
export const addMember = (
  signer: Signer,
  state: LogState,
  ring: Keyring,
  member: Certificate,
  access: Access,
  time: number,
) => ({
  entry: signEntry(signer.edSecretKey, {
    vaultId: ring.vaultId,
    ...nextLink(state),
    epoch: ring.epoch,
    action: "add",
    accountId: member.accountId,
    fingerprint: certificateFingerprint(member),
    role: access.role,
    validUntil: access.validUntil,
    vkCommitment: vaultKeyCommitment(ring.vaultKey, ring),
    time,
    signerId: signer.accountId,
  }),
  wrappedKey: wrapTo(member, ring),
});

const memberEntry = (
  signer: Signer,
  state: LogState,
  vaultId: Uint8Array,
  fields: Pick<LogFields, "action" | "accountId" | "role" | "validUntil">,
  time: number,
) =>
  signEntry(signer.edSecretKey, {
    vaultId,
    ...nextLink(state),
    epoch: state.epoch,
    fingerprint: new Uint8Array(),
    vkCommitment: new Uint8Array(),
    time,
    signerId: signer.accountId,
    ...fields,
  });

/** Another role or time limit for a member */
export const changeAccess = (
  signer: Signer,
  state: LogState,
  vaultId: Uint8Array,
  accountId: Uint8Array,
  access: Access,
  time: number,
) => memberEntry(signer, state, vaultId, { action: "role", accountId, ...access }, time);

/** A member leaves the vault's log; the key rotation that ends their access follows (P-11) */
export const removeMember = (
  signer: Signer,
  state: LogState,
  vaultId: Uint8Array,
  accountId: Uint8Array,
  time: number,
) =>
  memberEntry(
    signer,
    state,
    vaultId,
    { action: "remove", accountId, role: "", validUntil: 0 },
    time,
  );

export type OpenKeyError = "no-epoch" | "not-authentic" | "not-committed";

/**
 * The vault key of an epoch, unwrapped with this account's key block and taken only if it matches
 * the commitment the checked log signed for that epoch (E-16)
 */
export const openVaultKey = (
  keyBlock: KeyBlock,
  accountId: Uint8Array,
  state: LogState,
  vaultId: Uint8Array,
  epoch: number,
  wrapped: Uint8Array,
): Result<Keyring, OpenKeyError> => {
  const commitment = state.commitments.get(epoch);
  if (!commitment) return err("no-epoch");
  const opened = unwrapVaultKey(
    {
      secretKey: keyBlock.xwing.secretKey,
      fingerprint: keyBlockFingerprint(keyBlock),
      memberId: accountId,
    },
    wrapped,
    { vaultId, epoch },
    commitment,
  );
  return opened.ok ? ok({ vaultId, epoch, vaultKey: opened.value }) : opened;
};
