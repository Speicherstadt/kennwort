/**
 * The client's check of a membership log (P-06): the chain without gaps, every signature by a
 * certified key, every signer a manager at that point, every vault key bound by a commitment, and
 * never behind the state the client remembered. Anything else is an attack, not an update.
 */
import { constantTimeEqual, verify } from "@kennwort/crypto";
import { err, ok, type Result } from "../result.ts";
import { type Certificate, certificateFingerprint, isCertified } from "./certificate.ts";
import { entryBytes, entryHash, GENESIS_HASH, type LogEntry, type VaultRole } from "./log-entry.ts";

export type Member = { role: VaultRole; fingerprint: Uint8Array; validUntil: number };
export type LogState = {
  seq: number;
  hash: Uint8Array;
  epoch: number;
  members: Map<string, Member>;
  commitments: Map<number, Uint8Array>;
};
export type Remembered = { seq: number; hash: Uint8Array };

export type LogError =
  | "empty"
  | "bad-genesis"
  | "gap"
  | "wrong-vault"
  | "uncertified-signer"
  | "bad-signature"
  | "not-manager"
  | "uncertified-member"
  | "bad-action"
  | "bad-epoch"
  | "rollback";

export type Trust = {
  rootPublicKey: Uint8Array;
  /** Certificates by hex account ID, as the server delivers them; each is checked here */
  certificates: Map<string, Certificate>;
  now: number;
};

export const idKey = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const certificateOf = (trust: Trust, accountId: Uint8Array) => {
  const certificate = trust.certificates.get(idKey(accountId));
  return certificate && isCertified(trust.rootPublicKey, certificate) ? certificate : undefined;
};

const isManager = (state: LogState, accountId: Uint8Array, now: number) => {
  const member = state.members.get(idKey(accountId));
  return member?.role === "manage" && (member.validUntil === 0 || member.validUntil > now);
};

const genesisState = (): LogState => ({
  seq: -1,
  hash: GENESIS_HASH,
  epoch: 0,
  members: new Map(),
  commitments: new Map(),
});

/** The state after one entry, or what is wrong with the entry's meaning */
const apply = (state: LogState, entry: LogEntry, trust: Trust): Result<LogState, LogError> => {
  const members = new Map(state.members);
  const commitments = new Map(state.commitments);
  const next = { ...state, seq: entry.seq, hash: entryHash(entry), members, commitments };
  const subject = idKey(entry.accountId);
  const certifiedSubject = () => {
    const certificate = certificateOf(trust, entry.accountId);
    return (
      certificate !== undefined &&
      constantTimeEqual(certificateFingerprint(certificate), entry.fingerprint)
    );
  };
  const member = (): Member => ({
    role: entry.role as VaultRole,
    fingerprint: entry.fingerprint,
    validUntil: entry.validUntil,
  });

  switch (entry.action) {
    case "create": {
      if (entry.seq !== 0 || entry.epoch !== 0 || entry.role !== "manage")
        return err("bad-genesis");
      if (!constantTimeEqual(entry.accountId, entry.signerId)) return err("bad-genesis");
      if (!certifiedSubject()) return err("uncertified-member");
      members.set(subject, member());
      commitments.set(0, entry.vkCommitment);
      return ok(next);
    }
    case "add": {
      if (entry.role === "" || members.has(subject)) return err("bad-action");
      if (!certifiedSubject()) return err("uncertified-member");
      if (entry.epoch !== state.epoch) return err("bad-epoch");
      const current = commitments.get(state.epoch);
      if (!current || !constantTimeEqual(current, entry.vkCommitment)) return err("bad-epoch");
      members.set(subject, member());
      return ok(next);
    }
    case "role": {
      const existing = members.get(subject);
      if (!existing || entry.role === "") return err("bad-action");
      members.set(subject, { ...existing, role: entry.role, validUntil: entry.validUntil });
      return ok(next);
    }
    case "remove": {
      if (!members.delete(subject)) return err("bad-action");
      return ok(next);
    }
    case "rotate": {
      if (entry.epoch !== state.epoch + 1 || entry.vkCommitment.length === 0)
        return err("bad-epoch");
      commitments.set(entry.epoch, entry.vkCommitment);
      return ok({ ...next, epoch: entry.epoch });
    }
  }
  return err("bad-action");
};

const step = (
  state: LogState,
  entry: LogEntry,
  vaultId: Uint8Array,
  trust: Trust,
): Result<LogState, LogError> => {
  if (!constantTimeEqual(entry.vaultId, vaultId)) return err("wrong-vault");
  if (entry.seq !== state.seq + 1 || !constantTimeEqual(entry.prevHash, state.hash))
    return err(state.seq === -1 ? "bad-genesis" : "gap");
  const signer = certificateOf(trust, entry.signerId);
  if (!signer) return err("uncertified-signer");
  if (!verify(signer.edPublicKey, entry.signature, "log", entryBytes(entry)))
    return err("bad-signature");
  if (entry.action !== "create" && !isManager(state, entry.signerId, trust.now))
    return err("not-manager");
  return apply(state, entry, trust);
};

/**
 * Checks a log from its genesis. With a remembered state, the log must still contain it at the same
 * place and reach at least that far; a shorter or rewritten log is a rollback (E-07).
 */
export const verifyLog = (
  vaultId: Uint8Array,
  entries: LogEntry[],
  trust: Trust,
  remembered?: Remembered,
): Result<LogState, LogError> => {
  if (entries.length === 0) return err("empty");
  let state = genesisState();
  for (const entry of entries) {
    const next = step(state, entry, vaultId, trust);
    if (!next.ok) return next;
    state = next.value;
    if (
      remembered &&
      state.seq === remembered.seq &&
      !constantTimeEqual(state.hash, remembered.hash)
    )
      return err("rollback");
  }
  if (remembered && state.seq < remembered.seq) return err("rollback");
  return ok(state);
};

/** What a client keeps in its account state after a successful check */
export const remember = (state: LogState): Remembered => ({ seq: state.seq, hash: state.hash });

/** Whether an account may read the vault now: a member whose access has not run out */
export const isMember = (state: LogState, accountId: Uint8Array, now: number) => {
  const member = state.members.get(idKey(accountId));
  return member !== undefined && (member.validUntil === 0 || member.validUntil > now);
};
