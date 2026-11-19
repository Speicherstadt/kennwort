// Weber Haustechnik for the sync tests: Jonas manages the vault "Büro", Anna edits, Max only reads
import { ed25519KeyPair, keyCommitment, xwingKeyPair } from "@kennwort/crypto";
import { certificateFingerprint, certify } from "../../membership/certificate.ts";
import {
  entryHash,
  GENESIS_HASH,
  type LogEntry,
  type LogFields,
  signEntry,
} from "../../membership/log-entry.ts";
import { idKey, type Trust, verifyLog } from "../../membership/verify-log.ts";
import type { EntryContent } from "../content.ts";
import type { SyncContext } from "../device.ts";

export const id = (byte: number) => new Uint8Array(16).fill(byte);
const root = ed25519KeyPair(new Uint8Array(32).fill(1));
const person = (byte: number) => ({
  id: id(byte),
  ed: ed25519KeyPair(new Uint8Array(32).fill(byte)),
  xwing: xwingKeyPair(new Uint8Array(32).fill(byte)),
});
export const jonas = person(0x10);
export const anna = person(0x20);
export const max = person(0x30);
type Person = typeof jonas;

const certificate = (p: Person) =>
  certify(root.secretKey, {
    accountId: p.id,
    xwingPublicKey: p.xwing.publicKey,
    edPublicKey: p.ed.publicKey,
    companyId: id(0xc0),
    role: "member",
    issuedAt: 1_800_000_000,
  });

export const trust: Trust = {
  rootPublicKey: root.publicKey,
  certificates: new Map([jonas, anna, max].map((p) => [idKey(p.id), certificate(p)])),
  now: 1_800_000_100,
};

const vaultId = id(0xb0);
const vaultKey = new Uint8Array(32).fill(0x55);
const commitment = keyCommitment(vaultKey, "vault-key", vaultId, 0);
const entry = (
  seq: number,
  prev: LogEntry | undefined,
  subject: Person,
  role: LogFields["role"],
): LogEntry =>
  signEntry(jonas.ed.secretKey, {
    vaultId,
    seq,
    prevHash: prev ? entryHash(prev) : GENESIS_HASH,
    epoch: 0,
    action: seq === 0 ? "create" : "add",
    accountId: subject.id,
    fingerprint: certificateFingerprint(certificate(subject)),
    role,
    validUntil: 0,
    vkCommitment: commitment,
    time: 1_800_000_000 + seq,
    signerId: jonas.id,
    lastSeen: prev ? entryHash(prev) : new Uint8Array(),
  });
const genesis = entry(0, undefined, jonas, "manage");
const addAnna = entry(1, genesis, anna, "edit");
const addMax = entry(2, addAnna, max, "read");
const checked = verifyLog(vaultId, [genesis, addAnna, addMax], trust);
if (!checked.ok) throw new Error(checked.error);
export const log = checked.value;

export const contextFor = (p: Person, now = 1_800_000_200): SyncContext => ({
  author: { id: p.id, edSecretKey: p.ed.secretKey },
  ring: { vaultId, epoch: 0, vaultKey },
  log,
  trust,
  lastSeen: entryHash(addMax),
  now,
});

export const bank: EntryContent = {
  type: "login",
  title: "Sparkasse",
  fields: [
    { id: "user", name: "Benutzername", value: "weber-haustechnik", kind: "text" },
    { id: "password", name: "Passwort", value: "Weber-2026!", kind: "secret" },
    { id: "url", name: "Website", value: "https://sparkasse.test", kind: "url" },
  ],
  tags: ["Bank"],
  favorite: false,
  history: [],
};

export const withField = (content: EntryContent, fieldId: string, value: string): EntryContent => ({
  ...content,
  fields: content.fields.map((field) => (field.id === fieldId ? { ...field, value } : field)),
});
