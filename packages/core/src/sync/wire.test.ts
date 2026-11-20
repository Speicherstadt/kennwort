import { describe, expect, it } from "vitest";
import type { LogEntry } from "../membership/log-entry.ts";
import { encodeBytes } from "./bytes.ts";
import { trust } from "./test/fixtures.ts";
import {
  CertificateWire,
  LogEntryWire,
  toWire,
  VaultKeysWire,
  VaultListWire,
  VaultLogWire,
} from "./wire.ts";

const certificate = [...trust.certificates.values()][0];
const entry: LogEntry = {
  vaultId: new Uint8Array(16).fill(1),
  seq: 3,
  prevHash: new Uint8Array(32).fill(2),
  epoch: 1,
  action: "add",
  accountId: new Uint8Array(16).fill(3),
  fingerprint: new Uint8Array(32).fill(4),
  role: "edit",
  validUntil: 0,
  vkCommitment: new Uint8Array(32).fill(5),
  time: 1_800_000_000,
  signerId: new Uint8Array(16).fill(6),
  lastSeen: new Uint8Array(),
  signature: new Uint8Array(65).fill(7),
};
const json = (value: Record<string, unknown>) => JSON.parse(JSON.stringify(toWire(value)));

describe("wire schemas", () => {
  it("read back a log entry and a certificate from JSON", () => {
    expect(LogEntryWire.parse(json(entry))).toEqual(entry);
    expect(CertificateWire.parse(json(certificate as unknown as Record<string, unknown>))).toEqual(
      certificate,
    );
  });

  it("refuse unknown actions and roles, negative numbers and keys of the wrong length", () => {
    expect(LogEntryWire.safeParse({ ...json(entry), action: "promote" }).success).toBe(false);
    expect(LogEntryWire.safeParse({ ...json(entry), role: "owner" }).success).toBe(false);
    expect(LogEntryWire.safeParse({ ...json(entry), seq: -1 }).success).toBe(false);
    expect(LogEntryWire.safeParse({ ...json(entry), signature: "AAAA" }).success).toBe(false);
    const cert = json(certificate as unknown as Record<string, unknown>);
    expect(CertificateWire.safeParse({ ...cert, edPublicKey: "AAAA" }).success).toBe(false);
    expect(CertificateWire.safeParse({ ...cert, role: "manage" }).success).toBe(false);
  });

  it.each(["create", "add", "remove", "role", "rotate"])("accept the action %s", (action) => {
    expect(LogEntryWire.safeParse({ ...json(entry), action }).success).toBe(true);
  });

  it.each(["read", "edit", "manage", ""])("accept the vault role %j", (role) => {
    expect(LogEntryWire.safeParse({ ...json(entry), role }).success).toBe(true);
  });

  it.each(["owner", "admin", "member"])("accept the company role %s", (role) => {
    const cert = json(certificate as unknown as Record<string, unknown>);
    expect(CertificateWire.safeParse({ ...cert, role }).success).toBe(true);
  });
});

// K-305 part 2: what GET /api/vaults, /log and /keys answer
describe("vault wire schemas", () => {
  const id = encodeBytes(new Uint8Array(16).fill(1));
  const name = encodeBytes(new Uint8Array(42).fill(2));

  it("reads the list with sealed names, or none yet", () => {
    const listed = VaultListWire.parse({
      vaults: [
        { id, name, nameEpoch: 0 },
        { id, name: null, nameEpoch: null },
      ],
    });
    expect(listed.vaults[0]?.id).toEqual(new Uint8Array(16).fill(1));
    expect(listed.vaults[0]?.name).toEqual(new Uint8Array(42).fill(2));
    expect(listed.vaults[1]).toEqual({
      id: new Uint8Array(16).fill(1),
      name: null,
      nameEpoch: null,
    });
    for (const vault of [
      { name, nameEpoch: 0 },
      { id: encodeBytes(new Uint8Array(15)), name, nameEpoch: 0 },
      { id, nameEpoch: 0 },
      { id, name },
      { id, name, nameEpoch: 0.5 },
    ])
      expect(VaultListWire.safeParse({ vaults: [vault] }).success).toBe(false);
    expect(VaultListWire.safeParse({}).success).toBe(false);
  });

  it("reads the log only as signed entries", () => {
    expect(VaultLogWire.parse({ entries: [] })).toEqual({ entries: [] });
    expect(VaultLogWire.safeParse({}).success).toBe(false);
    expect(VaultLogWire.safeParse({ entries: [{ seq: 0 }] }).success).toBe(false);
  });

  it("reads the keys by epoch", () => {
    const wrapped = encodeBytes(new Uint8Array(3).fill(4));
    expect(VaultKeysWire.parse({ keys: [{ epoch: 0, wrapped }] })).toEqual({
      keys: [{ epoch: 0, wrapped: new Uint8Array(3).fill(4) }],
    });
    for (const key of [{ wrapped }, { epoch: 0 }, { epoch: -1, wrapped }, { epoch: 1.5, wrapped }])
      expect(VaultKeysWire.safeParse({ keys: [key] }).success).toBe(false);
    expect(VaultKeysWire.safeParse({}).success).toBe(false);
  });
});
