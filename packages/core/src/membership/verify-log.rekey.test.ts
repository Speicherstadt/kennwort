import { ed25519KeyPair, keyCommitment, xwingKeyPair } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { type Certificate, certificateFingerprint, certify } from "./certificate.ts";
import { entryHash, GENESIS_HASH, type LogEntry, type LogFields, signEntry } from "./log-entry.ts";
import {
  CLOCK_SKEW_SECONDS,
  certificateFor,
  fromIdKey,
  idKey,
  isSuperseded,
  type Trust,
  verifyLog,
} from "./verify-log.ts";

// Weber Haustechnik: Anna's recovery kit fell into foreign hands, so she renewed her keys (P-12)
const id = (byte: number) => new Uint8Array(16).fill(byte);
const root = ed25519KeyPair(new Uint8Array(32).fill(0x01));
const company = id(0xc0);
const keysOf = (account: number, seed: number) => ({
  id: id(account),
  ed: ed25519KeyPair(new Uint8Array(32).fill(seed)),
  xwing: xwingKeyPair(new Uint8Array(32).fill(seed)),
});
const jonas = keysOf(0x10, 0x10);
const anna = keysOf(0x20, 0x20);
const annaNew = keysOf(0x20, 0x21);
const max = keysOf(0x30, 0x30);
type Keys = typeof jonas;

const RENEWED_AT = 1_800_001_000;
const certificate = (k: Keys, issuedAt = 1_800_000_000, rootKey = root.secretKey): Certificate =>
  certify(rootKey, {
    accountId: k.id,
    xwingPublicKey: k.xwing.publicKey,
    edPublicKey: k.ed.publicKey,
    companyId: company,
    role: "member",
    issuedAt,
  });
const fp = (k: Keys) => certificateFingerprint(certificate(k));

/** Anna's new bundle certified, her old one in the history */
const renewed = (now = RENEWED_AT + 1000, history: Certificate[] = [certificate(anna)]): Trust => ({
  rootPublicKey: root.publicKey,
  certificates: new Map([
    [idKey(jonas.id), certificate(jonas)],
    [idKey(anna.id), certificate(annaNew, RENEWED_AT)],
    [idKey(max.id), certificate(max)],
  ]),
  history: new Map([[idKey(anna.id), history]]),
  now,
});
/** Anna renewed, but no admin has certified the new bundle yet */
const waiting = (): Trust => {
  const trust = renewed();
  trust.certificates.delete(idKey(anna.id));
  return trust;
};

const vault = id(0xb0);
const commitment = (epoch: number) =>
  keyCommitment(new Uint8Array(32).fill(epoch + 1), "vault-key", vault, epoch);

type Step = Partial<LogFields> & { action: LogFields["action"]; subject: Keys; signer: Keys };
const append = (entries: LogEntry[], steps: Step[]): LogEntry[] =>
  steps.reduce<LogEntry[]>(
    (all, { subject, signer, ...fields }) => {
      const prev = all.at(-1);
      const epoch = fields.epoch ?? prev?.epoch ?? 0;
      all.push(
        signEntry(signer.ed.secretKey, {
          vaultId: vault,
          seq: all.length,
          prevHash: prev ? entryHash(prev) : GENESIS_HASH,
          epoch,
          accountId: subject.id,
          fingerprint: ["remove", "rotate"].includes(fields.action)
            ? new Uint8Array()
            : fp(subject),
          role: ["remove", "rotate"].includes(fields.action) ? "" : "edit",
          validUntil: 0,
          vkCommitment: ["create", "add", "rotate"].includes(fields.action)
            ? commitment(epoch)
            : new Uint8Array(),
          time: (prev?.time ?? 1_800_000_000) + 1,
          signerId: signer.id,
          lastSeen: prev ? entryHash(prev) : new Uint8Array(),
          ...fields,
        }),
      );
      return all;
    },
    [...entries],
  );

// Before the renewal: Jonas made the vault and added Anna as manager, Anna added Max
const before = append(
  [],
  [
    { action: "create", subject: jonas, signer: jonas, role: "manage" },
    { action: "add", subject: anna, signer: jonas, role: "manage" },
    { action: "add", subject: max, signer: anna },
  ],
);
const at = RENEWED_AT + 100;
const ownRekey: Step = {
  action: "rekey",
  subject: annaNew,
  signer: annaNew,
  role: "manage",
  time: at,
};

const expectOk = (result: ReturnType<typeof verifyLog>) => {
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describe("a log after a member renewed her keys (P-12)", () => {
  it("still verifies what her old keys signed before", () => {
    expect(verifyLog(vault, before, renewed()).ok).toBe(true);
  });

  it("still verifies a vault she created with her old keys", () => {
    const hers = append([], [{ action: "create", subject: anna, signer: anna, role: "manage" }]);
    expect(expectOk(verifyLog(vault, hers, renewed())).superseded).toEqual([idKey(anna.id)]);
  });

  it("names her superseded bundle and wants no writing until a rekey and a rotation", () => {
    const state = expectOk(verifyLog(vault, before, renewed()));
    expect(state.superseded).toEqual([idKey(anna.id)]);
    expect(state.rotationDue).toBe(true);
  });

  it("knows the bundle as superseded also while the new one waits for its certificate", () => {
    const state = expectOk(verifyLog(vault, before, waiting()));
    expect(state.superseded).toEqual([idKey(anna.id)]);
    expect(state.rotationDue).toBe(true);
  });

  it("takes her own rekey signed with the new keys; a rotation ends what is due", () => {
    const rekeyed = append(before, [ownRekey]);
    const state = expectOk(verifyLog(vault, rekeyed, renewed()));
    expect(state.members.get(idKey(anna.id))).toEqual({
      role: "manage",
      fingerprint: fp(annaNew),
      validUntil: 0,
      replaced: fp(anna),
    });
    expect(state.superseded).toEqual([]);
    expect(state.rotationDue).toBe(true);
    // ... and with the new keys she rotates as the vault's manager
    const rotated = append(rekeyed, [
      { action: "rotate", subject: annaNew, signer: annaNew, epoch: 1 },
    ]);
    const after = expectOk(verifyLog(vault, rotated, renewed()));
    expect(after.rotationDue).toBe(false);
    expect(after.epoch).toBe(1);
    // The old bundle's versions count no more once every entry is written anew
    expect(after.members.get(idKey(anna.id))).toEqual({
      role: "manage",
      fingerprint: fp(annaNew),
      validUntil: 0,
    });
  });

  it("keeps the first bundle a rekey replaced when she renews twice before the rotation", () => {
    const annaThird = keysOf(0x20, 0x22);
    const trust = renewed(RENEWED_AT + 1000, [certificate(anna), certificate(annaNew, RENEWED_AT)]);
    trust.certificates.set(idKey(anna.id), certificate(annaThird, RENEWED_AT + 200));
    const twice = append(before, [
      { ...ownRekey, signer: jonas },
      { ...ownRekey, subject: annaThird, signer: jonas, time: at + 200 },
    ]);
    expect(expectOk(verifyLog(vault, twice, trust)).members.get(idKey(anna.id))).toEqual({
      role: "manage",
      fingerprint: fp(annaThird),
      validUntil: 0,
      replaced: fp(anna),
    });
  });

  it("takes a rekey that another manager signs for her", () => {
    const byJonas = append(before, [{ ...ownRekey, signer: jonas }]);
    expect(
      expectOk(verifyLog(vault, byJonas, renewed())).members.get(idKey(anna.id))?.fingerprint,
    ).toEqual(fp(annaNew));
  });

  it("takes a reader's own rekey, but no one else's from a reader", () => {
    const maxNew = keysOf(0x30, 0x31);
    const trust = renewed();
    trust.certificates.set(idKey(max.id), certificate(maxNew, RENEWED_AT));
    trust.history?.set(idKey(max.id), [certificate(max)]);
    const own = append(before, [{ action: "rekey", subject: maxNew, signer: maxNew, time: at }]);
    expect(verifyLog(vault, own, trust).ok).toBe(true);
    const forAnna = append(own, [{ ...ownRekey, signer: maxNew }]);
    expect(verifyLog(vault, forAnna, trust)).toEqual({ ok: false, error: "not-manager" });
  });

  it("refuses a rekey for an account that is no member", () => {
    const removed = append(before, [{ action: "remove", subject: anna, signer: jonas }]);
    expect(verifyLog(vault, append(removed, [{ ...ownRekey, signer: jonas }]), renewed())).toEqual({
      ok: false,
      error: "bad-action",
    });
  });

  it.each([
    ["another role", { role: "edit" as const }],
    ["a time limit", { validUntil: RENEWED_AT + 9000 }],
    ["a vault key commitment", { vkCommitment: commitment(0) }],
  ])("refuses a rekey with %s", (_, change) => {
    const changed = append(before, [{ ...ownRekey, ...change }]);
    expect(verifyLog(vault, changed, renewed())).toEqual({ ok: false, error: "bad-action" });
  });

  it("refuses a rekey in another epoch", () => {
    const later = append(before, [{ ...ownRekey, signer: jonas, epoch: 1 }]);
    expect(verifyLog(vault, later, renewed())).toEqual({ ok: false, error: "bad-epoch" });
  });

  it("refuses a rekey to a bundle the root has not certified", () => {
    const stranger = keysOf(0x20, 0x66);
    const forged = append(before, [{ ...ownRekey, subject: stranger, signer: jonas }]);
    expect(verifyLog(vault, forged, renewed())).toEqual({ ok: false, error: "uncertified-member" });
  });

  it("refuses a rekey while the new bundle waits for its certificate", () => {
    const early = append(before, [{ ...ownRekey, signer: jonas }]);
    expect(verifyLog(vault, early, waiting())).toEqual({ ok: false, error: "uncertified-member" });
  });

  it("refuses a rekey to the same bundle, and back to an older one", () => {
    const same = append(before, [{ ...ownRekey, subject: anna, signer: jonas }]);
    expect(verifyLog(vault, same, renewed())).toEqual({ ok: false, error: "uncertified-member" });
    // The log names the new bundle; the server plays back a rekey to the old one
    const forward = append(before, [{ ...ownRekey, signer: jonas }]);
    const back = append(forward, [{ ...ownRekey, subject: anna, signer: jonas, time: at + 1 }]);
    expect(verifyLog(vault, back, renewed())).toEqual({ ok: false, error: "uncertified-member" });
  });

  it("refuses her own rekey signed with the old keys, which someone else has too", () => {
    const entries = append(before, [ownRekey]);
    const last = entries.at(-1) as LogEntry;
    const byOld = { ...last, signature: signEntry(anna.ed.secretKey, last).signature };
    expect(verifyLog(vault, [...before, byOld], renewed())).toEqual({
      ok: false,
      error: "bad-signature",
    });
  });

  it("refuses what the old keys sign after the new certificate, give or take the clock skew", () => {
    const late = RENEWED_AT + CLOCK_SKEW_SECONDS;
    const lateAdd = append(before, [
      { action: "add", subject: keysOf(0x40, 0x40), signer: anna, time: late },
    ]);
    const trust = renewed();
    const sandra = keysOf(0x40, 0x40);
    trust.certificates.set(idKey(sandra.id), certificate(sandra));
    expect(verifyLog(vault, lateAdd, trust)).toEqual({ ok: false, error: "uncertified-signer" });
    const justBefore = append(before, [
      { action: "add", subject: sandra, signer: anna, time: late - 1 },
    ]);
    expect(verifyLog(vault, justBefore, trust).ok).toBe(true);
  });

  it("refuses an add of her old bundle after the new certificate", () => {
    const late = append(before, [
      { action: "remove", subject: anna, signer: jonas, time: RENEWED_AT + 200 },
      { action: "add", subject: anna, signer: jonas, time: RENEWED_AT + CLOCK_SKEW_SECONDS },
    ]);
    expect(verifyLog(vault, late, renewed())).toEqual({ ok: false, error: "uncertified-member" });
  });
});

describe("the certificates of a renewed account", () => {
  const trust = renewed();

  it("gives the certificate of exactly the bundle asked for", () => {
    expect(certificateFor(trust, anna.id, fp(anna))).toEqual(certificate(anna));
    expect(certificateFor(trust, anna.id, fp(annaNew), RENEWED_AT + 10 ** 6)).toEqual(
      certificate(annaNew, RENEWED_AT),
    );
    expect(certificateFor(trust, anna.id, fp(jonas))).toBeUndefined();
    expect(certificateFor(trust, max.id, fp(max), RENEWED_AT + 10 ** 6)).toEqual(certificate(max));
  });

  it("gives an earlier one only for what was signed before the next bundle's certificate", () => {
    expect(certificateFor(trust, anna.id, fp(anna), RENEWED_AT + CLOCK_SKEW_SECONDS - 1)).toEqual(
      certificate(anna),
    );
    expect(
      certificateFor(trust, anna.id, fp(anna), RENEWED_AT + CLOCK_SKEW_SECONDS),
    ).toBeUndefined();
  });

  it("keeps a new role for the same bundle from retiring it", () => {
    const promoted = renewed(RENEWED_AT, [certificate(anna), certificate(anna, 1_800_000_500)]);
    expect(certificateFor(promoted, anna.id, fp(anna), 1_800_000_900)).toEqual(certificate(anna));
  });

  it("ignores an earlier certificate the root did not sign, for another account or not earlier", () => {
    const other = ed25519KeyPair(new Uint8Array(32).fill(0x99));
    const strayRoot = renewed(RENEWED_AT, [certificate(anna, 1_800_000_000, other.secretKey)]);
    expect(certificateFor(strayRoot, anna.id, fp(anna))).toBeUndefined();
    const foreign = renewed(RENEWED_AT, [certificate(max)]);
    expect(certificateFor(foreign, anna.id, fp(max))).toBeUndefined();
    const notEarlier = renewed(RENEWED_AT, [certificate(anna, RENEWED_AT)]);
    expect(certificateFor(notEarlier, anna.id, fp(anna))).toBeUndefined();
    expect(isSuperseded(notEarlier, anna.id, fp(anna))).toBe(true);
  });

  it("takes earlier certificates in the order they were issued, whatever order they come in", () => {
    const middle = keysOf(0x20, 0x22);
    const shuffled = renewed(RENEWED_AT, [certificate(middle, 1_800_000_500), certificate(anna)]);
    expect(certificateFor(shuffled, anna.id, fp(anna), 1_800_000_400)).toEqual(certificate(anna));
    expect(
      certificateFor(shuffled, anna.id, fp(anna), 1_800_000_500 + CLOCK_SKEW_SECONDS),
    ).toBeUndefined();
    expect(certificateFor(shuffled, anna.id, fp(middle), 1_800_000_900)).toEqual(
      certificate(middle, 1_800_000_500),
    );
  });

  it("calls a bundle superseded only when the account has another one", () => {
    expect(isSuperseded(trust, anna.id, fp(anna))).toBe(true);
    expect(isSuperseded(trust, anna.id, fp(annaNew))).toBe(false);
    expect(isSuperseded(trust, max.id, fp(max))).toBe(false);
    expect(isSuperseded(waiting(), anna.id, fp(anna))).toBe(true);
    expect(isSuperseded(waiting(), anna.id, fp(annaNew))).toBe(false);
    expect(isSuperseded(waiting(), id(0x77), fp(anna))).toBe(false);
  });

  it("reads a hex account key back into its bytes", () => {
    expect(fromIdKey(idKey(anna.id))).toEqual(anna.id);
    expect(fromIdKey("")).toEqual(new Uint8Array());
  });
});
