import { ed25519KeyPair, keyCommitment, sign, xwingKeyPair } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { type Certificate, certificateFingerprint, certify } from "./certificate.ts";
import { entryHash, GENESIS_HASH, type LogEntry, type LogFields, signEntry } from "./log-entry.ts";
import { idKey, isMember, remember, type Trust, verifyLog } from "./verify-log.ts";

// Weber Haustechnik: Jonas owns the company and its root key; Anna, Max and Sandra work there
const id = (byte: number) => new Uint8Array(16).fill(byte);
const root = ed25519KeyPair(new Uint8Array(32).fill(0x01));
const company = id(0xc0);
const person = (byte: number) => ({
  id: id(byte),
  ed: ed25519KeyPair(new Uint8Array(32).fill(byte)),
  xwing: xwingKeyPair(new Uint8Array(32).fill(byte)),
});
const jonas = person(0x10);
const anna = person(0x20);
const max = person(0x30);
const sandra = person(0x40);
type Person = typeof jonas;

const certificateFor = (p: Person, rootKey = root.secretKey): Certificate =>
  certify(rootKey, {
    accountId: p.id,
    xwingPublicKey: p.xwing.publicKey,
    edPublicKey: p.ed.publicKey,
    companyId: company,
    role: "member",
    issuedAt: 1_800_000_000,
  });
const trust = (now = 1_800_000_100, people = [jonas, anna, max]): Trust => ({
  rootPublicKey: root.publicKey,
  certificates: new Map(people.map((p) => [idKey(p.id), certificateFor(p)])),
  now,
});

const vault = id(0xb0);
const commitment = (epoch: number) =>
  keyCommitment(new Uint8Array(32).fill(epoch + 1), "vault-key", vault, epoch);
const fp = (p: Person) => certificateFingerprint(certificateFor(p));

/** Builds a valid chain: each step names action, subject and signer; seq and hashes follow */
type Step = Partial<LogFields> & { action: LogFields["action"]; subject: Person; signer: Person };
const chain = (steps: Step[]): LogEntry[] =>
  steps.reduce<LogEntry[]>((entries, { subject, signer, ...fields }) => {
    const prev = entries.at(-1);
    const epoch = fields.epoch ?? prev?.epoch ?? 0;
    const entry = signEntry(signer.ed.secretKey, {
      vaultId: vault,
      seq: entries.length,
      prevHash: prev ? entryHash(prev) : GENESIS_HASH,
      epoch,
      accountId: subject.id,
      fingerprint: fields.action === "remove" ? new Uint8Array() : fp(subject),
      role: fields.action === "remove" || fields.action === "rotate" ? "" : "edit",
      validUntil: 0,
      vkCommitment: ["create", "add", "rotate"].includes(fields.action)
        ? commitment(epoch)
        : new Uint8Array(),
      time: 1_800_000_000 + entries.length,
      signerId: signer.id,
      lastSeen: prev ? entryHash(prev) : new Uint8Array(),
      ...fields,
    });
    return [...entries, entry];
  }, []);

const log = chain([
  { action: "create", subject: jonas, signer: jonas, role: "manage" },
  { action: "add", subject: anna, signer: jonas, role: "manage" },
  { action: "add", subject: max, signer: anna },
  { action: "remove", subject: max, signer: jonas },
  { action: "rotate", subject: jonas, signer: jonas, epoch: 1 },
]);

describe("verifyLog: a valid log", () => {
  it("gives the members, the epoch and the commitment of each epoch", () => {
    const result = verifyLog(vault, log, trust());
    if (!result.ok) throw new Error(result.error);
    const state = result.value;
    expect(state.seq).toBe(4);
    expect(state.epoch).toBe(1);
    expect(isMember(state, jonas.id, 0)).toBe(true);
    expect(isMember(state, anna.id, 0)).toBe(true);
    expect(isMember(state, max.id, 0)).toBe(false);
    expect(state.commitments.get(1)).toEqual(commitment(1));
  });

  it("accepts the log again with the state it remembered, and a longer one", () => {
    const short = verifyLog(vault, log.slice(0, 3), trust());
    if (!short.ok) throw new Error(short.error);
    expect(verifyLog(vault, log.slice(0, 3), trust(), remember(short.value)).ok).toBe(true);
    expect(verifyLog(vault, log, trust(), remember(short.value)).ok).toBe(true);
  });
});

describe("verifyLog: attacks of a malicious server (E-06, E-07)", () => {
  it("detects an omitted entry", () => {
    expect(verifyLog(vault, [log[0], log[1], log[3]] as LogEntry[], trust())).toEqual({
      ok: false,
      error: "gap",
    });
  });

  it("detects swapped entries", () => {
    expect(verifyLog(vault, [log[0], log[2], log[1]] as LogEntry[], trust())).toEqual({
      ok: false,
      error: "gap",
    });
  });

  it("detects an unsigned or altered entry", () => {
    const [genesis, add] = log as [LogEntry, LogEntry];
    const unsigned = { ...add, signature: new Uint8Array(65) };
    expect(verifyLog(vault, [genesis, unsigned], trust())).toEqual({
      ok: false,
      error: "bad-signature",
    });
    const altered = { ...add, role: "read" as const };
    expect(verifyLog(vault, [genesis, altered], trust())).toEqual({
      ok: false,
      error: "bad-signature",
    });
  });

  it("detects a replayed (older) log behind the state the client remembered", () => {
    const full = verifyLog(vault, log, trust());
    if (!full.ok) throw new Error(full.error);
    expect(verifyLog(vault, log.slice(0, 3), trust(), remember(full.value))).toEqual({
      ok: false,
      error: "rollback",
    });
  });

  it("detects a rewritten history at the remembered place", () => {
    const seen = verifyLog(vault, log.slice(0, 3), trust());
    if (!seen.ok) throw new Error(seen.error);
    const rewritten = chain([
      { action: "create", subject: jonas, signer: jonas, role: "manage" },
      { action: "add", subject: anna, signer: jonas, role: "manage" },
      { action: "add", subject: sandra, signer: jonas },
    ]);
    const withSandra = trust(1_800_000_100, [jonas, anna, max, sandra]);
    expect(verifyLog(vault, rewritten, withSandra, remember(seen.value))).toEqual({
      ok: false,
      error: "rollback",
    });
  });

  it("detects an entry replayed twice", () => {
    expect(verifyLog(vault, [log[0], log[1], log[1]] as LogEntry[], trust())).toEqual({
      ok: false,
      error: "gap",
    });
  });

  it("detects a member smuggled in by a signer who does not manage the vault", () => {
    const smuggled = chain([
      { action: "create", subject: jonas, signer: jonas, role: "manage" },
      { action: "add", subject: anna, signer: jonas },
      { action: "add", subject: max, signer: anna },
    ]);
    expect(verifyLog(vault, smuggled, trust())).toEqual({ ok: false, error: "not-manager" });
  });

  it("detects a signer the company never certified", () => {
    expect(verifyLog(vault, log.slice(0, 2), trust(1_800_000_100, [anna]))).toEqual({
      ok: false,
      error: "uncertified-signer",
    });
    const forged = { ...trust(), certificates: new Map(trust().certificates) };
    forged.certificates.set(idKey(jonas.id), certificateFor(jonas, ed25519KeyPair().secretKey));
    expect(verifyLog(vault, log, forged)).toEqual({ ok: false, error: "uncertified-signer" });
  });

  it("detects a member key the server swapped (E-05)", () => {
    const swapped = chain([
      { action: "create", subject: jonas, signer: jonas, role: "manage" },
      { action: "add", subject: anna, signer: jonas, fingerprint: new Uint8Array(32).fill(9) },
    ]);
    expect(verifyLog(vault, swapped, trust())).toEqual({ ok: false, error: "uncertified-member" });
  });

  it("detects an entry of another vault", () => {
    expect(verifyLog(id(0xb1), log, trust())).toEqual({ ok: false, error: "wrong-vault" });
  });

  it("refuses an empty log and a genesis that is not a creation by its subject", () => {
    expect(verifyLog(vault, [], trust())).toEqual({ ok: false, error: "empty" });
    expect(verifyLog(vault, log.slice(1), trust())).toEqual({ ok: false, error: "bad-genesis" });
    const byOther = chain([{ action: "create", subject: anna, signer: jonas, role: "manage" }]);
    expect(verifyLog(vault, byOther, trust())).toEqual({ ok: false, error: "bad-genesis" });
    const reader = chain([{ action: "create", subject: jonas, signer: jonas, role: "read" }]);
    expect(verifyLog(vault, reader, trust())).toEqual({ ok: false, error: "bad-genesis" });
    const lateEpoch = chain([
      { action: "create", subject: jonas, signer: jonas, role: "manage", epoch: 1 },
    ]);
    expect(verifyLog(vault, lateEpoch, trust())).toEqual({ ok: false, error: "bad-genesis" });
    const second = chain([
      { action: "create", subject: jonas, signer: jonas, role: "manage" },
      { action: "create", subject: jonas, signer: jonas, role: "manage" },
    ]);
    expect(verifyLog(vault, second, trust())).toEqual({ ok: false, error: "bad-genesis" });
  });
});

describe("verifyLog: vault keys and epochs (E-16, E-26)", () => {
  const start = [
    { action: "create" as const, subject: jonas, signer: jonas, role: "manage" as const },
    { action: "add" as const, subject: anna, signer: jonas, role: "manage" as const },
  ];

  it("refuses an add whose commitment is not the epoch's vault key", () => {
    const wrong = chain([
      ...start,
      { action: "add", subject: max, signer: jonas, vkCommitment: commitment(5) },
    ]);
    expect(verifyLog(vault, wrong, trust())).toEqual({ ok: false, error: "bad-epoch" });
  });

  it("refuses an add in another epoch", () => {
    const wrong = chain([...start, { action: "add", subject: max, signer: jonas, epoch: 1 }]);
    expect(verifyLog(vault, wrong, trust())).toEqual({ ok: false, error: "bad-epoch" });
  });

  it("refuses a rotation that skips an epoch or has no commitment", () => {
    const skip = chain([...start, { action: "rotate", subject: jonas, signer: jonas, epoch: 2 }]);
    expect(verifyLog(vault, skip, trust())).toEqual({ ok: false, error: "bad-epoch" });
    const empty = chain([
      ...start,
      { action: "rotate", subject: jonas, signer: jonas, epoch: 1, vkCommitment: new Uint8Array() },
    ]);
    expect(verifyLog(vault, empty, trust())).toEqual({ ok: false, error: "bad-epoch" });
  });

  it("refuses adding a member twice, removing or changing a non-member, a role without role", () => {
    expect(
      verifyLog(vault, chain([...start, { action: "add", subject: anna, signer: jonas }]), trust())
        .ok,
    ).toBe(false);
    expect(
      verifyLog(
        vault,
        chain([...start, { action: "remove", subject: max, signer: jonas }]),
        trust(),
      ),
    ).toEqual({
      ok: false,
      error: "bad-action",
    });
    expect(
      verifyLog(vault, chain([...start, { action: "role", subject: max, signer: jonas }]), trust()),
    ).toEqual({
      ok: false,
      error: "bad-action",
    });
    expect(
      verifyLog(
        vault,
        chain([...start, { action: "role", subject: anna, signer: jonas, role: "" }]),
        trust(),
      ),
    ).toEqual({
      ok: false,
      error: "bad-action",
    });
    expect(
      verifyLog(
        vault,
        chain([...start, { action: "add", subject: max, signer: jonas, role: "" }]),
        trust(),
      ),
    ).toEqual({
      ok: false,
      error: "bad-action",
    });
  });

  it("changes a member's role and ends access on time", () => {
    const timed = chain([
      ...start,
      { action: "add", subject: max, signer: jonas, validUntil: 1_800_000_050 },
    ]);
    const result = verifyLog(vault, timed, trust());
    if (!result.ok) throw new Error(result.error);
    expect(isMember(result.value, max.id, 1_800_000_049)).toBe(true);
    expect(isMember(result.value, max.id, 1_800_000_050)).toBe(false);
    const promoted = chain([
      ...start,
      { action: "role", subject: anna, signer: jonas, role: "read" },
    ]);
    const after = verifyLog(vault, promoted, trust());
    expect(after.ok && after.value.members.get(idKey(anna.id))?.role).toBe("read");
  });

  it("stops a manager whose access ran out from signing", () => {
    const expired = chain([
      { action: "create", subject: jonas, signer: jonas, role: "manage" },
      { action: "add", subject: anna, signer: jonas, role: "manage", validUntil: 1_800_000_050 },
      { action: "add", subject: max, signer: anna },
    ]);
    expect(verifyLog(vault, expired, trust(1_800_000_100))).toEqual({
      ok: false,
      error: "not-manager",
    });
    expect(verifyLog(vault, expired, trust(1_800_000_049)).ok).toBe(true);
  });
});

describe("signatures in the log", () => {
  it("are made for the purpose log only", () => {
    const [genesis] = log as [LogEntry];
    const asCertificate = {
      ...genesis,
      signature: sign(jonas.ed.secretKey, "certificate", new Uint8Array()),
    };
    expect(verifyLog(vault, [asCertificate], trust())).toEqual({
      ok: false,
      error: "bad-signature",
    });
  });
});
