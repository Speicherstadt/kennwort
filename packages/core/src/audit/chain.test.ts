import { digest, encode } from "@kennwort/crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { encodeBytes } from "../sync/bytes.ts";
import { anna, jonas } from "../sync/test/fixtures.ts";
import { toWire } from "../sync/wire.ts";
import {
  AUDIT_GENESIS,
  type AuditAction,
  type AuditEvent,
  AuditExport,
  type AuditFields,
  auditHash,
  CLIENT_ACTIONS,
  chainAudit,
  isClientAction,
  SERVER_ACTIONS,
  signAudit,
  verifyAudit,
} from "./chain.ts";

const company = "weber";
const ids = { jonas: encodeBytes(jonas.id), anna: encodeBytes(anna.id) };
const keys = new Map([
  [ids.jonas, jonas.ed.publicKey],
  [ids.anna, anna.ed.publicKey],
]);
const check = {
  companyId: company,
  publicKeysOf: (actor: string) => {
    const key = keys.get(actor);
    return key ? [key] : [];
  },
};

type Step = { actor: string; action: AuditAction; subject: string; signedBy?: Uint8Array };
const steps: Step[] = [
  { actor: ids.jonas, action: "vault-created", subject: "büro" },
  { actor: ids.jonas, action: "invitation-created", subject: "inv-1" },
  { actor: ids.anna, action: "invitation-accepted", subject: "inv-1" },
  { actor: ids.anna, action: "signed-in", subject: "passkey" },
  { actor: ids.jonas, action: "export", subject: "export-7f3a", signedBy: jonas.ed.secretKey },
];

/** Chains fields like the server does, starting from the genesis hash */
const chainAll = (list: AuditFields[]) => {
  const out: AuditEvent[] = [];
  for (const [seq, fields] of list.entries())
    out.push(chainAudit(out.at(-1)?.hash ?? AUDIT_GENESIS, { ...fields, seq }));
  return out;
};

const build = (list: Step[], companyId = company): AuditEvent[] =>
  chainAll(
    list.map((step, seq) => ({
      companyId,
      seq,
      time: 1_800_000_000 + seq,
      actor: step.actor,
      action: step.action,
      subject: step.subject,
      signature: step.signedBy
        ? signAudit(step.signedBy, {
            companyId,
            actor: step.actor,
            action: step.action as "export",
            subject: step.subject,
          })
        : new Uint8Array(),
    })),
  );

const events = build(steps);
const rehash = (list: AuditEvent[]) => chainAll(list);

describe("verifyAudit", () => {
  it("accepts the chain and returns its head; an empty chain starts at the genesis hash", () => {
    expect(verifyAudit(events, check)).toEqual({
      ok: true,
      value: { length: 5, hash: events[4]?.hash },
    });
    expect(verifyAudit([], check)).toEqual({ ok: true, value: { length: 0, hash: AUDIT_GENESIS } });
    expect(events[0]?.prevHash).toEqual(AUDIT_GENESIS);
    expect(events[1]?.prevHash).toEqual(events[0]?.hash);
  });

  it("finds a changed line", () => {
    const changed = events.map((e, i) => (i === 2 ? { ...e, subject: "inv-2" } : e));
    expect(verifyAudit(changed, check)).toEqual({
      ok: false,
      error: { problem: "changed", seq: 2 },
    });
  });

  it("finds a missing line, a duplicate and a swap by the sequence numbers", () => {
    const without = events.filter((_, i) => i !== 1);
    expect(verifyAudit(without, check)).toEqual({ ok: false, error: { problem: "gap", seq: 1 } });
    const twice = [events[0], events[1], events[1], events[2]] as AuditEvent[];
    expect(verifyAudit(twice, check)).toEqual({ ok: false, error: { problem: "gap", seq: 2 } });
  });

  it("finds a line inserted or removed with the numbers fixed but the hashes not", () => {
    const forged = chainAudit(events[0]?.hash as Uint8Array, {
      ...(events[1] as AuditEvent),
      subject: "inv-x",
    });
    const renumbered = [
      events[0],
      forged,
      ...events.slice(1).map((e) => ({ ...e, seq: e.seq + 1 })),
    ] as AuditEvent[];
    expect(verifyAudit(renumbered, check)).toEqual({
      ok: false,
      error: { problem: "broken-chain", seq: 2 },
    });
  });

  it("finds a line of another company", () => {
    expect(verifyAudit(build(steps, "mueller"), check)).toEqual({
      ok: false,
      error: { problem: "wrong-company", seq: 0 },
    });
  });

  it("needs the actor's own signature on a client action", () => {
    const unsigned = rehash(
      events.map((e, i) => (i === 4 ? { ...e, signature: new Uint8Array() } : e)),
    );
    expect(verifyAudit(unsigned, check)).toEqual({
      ok: false,
      error: { problem: "bad-signature", seq: 4 },
    });
    const byAnna = build([
      ...steps.slice(0, 4),
      { ...steps[4], signedBy: anna.ed.secretKey } as Step,
    ]);
    expect(verifyAudit(byAnna, check)).toEqual({
      ok: false,
      error: { problem: "bad-signature", seq: 4 },
    });
    const otherSubject = rehash(
      events.map((e, i) => (i === 4 ? { ...e, subject: "export-other" } : e)),
    );
    expect(verifyAudit(otherSubject, check)).toEqual({
      ok: false,
      error: { problem: "bad-signature", seq: 4 },
    });
    expect(verifyAudit(events, { ...check, publicKeysOf: () => [] })).toEqual({
      ok: false,
      error: { problem: "bad-signature", seq: 4 },
    });
  });

  it("checks a client action against each key of an actor who renewed her keys (P-12)", () => {
    const events = build(steps);
    const renewed = { ...check, publicKeysOf: () => [anna.ed.publicKey, jonas.ed.publicKey] };
    expect(verifyAudit(events, renewed).ok).toBe(true);
    const others = { ...check, publicKeysOf: () => [anna.ed.publicKey] };
    expect(verifyAudit(events, others)).toEqual({
      ok: false,
      error: { problem: "bad-signature", seq: 4 },
    });
    expect(verifyAudit(events, { ...check, publicKeysOf: () => [] })).toEqual({
      ok: false,
      error: { problem: "bad-signature", seq: 4 },
    });
  });

  it("finds a signed client action that the server repeats", () => {
    const replayed = build([...steps, steps[4] as Step]);
    expect(verifyAudit(replayed, check)).toEqual({
      ok: false,
      error: { problem: "replayed", seq: 5 },
    });
    const otherAction = build([...steps, { ...steps[4], action: "recovery" } as Step]);
    expect(verifyAudit(otherAction, check).ok).toBe(true);
    const serverTwice = build([...steps, steps[3] as Step]);
    expect(verifyAudit(serverTwice, check).ok).toBe(true);
  });

  it("finds a shortened or rewritten log against the head the client remembered", () => {
    const head = { length: 4, hash: events[3]?.hash as Uint8Array };
    expect(verifyAudit(events, { ...check, remembered: head }).ok).toBe(true);
    expect(verifyAudit(events.slice(0, 4), { ...check, remembered: head }).ok).toBe(true);
    expect(verifyAudit(events.slice(0, 3), { ...check, remembered: head })).toEqual({
      ok: false,
      error: { problem: "truncated", seq: 3 },
    });
    // The server knows no secret: it can rebuild a whole chain, but not the head a client saw
    const rewritten = rehash(events.map((e, i) => (i === 1 ? { ...e, subject: "inv-x" } : e)));
    expect(verifyAudit(rewritten, check).ok).toBe(true);
    expect(verifyAudit(rewritten, { ...check, remembered: head })).toEqual({
      ok: false,
      error: { problem: "forked", seq: 3 },
    });
    expect(
      verifyAudit(rewritten, { ...check, remembered: { length: 0, hash: AUDIT_GENESIS } }).ok,
    ).toBe(true);
  });

  it("finds any change to any field of any line", () => {
    const fields = [
      "companyId",
      "seq",
      "time",
      "actor",
      "action",
      "subject",
      "signature",
      "prevHash",
      "hash",
    ] as const;
    fc.assert(
      fc.property(
        fc.nat(events.length - 1),
        fc.constantFrom(...fields),
        fc.nat(255),
        (index, field, byte) => {
          const e = events[index] as AuditEvent;
          const value = e[field];
          const changed =
            value instanceof Uint8Array
              ? Uint8Array.from(value.length ? value : [0], (b, i) =>
                  i === 0 ? b ^ (byte | 1) : b,
                )
              : typeof value === "number"
                ? value + 1 + byte
                : field === "action"
                  ? value === "signed-in"
                    ? "export"
                    : "signed-in"
                  : `${value}~`;
          const list = events.map((x, i) => (i === index ? { ...x, [field]: changed } : x));
          expect(verifyAudit(list, check).ok).toBe(false);
        },
      ),
    );
  });

  it("hashes the previous hash and the event exactly as P-20 writes it", () => {
    const e = events[1] as AuditEvent;
    const fields = [e.companyId, e.seq, e.time, e.actor, e.action, e.subject, e.signature] as const;
    const expected = digest(
      encode("kennwort/audit/v1", e.prevHash, encode("kennwort/audit-event/v1", ...fields)),
    );
    expect(auditHash(e.prevHash, e)).toEqual(expected);
    expect(e.hash).toEqual(expected);
  });

  it("finds a hash cut short", () => {
    const cut = events.map((e, i) =>
      i === 1 ? { ...e, prevHash: e.prevHash.subarray(0, 31) } : e,
    );
    expect(verifyAudit(cut, check)).toEqual({
      ok: false,
      error: { problem: "broken-chain", seq: 1 },
    });
  });
});

describe("AuditExport", () => {
  it("reads back the export the server writes, and nothing that is not one", () => {
    const wire = { companyId: company, events: events.map((e) => toWire(e)) };
    expect(AuditExport.parse(JSON.parse(JSON.stringify(wire)))).toEqual({
      companyId: company,
      events,
    });
    const bad = (change: object) => ({ ...wire, events: [{ ...wire.events[0], ...change }] });
    for (const change of [
      { action: "deleted" },
      { seq: -1 },
      { hash: "AAAA" },
      { companyId: 7 },
      { actor: null },
    ])
      expect(AuditExport.safeParse(bad(change)).success).toBe(false);
    expect(AuditExport.safeParse({ events: wire.events }).success).toBe(false);
    for (const action of [...SERVER_ACTIONS, ...CLIENT_ACTIONS])
      expect(AuditExport.safeParse(bad({ action })).success).toBe(true);
  });
});

describe("server actions", () => {
  it("name the steps of a one-time link the server records (K-601)", () => {
    for (const action of ["link-created", "link-opened", "link-revoked"])
      expect(SERVER_ACTIONS).toContain(action);
  });

  it("name an enrolment and a link through OpenID Connect, which only the server sees (K-604)", () => {
    for (const action of ["oidc-enrolled", "oidc-linked"]) {
      expect(SERVER_ACTIONS).toContain(action);
      expect(isClientAction(action as AuditAction)).toBe(false);
    }
  });
});
