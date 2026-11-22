import { ed25519KeyPair, keyCommitment, xwingKeyPair } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { type Certificate, certificateFingerprint, certify } from "./certificate.ts";
import { entryHash, GENESIS_HASH, type LogEntry, type LogFields, signEntry } from "./log-entry.ts";
import {
  CLOCK_SKEW_SECONDS,
  certificateFor,
  idKey,
  isSuperseded,
  type Trust,
  verifyLog,
} from "./verify-log.ts";

// Weber Haustechnik: Sandra, an admin, made the vault "Büro" and added Anna; then Sandra left and
// Jonas replaced the company root (K-307 part f, P-07). Anna got a certificate of the new root for
// her same bundle; Sandra keeps only the old root's.
const id = (byte: number) => new Uint8Array(16).fill(byte);
const oldRoot = ed25519KeyPair(new Uint8Array(32).fill(0x01));
const newRoot = ed25519KeyPair(new Uint8Array(32).fill(0x02));
const company = id(0xc0);
const person = (byte: number) => ({
  id: id(byte),
  ed: ed25519KeyPair(new Uint8Array(32).fill(byte)),
  xwing: xwingKeyPair(new Uint8Array(32).fill(byte)),
});
const sandra = person(0x40);
const anna = person(0x20);
const max = person(0x30);
type Person = typeof anna;

const CHANGED_AT = 1_800_001_000;
const certificate = (p: Person, root = oldRoot.secretKey, issuedAt = 1_800_000_000): Certificate =>
  certify(root, {
    accountId: p.id,
    xwingPublicKey: p.xwing.publicKey,
    edPublicKey: p.ed.publicKey,
    companyId: company,
    role: "admin",
    issuedAt,
  });
const fp = (p: Person) => certificateFingerprint(certificate(p));

/** After the change, as a client that confirmed it checks: the old root retired at CHANGED_AT */
const afterChange = (retired = [{ publicKey: oldRoot.publicKey, until: CHANGED_AT }]): Trust => ({
  rootPublicKey: newRoot.publicKey,
  certificates: new Map([
    [idKey(sandra.id), certificate(sandra)],
    [idKey(anna.id), certificate(anna, newRoot.secretKey, CHANGED_AT)],
  ]),
  history: new Map([[idKey(anna.id), [certificate(anna)]]]),
  retired,
  now: CHANGED_AT + 10_000,
});

const vault = id(0xb0);
const commitment = keyCommitment(new Uint8Array(32).fill(1), "vault-key", vault, 0);
type Step = { action: LogFields["action"]; subject: Person; signer: Person; time: number };
const append = (entries: LogEntry[], steps: Step[]) =>
  steps.reduce<LogEntry[]>(
    (all, { subject, signer, action, time }) => {
      const prev = all.at(-1);
      all.push(
        signEntry(signer.ed.secretKey, {
          vaultId: vault,
          seq: all.length,
          prevHash: prev ? entryHash(prev) : GENESIS_HASH,
          epoch: 0,
          action,
          accountId: subject.id,
          fingerprint: action === "remove" ? new Uint8Array() : fp(subject),
          role: action === "remove" ? "" : "manage",
          validUntil: 0,
          vkCommitment: action === "remove" ? new Uint8Array() : commitment,
          time,
          signerId: signer.id,
          lastSeen: prev ? entryHash(prev) : new Uint8Array(),
        }),
      );
      return all;
    },
    [...entries],
  );

const before = append(
  [],
  [
    { action: "create", subject: sandra, signer: sandra, time: 1_800_000_100 },
    { action: "add", subject: anna, signer: sandra, time: 1_800_000_200 },
  ],
);

describe("a log after the company root changed (P-07)", () => {
  it("still verifies what the departed admin signed under the old root before the change", () => {
    const checked = verifyLog(vault, before, afterChange());
    expect(checked.ok).toBe(true);
    // Her certificate is the old root's, but her bundle is still hers: nothing is superseded
    expect(checked.ok && checked.value.superseded).toEqual([]);
  });

  it("does not verify the old root's certificate without the confirmed change", () => {
    expect(verifyLog(vault, before, afterChange([]))).toEqual({
      ok: false,
      error: "uncertified-signer",
    });
  });

  it("refuses what the departed admin signs after the change", () => {
    const late = CHANGED_AT + CLOCK_SKEW_SECONDS;
    const log = append(before, [{ action: "add", subject: max, signer: sandra, time: late }]);
    expect(verifyLog(vault, log, afterChange())).toEqual({
      ok: false,
      error: "uncertified-signer",
    });
  });

  it("allows the clock skew right after the change, as for a renewed bundle (P-12)", () => {
    const close = CHANGED_AT + CLOCK_SKEW_SECONDS - 1;
    const log = append(before, [{ action: "remove", subject: anna, signer: sandra, time: close }]);
    expect(verifyLog(vault, log, afterChange()).ok).toBe(true);
  });

  it("verifies what a re-certified member signs before and after the change", () => {
    const later = CHANGED_AT + 5_000;
    const log = append(before, [{ action: "remove", subject: sandra, signer: anna, time: later }]);
    const checked = verifyLog(vault, log, afterChange());
    expect(checked.ok).toBe(true);
    expect(checked.ok && checked.value.superseded).toEqual([]);
  });

  it("takes the new root's certificate once the old root's no longer counts", () => {
    const trust = afterChange();
    expect(certificateFor(trust, anna.id, fp(anna), CHANGED_AT - 1)).toEqual(certificate(anna));
    expect(certificateFor(trust, anna.id, fp(anna), CHANGED_AT + CLOCK_SKEW_SECONDS)).toEqual(
      certificate(anna, newRoot.secretKey, CHANGED_AT),
    );
    expect(certificateFor(trust, sandra.id, fp(sandra), CHANGED_AT + CLOCK_SKEW_SECONDS)).toBe(
      undefined,
    );
    // Without a signed time (a record, P-09) by the bundle alone, which the checked log names
    expect(certificateFor(trust, sandra.id, fp(sandra))).toEqual(certificate(sandra));
  });

  it("counts no old root certificate issued after the change, as the departed could make one", () => {
    const forged = (issuedAt: number): Trust => ({
      ...afterChange(),
      certificates: new Map([[idKey(sandra.id), certificate(sandra, oldRoot.secretKey, issuedAt)]]),
      history: new Map([[idKey(anna.id), [certificate(anna, oldRoot.secretKey, issuedAt)]]]),
    });
    const lateTrust = forged(CHANGED_AT + CLOCK_SKEW_SECONDS);
    expect(certificateFor(lateTrust, sandra.id, fp(sandra), CHANGED_AT - 1)).toBeUndefined();
    expect(certificateFor(lateTrust, anna.id, fp(anna), CHANGED_AT - 1)).toBeUndefined();
    const inTime = forged(CHANGED_AT + CLOCK_SKEW_SECONDS - 1);
    expect(certificateFor(inTime, sandra.id, fp(sandra), CHANGED_AT - 1)).toBeDefined();
  });

  it("calls no bundle superseded by a certificate of another key in the history", () => {
    const stranger = ed25519KeyPair(new Uint8Array(32).fill(0x66));
    const trust: Trust = {
      ...afterChange(),
      certificates: new Map(),
      history: new Map([[idKey(anna.id), [certificate(anna, stranger.secretKey)]]]),
    };
    expect(isSuperseded(trust, anna.id, fp(anna))).toBe(false);
    const honest = { ...trust, history: new Map([[idKey(anna.id), [certificate(anna)]]]) };
    expect(isSuperseded(honest, anna.id, fp(anna))).toBe(true);
    // A listed certificate of another key is no current certificate either
    const listed = new Map([[idKey(anna.id), certificate(anna, stranger.secretKey, CHANGED_AT)]]);
    expect(isSuperseded({ ...honest, certificates: listed }, anna.id, fp(anna))).toBe(true);
  });

  it("counts no certificate of another key, listed or in the history", () => {
    const stranger = ed25519KeyPair(new Uint8Array(32).fill(0x66));
    const trust: Trust = {
      ...afterChange(),
      certificates: new Map([[idKey(sandra.id), certificate(sandra, stranger.secretKey)]]),
      history: new Map([[idKey(anna.id), [certificate(anna, stranger.secretKey)]]]),
    };
    expect(certificateFor(trust, sandra.id, fp(sandra))).toBeUndefined();
    expect(certificateFor(trust, anna.id, fp(anna))).toBeUndefined();
  });
});
