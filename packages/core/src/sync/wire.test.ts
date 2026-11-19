import { describe, expect, it } from "vitest";
import type { LogEntry } from "../membership/log-entry.ts";
import { trust } from "./sync.test-helpers.ts";
import { CertificateWire, LogEntryWire, toWire } from "./wire.ts";

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
