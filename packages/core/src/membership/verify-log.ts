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
  /** Signed time of the newest entry */
  time: number;
  hash: Uint8Array;
  epoch: number;
  members: Map<string, Member>;
  commitments: Map<number, Uint8Array>;
  /**
   * Someone left in this epoch and still holds its vault key: no new secret belongs under it until
   * a rotation (P-11); a log that stops here may be a server withholding the rotation (E-26)
   */
  rotationDue: boolean;
  /**
   * Members the log still names with a bundle their account has replaced (P-12, K-307 part e), hex
   * as members are keyed: whoever has the old keys holds this epoch's vault key, so nothing new is
   * written until a `rekey` entry names the new bundle and a rotation follows
   */
  superseded: string[];
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
  | "rollback"
  | "fork"
  | "bad-time";

export type Trust = {
  rootPublicKey: Uint8Array;
  /** Certificates by hex account ID, as the server delivers them; each is checked here */
  certificates: Map<string, Certificate>;
  /**
   * Earlier certificates of accounts that renewed their keys (P-12), by hex account ID: the logs
   * and records their old keys signed must still verify. Each is checked here too.
   */
  history?: Map<string, Certificate[]>;
  now: number;
};

/**
 * Clocks of devices and server differ a little: an entry may be signed this far ahead of the
 * checker's clock. The server checks with the same rule, so it stores nothing a client rejects.
 */
export const CLOCK_SKEW_SECONDS = 300;

export const idKey = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

/** The account's certificate, only if the company root signed it for exactly this account */
export const certificateOf = (trust: Trust, accountId: Uint8Array) => {
  const certificate = trust.certificates.get(idKey(accountId));
  return certificate &&
    constantTimeEqual(certificate.accountId, accountId) &&
    isCertified(trust.rootPublicKey, certificate)
    ? certificate
    : undefined;
};

const sameBundle = (certificate: Certificate, fingerprint: Uint8Array) =>
  constantTimeEqual(certificateFingerprint(certificate), fingerprint);

/** The earlier certificates the root confirms for exactly this account, oldest first */
const earlierOf = (trust: Trust, accountId: Uint8Array, current: Certificate | undefined) =>
  (trust.history?.get(idKey(accountId)) ?? [])
    .filter(
      (c) =>
        constantTimeEqual(c.accountId, accountId) &&
        (current === undefined || c.issuedAt < current.issuedAt) &&
        isCertified(trust.rootPublicKey, c),
    )
    .sort((a, b) => a.issuedAt - b.issuedAt);

/**
 * The account's certificate for exactly this bundle (P-12). One that a later certificate for
 * another bundle superseded counts only for what was signed before that one was issued, give or
 * take the clock skew; without a signed time (an entry's record, P-09) by the bundle alone, which
 * the checked log names.
 */
export const certificateFor = (
  trust: Trust,
  accountId: Uint8Array,
  fingerprint: Uint8Array,
  time = Number.NEGATIVE_INFINITY,
) => {
  const current = certificateOf(trust, accountId);
  const all = [...earlierOf(trust, accountId, current), ...(current ? [current] : [])];
  // No certificate of this bundle: index -1, and all[-1] is none
  const index = all.findIndex((c) => sameBundle(c, fingerprint));
  const next = all.slice(index + 1).find((c) => !sameBundle(c, fingerprint));
  const retired = next && time >= next.issuedAt + CLOCK_SKEW_SECONDS;
  return retired ? undefined : all[index];
};

/**
 * Whether the account has replaced this bundle (P-12): its current certificate names another one,
 * or it has none yet and an earlier one names this
 */
export const isSuperseded = (trust: Trust, accountId: Uint8Array, fingerprint: Uint8Array) => {
  const current = certificateOf(trust, accountId);
  return current
    ? !sameBundle(current, fingerprint)
    : earlierOf(trust, accountId, undefined).some((c) => sameBundle(c, fingerprint));
};

const isManager = (state: LogState, accountId: Uint8Array, now: number) => {
  const member = state.members.get(idKey(accountId));
  return member?.role === "manage" && (member.validUntil === 0 || member.validUntil > now);
};

const genesisState = (): LogState => ({
  seq: -1,
  time: 0,
  hash: GENESIS_HASH,
  epoch: 0,
  members: new Map(),
  commitments: new Map(),
  rotationDue: false,
  superseded: [],
});

/** The state after one entry, or what is wrong with the entry's meaning */
const apply = (state: LogState, entry: LogEntry, trust: Trust): Result<LogState, LogError> => {
  const members = new Map(state.members);
  const commitments = new Map(state.commitments);
  const next = {
    ...state,
    seq: entry.seq,
    time: entry.time,
    hash: entryHash(entry),
    members,
    commitments,
  };
  const subject = idKey(entry.accountId);
  // The subject's bundle as of the entry's time: an add of a bundle its account has replaced
  // since then still verifies, one signed after the replacement does not (P-12)
  const certifiedSubject = () =>
    certificateFor(trust, entry.accountId, entry.fingerprint, entry.time) !== undefined;
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
      return ok({ ...next, rotationDue: true });
    }
    case "rotate": {
      if (entry.epoch !== state.epoch + 1 || entry.vkCommitment.length === 0)
        return err("bad-epoch");
      commitments.set(entry.epoch, entry.vkCommitment);
      return ok({ ...next, epoch: entry.epoch, rotationDue: false });
    }
    case "rekey":
      return applyRekey(next, entry, trust);
  }
};

/**
 * The member's new bundle after its account renewed its keys (P-12): the same role and time, a
 * certificate of the root for the new bundle at the entry's time and later than the one of the
 * bundle it replaces. The old keys hold this epoch's vault key: a rotation is due.
 */
const applyRekey = (next: LogState, entry: LogEntry, trust: Trust): Result<LogState, LogError> => {
  const subject = idKey(entry.accountId);
  const existing = next.members.get(subject);
  if (
    !existing ||
    entry.role !== existing.role ||
    entry.validUntil !== existing.validUntil ||
    entry.vkCommitment.length !== 0
  )
    return err("bad-action");
  if (entry.epoch !== next.epoch) return err("bad-epoch");
  const renewed = certificateFor(trust, entry.accountId, entry.fingerprint, entry.time);
  const replaced = certificateFor(trust, entry.accountId, existing.fingerprint);
  if (!renewed || !replaced || renewed.issuedAt <= replaced.issuedAt)
    return err("uncertified-member");
  next.members.set(subject, { ...existing, fingerprint: entry.fingerprint });
  return ok({ ...next, rotationDue: true });
};

/** A member renewing its own keys signs with the new ones: the old ones are someone else's too */
const isOwnRekey = (entry: LogEntry) =>
  entry.action === "rekey" && constantTimeEqual(entry.accountId, entry.signerId);

/**
 * The signer's certificate for the bundle the log names for it at this point: the new bundle for a
 * member's own rekey, else the member's logged one. A genesis names its creator's bundle; one that
 * names no certificate of its signer verifies under the current one and fails as uncertified
 * member. A signer the log does not name has no rights: its current certificate, then not-manager.
 */
const signerOf = (state: LogState, entry: LogEntry, trust: Trust) => {
  const current = () => certificateOf(trust, entry.signerId);
  if (entry.action === "create")
    return certificateFor(trust, entry.signerId, entry.fingerprint, entry.time) ?? current();
  const fingerprint = isOwnRekey(entry)
    ? entry.fingerprint
    : state.members.get(idKey(entry.signerId))?.fingerprint;
  return fingerprint ? certificateFor(trust, entry.signerId, fingerprint, entry.time) : current();
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
  const signer = signerOf(state, entry, trust);
  if (!signer) return err("uncertified-signer");
  if (!verify(signer.edPublicKey, entry.signature, "log", entryBytes(entry)))
    return err("bad-signature");
  // Signed times only move forward and never into the future beyond the clock skew; rights count
  // at the entry's time
  if (entry.time < state.time || entry.time > trust.now + CLOCK_SKEW_SECONDS)
    return err("bad-time");
  if (
    entry.action !== "create" &&
    !isOwnRekey(entry) &&
    !isManager(state, entry.signerId, entry.time)
  )
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
  const seen = new Set<string>();
  for (const entry of entries) {
    const next = step(state, entry, vaultId, trust);
    if (!next.ok) return next;
    // The signer's newest state must lie in this chain; otherwise it saw another one (E-08)
    if (entry.lastSeen.length > 0 && !seen.has(idKey(entry.lastSeen))) return err("fork");
    state = next.value;
    seen.add(idKey(state.hash));
    if (
      remembered &&
      state.seq === remembered.seq &&
      !constantTimeEqual(state.hash, remembered.hash)
    )
      return err("rollback");
  }
  if (remembered && state.seq < remembered.seq) return err("rollback");
  const superseded = [...state.members]
    .filter(([key, member]) => isSuperseded(trust, fromIdKey(key), member.fingerprint))
    .map(([key]) => key);
  return ok({ ...state, superseded, rotationDue: state.rotationDue || superseded.length > 0 });
};

export const fromIdKey = (key: string) =>
  Uint8Array.from(key.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));

/** What a client keeps in its account state after a successful check */
export const remember = (state: LogState): Remembered => ({ seq: state.seq, hash: state.hash });

/** Whether an account may read the vault now: a member whose access has not run out */
export const isMember = (state: LogState, accountId: Uint8Array, now: number) => {
  const member = state.members.get(idKey(accountId));
  return member !== undefined && (member.validUntil === 0 || member.validUntil > now);
};
