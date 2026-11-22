/**
 * The audit log as a hash chain (docs/sicherheitsdesign.md, P-20; E-23): every event is bound to
 * the one before it, so a check finds every changed, missing or inserted line. Events a client
 * triggers (export, recovery, key rotation) carry the client's signature; the server cannot make
 * them up. A client remembers the head it saw, so a shortened log stands out as well.
 *
 *   hash = SHA-512/256(enc("kennwort/audit/v1", prevHash, eventBytes))
 */
import { constantTimeEqual, DIGEST_LENGTH, digest, encode, sign, verify } from "@kennwort/crypto";
import { z } from "zod";
import { ok } from "../result.ts";
import { bytes } from "../sync/bytes.ts";

/** What the server records itself, and what only a client may sign */
export const SERVER_ACTIONS = [
  "invitation-created",
  "invitation-accepted",
  "member-certified",
  "role-changed",
  "member-left",
  "policy-changed",
  // A new company root (K-307 part f, P-07): the change is signed by both roots, not by the server
  "root-changed",
  "signed-in",
  "vault-created",
  // Emergency access (K-307 part d, P-14): the server records each step it takes
  "emergency-granted",
  "emergency-revoked",
  "emergency-requested",
  "emergency-objected",
  "emergency-released",
  // One-time links (K-601, P-18): made, fetched and revoked; the subject is the link's public ID
  "link-created",
  "link-opened",
  "link-revoked",
] as const;
export const CLIENT_ACTIONS = [
  "export",
  "recovery",
  "key-rotation",
  "emergency-access",
  // The account renewed its keys (K-307 part e, P-12), signed with the new ones
  "account-rekey",
] as const;
export const AuditAction = z.enum([...SERVER_ACTIONS, ...CLIENT_ACTIONS]);
export type AuditAction = z.infer<typeof AuditAction>;
export type ClientAction = (typeof CLIENT_ACTIONS)[number];

/**
 * Text as encode signs and hashes it: well-formed and already in NFC, so the same words have one
 * form only and two lines cannot differ in bytes but not in meaning (review of K-205)
 */
export const isCanonical = (text: string) => text.isWellFormed() && text === text.normalize("NFC");
export const AuditText = z.string().refine(isCanonical);

export const AuditEvent = z.object({
  companyId: AuditText,
  seq: z.number().int().nonnegative(),
  time: z.number().int().nonnegative(),
  actor: AuditText,
  action: AuditAction,
  /** What the event is about: an invitation, a vault, or an ID the signing client chose */
  subject: AuditText,
  /** Empty for events the server records; the actor's signature for client actions */
  signature: bytes(),
  prevHash: bytes(DIGEST_LENGTH),
  hash: bytes(DIGEST_LENGTH),
});
export type AuditEvent = z.infer<typeof AuditEvent>;
/** The export for auditors, as GET /api/audit returns it; parsed before verifyAudit */
export const AuditExport = z.object({ companyId: z.string(), events: z.array(AuditEvent) });
export type AuditExport = z.infer<typeof AuditExport>;

export type AuditFields = Omit<AuditEvent, "prevHash" | "hash">;

export const AUDIT_GENESIS = new Uint8Array(DIGEST_LENGTH);

const eventBytes = (f: AuditFields) =>
  encode(
    "kennwort/audit-event/v1",
    f.companyId,
    f.seq,
    f.time,
    f.actor,
    f.action,
    f.subject,
    f.signature,
  );

export const auditHash = (prevHash: Uint8Array, fields: AuditFields) =>
  digest(encode("kennwort/audit/v1", prevHash, eventBytes(fields)));

/** The next link of the chain; the server calls this inside the transaction that stores it */
export const chainAudit = (prevHash: Uint8Array, fields: AuditFields): AuditEvent => ({
  ...fields,
  prevHash,
  hash: auditHash(prevHash, fields),
});

/** A client's signature over a client action; the subject is an ID the client chose, once */
export type ClientEvent = {
  companyId: string;
  actor: string;
  action: ClientAction;
  subject: string;
};
const signedFields = (e: ClientEvent) => [e.companyId, e.actor, e.action, e.subject] as const;
export const signAudit = (edSecretKey: Uint8Array, event: ClientEvent) =>
  sign(edSecretKey, "audit", ...signedFields(event));

export const isClientAction = (action: AuditAction): action is ClientAction =>
  (CLIENT_ACTIONS as readonly string[]).includes(action);

/** Where the chain stood: the number of events and the hash of the last one */
export type AuditHead = { length: number; hash: Uint8Array };
export type AuditProblem =
  | "malformed"
  | "wrong-company"
  | "gap"
  | "broken-chain"
  | "changed"
  | "bad-signature"
  | "replayed"
  | "truncated"
  | "forked";
export type AuditCheck = {
  companyId: string;
  /**
   * The actor's Ed25519 public keys from its certificates, for client actions: the current one,
   * and after the account renewed its keys (P-12) its earlier ones, which signed the events before;
   * none for an unknown actor
   */
  publicKeysOf: (actor: string) => readonly Uint8Array[];
  remembered?: AuditHead;
};

const checkEvent = (
  event: AuditEvent,
  index: number,
  prevHash: Uint8Array,
  check: AuditCheck,
): AuditProblem | undefined => {
  if (![event.companyId, event.actor, event.subject].every(isCanonical)) return "malformed";
  if (event.companyId !== check.companyId) return "wrong-company";
  if (event.seq !== index) return "gap";
  if (!constantTimeEqual(event.prevHash, prevHash)) return "broken-chain";
  if (!constantTimeEqual(event.hash, auditHash(prevHash, event))) return "changed";
  if (!isClientAction(event.action)) return undefined;
  // An unknown actor has no key, and no key verifies nothing
  const keys = check.publicKeysOf(event.actor);
  const fields = signedFields({ ...event, action: event.action });
  const signed = keys.some((key) => verify(key, event.signature, "audit", ...fields));
  return signed ? undefined : "bad-signature";
};

export type AuditFailure = { problem: AuditProblem; seq: number };
const failed = (problem: AuditProblem, seq: number) => ({
  ok: false as const,
  error: { problem, seq },
});

/** Checks the whole chain; the head it returns is what the client remembers next time */
export const verifyAudit = (
  events: readonly AuditEvent[],
  check: AuditCheck,
): { ok: true; value: AuditHead } | { ok: false; error: AuditFailure } => {
  let prevHash: Uint8Array = AUDIT_GENESIS;
  // A client signs each action once, for a subject it chose: the same one twice is a replay
  const signedSubjects = new Set<string>();
  for (const [index, event] of events.entries()) {
    const problem = checkEvent(event, index, prevHash, check);
    if (problem) return failed(problem, index);
    if (isClientAction(event.action)) {
      const key = `${event.action}:${event.subject}`;
      if (signedSubjects.has(key)) return failed("replayed", index);
      signedSubjects.add(key);
    }
    prevHash = event.hash;
  }
  const { remembered } = check;
  if (remembered && events.length < remembered.length) return failed("truncated", events.length);
  if (remembered && remembered.length > 0) {
    const seen = events[remembered.length - 1] as AuditEvent;
    if (!constantTimeEqual(seen.hash, remembered.hash)) return failed("forked", seen.seq);
  }
  return ok({ length: events.length, hash: prevHash });
};
