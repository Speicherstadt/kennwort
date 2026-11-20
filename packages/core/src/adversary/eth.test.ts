/**
 * The first attacks of the ETH study (docs/sicherheitsdesign.md, catalog E-01…E-27) against the
 * client, served by a server that lies on purpose. Each test names its attack; the client must
 * refuse every one and say why. The rest follow with the features they concern (K-701).
 */
import { digest, encode, sign } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { certify } from "../membership/certificate.ts";
import { certifyInvited, invitationMac, newInvitation } from "../membership/invitation.ts";
import { entryHash, type LogEntry, signEntry } from "../membership/log-entry.ts";
import { idKey, remember, type Trust, verifyLog } from "../membership/verify-log.ts";
import { edit, emptyDevice, pull, type Refused, sync } from "../sync/device.ts";
import { memoryServer } from "../sync/memory-server.ts";
import { type EntryRecord, sealRecord } from "../sync/record.ts";
import {
  anna,
  bank,
  certificate,
  contextFor,
  id,
  jonas,
  logEntries,
  max,
  type Person,
  person,
  root,
  trust,
  vaultId,
  withField,
} from "../sync/test/fixtures.ts";
import { flipByte, lyingServer } from "./lying-server.ts";

const mallory = person(0x66);
const errors = (refused: Refused[]) => refused.map((r) => r.error);

/** Jonas saved two entries; the server holds them honestly until it starts to lie */
const honestServer = async () => {
  const server = memoryServer();
  let device = edit(emptyDevice(), id(0xe1), bank);
  device = edit(device, id(0xe2), withField(bank, "password", "Zweites-2026!"));
  await sync(device, server, contextFor(jonas));
  return server;
};
const annaPulls = async (lie: Parameters<typeof lyingServer>[1], ctx = contextFor(anna)) =>
  pull(emptyDevice(), lyingServer(await honestServer(), lie), ctx);

const swapField = <K extends keyof EntryRecord>(records: EntryRecord[], field: K) => {
  const [a, b] = records as [EntryRecord, EntryRecord];
  return [
    { ...a, [field]: b[field] },
    { ...b, [field]: a[field] },
  ];
};

describe("E-02 the server enrols an account of its own through an invitation (P-08)", () => {
  const jonasAk = new Uint8Array(32).fill(0x11);
  const bundle = (p: Person) => ({
    accountId: p.id,
    xwingPublicKey: p.xwing.publicKey,
    edPublicKey: p.ed.publicKey,
  });
  const certifier = {
    accountKey: jonasAk,
    accountId: jonas.id,
    companyId: id(0xc0),
    rootSecretKey: root.secretKey,
  };
  /** Jonas invited Anna; the server holds the sealed secret, Anna's bundle and her MAC */
  const invited = () => {
    const invitation = newInvitation(jonasAk, jonas.id);
    const mac = invitationMac(invitation.secret, invitation.id, bundle(anna));
    return {
      invitation,
      served: { id: invitation.id, sealedSecret: invitation.sealedSecret, mac },
    };
  };

  it("does not get its own bundle certified in place of the invitee's", () => {
    const { served } = invited();
    const result = certifyInvited(certifier, { ...bundle(mallory), invitation: served });
    expect(result).toEqual({ ok: false, error: "mac-mismatch" });
  });

  it("cannot make a MAC for its bundle without the secret from the link", () => {
    const { served } = invited();
    const forged = invitationMac(new Uint8Array(32), served.id, bundle(mallory));
    const result = certifyInvited(certifier, {
      ...bundle(mallory),
      invitation: { ...served, mac: forged },
    });
    expect(result).toEqual({ ok: false, error: "mac-mismatch" });
  });

  it("cannot reuse Anna's answer for a second invitation it made up", () => {
    const { served } = invited();
    const other = newInvitation(jonasAk, jonas.id);
    const result = certifyInvited(certifier, {
      ...bundle(anna),
      invitation: { ...served, id: other.id, sealedSecret: other.sealedSecret },
    });
    expect(result).toEqual({ ok: false, error: "mac-mismatch" });
  });
});

describe("E-05 the server swaps a member's public key", () => {
  it("refuses a record signed under a certificate the company root never signed", async () => {
    const forged = { ...certificate(anna), edPublicKey: mallory.ed.publicKey };
    const lyingTrust: Trust = {
      ...trust,
      certificates: new Map(trust.certificates).set(idKey(anna.id), forged),
    };
    const ctx = { ...contextFor(anna), trust: lyingTrust };
    const { refused } = await annaPulls(
      {
        pull: (records) =>
          records.map((r) => ({
            ...r,
            author: anna.id,
            signature: resign(r, mallory.ed.secretKey),
          })),
      },
      ctx,
    );
    expect(errors(refused)).toEqual(["uncertified-author", "uncertified-author"]);
  });

  it("refuses a real certificate of another employee filed under a vault member", async () => {
    // Mallory is certified by the company but no member of the vault; the server files her
    // certificate under Anna, who may edit, and signs as Anna with Mallory's key
    const lyingTrust: Trust = {
      ...trust,
      certificates: new Map(trust.certificates).set(idKey(anna.id), certificate(mallory)),
    };
    const { refused } = await annaPulls(
      {
        pull: (records) =>
          records.map((r) => ({
            ...r,
            author: anna.id,
            signature: resign(r, mallory.ed.secretKey),
          })),
      },
      { ...contextFor(anna), trust: lyingTrust },
    );
    expect(errors(refused)).toEqual(["uncertified-author", "uncertified-author"]);
  });
});

/** Re-signs exactly the fields the author signed (P-09), with the server's key */
const resign = (r: EntryRecord, secretKey: Uint8Array) =>
  sign(
    secretKey,
    "entry",
    r.vaultId,
    r.entryId,
    r.version,
    r.epoch,
    digest(encode(r.entryKey, r.content)),
    r.lastSeen,
  );

describe("E-05 with a certificate the root did sign", () => {
  it("refuses a root-signed certificate of the member that the vault log does not name", async () => {
    // Anna's key from another time (say before a lost device), still signed by the company root;
    // the log names her current certificate by its fingerprint
    const other = certify(root.secretKey, {
      ...certificate(anna),
      edPublicKey: mallory.ed.publicKey,
      issuedAt: 1_700_000_000,
    });
    const lyingTrust: Trust = {
      ...trust,
      certificates: new Map(trust.certificates).set(idKey(anna.id), other),
    };
    const { refused } = await annaPulls(
      {
        pull: (records) =>
          records.map((r) => ({
            ...r,
            author: anna.id,
            signature: resign(r, mallory.ed.secretKey),
          })),
      },
      { ...contextFor(anna), trust: lyingTrust },
    );
    expect(errors(refused)).toEqual(["uncertified-author", "uncertified-author"]);
  });
});

describe("E-06 the server smuggles a member into a vault", () => {
  const addMallory = (signer: { id: Uint8Array; ed: { secretKey: Uint8Array } }) =>
    signEntry(signer.ed.secretKey, {
      ...(logEntries[2] as LogEntry),
      seq: 3,
      prevHash: entryHash(logEntries[2] as LogEntry),
      accountId: mallory.id,
      role: "edit",
      time: 1_800_000_003,
      signerId: signer.id,
      lastSeen: entryHash(logEntries[2] as LogEntry),
    });
  const withMallory = {
    ...trust,
    certificates: new Map(trust.certificates).set(idKey(mallory.id), certificate(mallory)),
  };

  it("refuses an addition signed by the server's own key", () => {
    expect(verifyLog(vaultId, [...logEntries, addMallory(mallory)], withMallory)).toEqual({
      ok: false,
      error: "not-manager",
    });
  });

  it("refuses an addition signed by a member who only reads", () => {
    expect(verifyLog(vaultId, [...logEntries, addMallory(max)], withMallory)).toEqual({
      ok: false,
      error: "not-manager",
    });
  });

  it("refuses an addition with a signature that does not verify", () => {
    const forged = { ...addMallory(jonas), signature: flipByte(addMallory(jonas).signature) };
    expect(verifyLog(vaultId, [...logEntries, forged], withMallory)).toEqual({
      ok: false,
      error: "bad-signature",
    });
  });
});

describe("E-07 the server drops, reorders or rolls back log entries", () => {
  it("refuses a log with an entry left out or two swapped", () => {
    const [genesis, addAnna, addMax] = logEntries as [LogEntry, LogEntry, LogEntry];
    expect(verifyLog(vaultId, [genesis, addMax], trust)).toEqual({ ok: false, error: "gap" });
    expect(verifyLog(vaultId, [genesis, addMax, addAnna], trust)).toEqual({
      ok: false,
      error: "gap",
    });
  });

  it("refuses an older log than the one the client remembered", () => {
    const full = verifyLog(vaultId, logEntries, trust);
    if (!full.ok) throw new Error(full.error);
    expect(verifyLog(vaultId, logEntries.slice(0, 2), trust, remember(full.value))).toEqual({
      ok: false,
      error: "rollback",
    });
  });
});

describe("E-10 the server swaps the company root key", () => {
  it("refuses certificates of a root the client did not pin", () => {
    const evilRoot = person(0x67).ed;
    const reissued = new Map(
      [jonas, anna, max].map((p) => [
        idKey(p.id),
        certify(evilRoot.secretKey, { ...certificate(p) }),
      ]),
    );
    expect(verifyLog(vaultId, logEntries, { ...trust, certificates: reissued })).toEqual({
      ok: false,
      error: "uncertified-signer",
    });
  });
});

describe("E-12 the server moves ciphertexts between entries or vaults", () => {
  it("refuses contents and entry keys swapped between two entries", async () => {
    for (const field of ["content", "entryKey"] as const) {
      const { refused } = await annaPulls({ pull: (records) => swapField(records, field) });
      expect(errors(refused)).toEqual(["bad-signature", "bad-signature"]);
    }
  });

  it("refuses a whole record filed under another entry", async () => {
    const { refused } = await annaPulls({ pull: (records) => swapField(records, "entryId") });
    expect(errors(refused)).toEqual(["bad-signature", "bad-signature"]);
  });

  it("refuses a record of another vault", async () => {
    const { refused } = await annaPulls({
      pull: (records) => records.map((r) => ({ ...r, vaultId: id(0xb1) })),
    });
    expect(errors(refused)).toEqual(["wrong-vault", "wrong-vault"]);
  });
});

describe("E-13 the server plays back an old version", () => {
  it("reports the older version as a rollback and keeps the newer one", async () => {
    const server = await honestServer();
    const ctx = contextFor(anna);
    let laptop = (await pull(emptyDevice(), server, ctx)).device;
    const old = server.pull().find((r) => idKey(r.entryId) === idKey(id(0xe1))) as EntryRecord;
    laptop = (
      await sync(edit(laptop, id(0xe1), withField(bank, "password", "Neu-2027!")), server, ctx)
    ).device;
    const replaying = lyingServer(server, {
      pull: (records) => records.map((r) => (idKey(r.entryId) === idKey(old.entryId) ? old : r)),
    });
    const result = await pull(laptop, replaying, ctx);
    expect(errors(result.refused)).toEqual(["rollback"]);
    expect(result.device.known.get(idKey(old.entryId))?.version).toBe(2);
  });
});

describe("E-15 the server hides an entry", () => {
  it("reports an entry the device knew that is no longer served", async () => {
    const server = await honestServer();
    const laptop = (await pull(emptyDevice(), server, contextFor(anna))).device;
    const hiding = lyingServer(server, { pull: (records) => records.slice(1) });
    expect(errors((await pull(laptop, hiding, contextFor(anna))).refused)).toEqual(["missing"]);
  });
});

describe("E-16 the server slips in an entry key it knows", () => {
  it("refuses a record whose entry key was replaced", async () => {
    const own = sealRecord(
      { id: jonas.id, edSecretKey: jonas.ed.secretKey },
      { ...contextFor(jonas).ring, vaultKey: new Uint8Array(32).fill(0x99) },
      id(0xe1),
      1,
      bank,
      new Uint8Array(),
    );
    const { refused } = await annaPulls({
      pull: (records) => records.map((r) => ({ ...r, entryKey: own.entryKey })),
    });
    expect(errors(refused)).toEqual(["bad-signature", "bad-signature"]);
  });
});

describe("E-17 and E-19 the server forces an old format or protocol version", () => {
  it("refuses a ciphertext and a signature with another version byte", async () => {
    const downgrade = (bytes: Uint8Array) => flipByte(bytes, 0);
    for (const field of ["content", "entryKey", "signature"] as const) {
      const { refused } = await annaPulls({
        pull: (records) => records.map((r) => ({ ...r, [field]: downgrade(r[field]) })),
      });
      expect(errors(refused)).toEqual(["bad-signature", "bad-signature"]);
    }
  });
});

describe("the lying server", () => {
  it("passes pushes through unless the lie answers them", async () => {
    const honest = memoryServer();
    const passing = lyingServer(honest, {});
    const record = sealRecord(
      contextFor(jonas).author,
      contextFor(jonas).ring,
      id(0xe1),
      1,
      bank,
      new Uint8Array(),
    );
    expect(await passing.push(record)).toEqual({ ok: true });
    expect(await passing.pull()).toEqual([record]);
    const refusing = lyingServer(honest, { push: () => ({ ok: false, current: undefined }) });
    expect(await refusing.push(record)).toEqual({ ok: false, current: undefined });
    expect(flipByte(new Uint8Array([1, 2]))).toEqual(new Uint8Array([1, 3]));
    expect(flipByte(new Uint8Array([1, 2]), 0)).toEqual(new Uint8Array([0, 2]));
  });
});
