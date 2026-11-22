// Regression (review of K-205): verifyAudit's replay check compares raw subject strings, but the signature (and the hash)
// encode strings in NFC. A malicious server replays a client-signed action with the same subject in
// a different Unicode normal form; the old signature still verifies and the replay goes unnoticed.
import { describe, expect, it } from "vitest";
import { encodeBytes } from "../sync/bytes.ts";
import { jonas } from "../sync/test/fixtures.ts";
import { toWire } from "../sync/wire.ts";
import {
  AUDIT_GENESIS,
  type AuditEvent,
  AuditExport,
  type AuditFields,
  chainAudit,
  signAudit,
  verifyAudit,
} from "./chain.ts";

const company = "weber";
const actor = encodeBytes(jonas.id);
const check = {
  companyId: company,
  publicKeysOf: (a: string) => (a === actor ? [jonas.ed.publicKey] : []),
};

describe("verifyAudit replay across Unicode normal forms", () => {
  it("refuses ill-formed text in any string, as an error value and in the export schema", () => {
    for (const change of [{ subject: "\ud800" }, { actor: "\udfff" }, { companyId: "e\u0301" }]) {
      const line = {
        ...chainAudit(AUDIT_GENESIS, {
          companyId: company,
          seq: 0,
          time: 1,
          actor,
          action: "signed-in",
          subject: "x",
          signature: new Uint8Array(),
        }),
        ...change,
      };
      expect(verifyAudit([line], { ...check, companyId: line.companyId })).toEqual({
        ok: false,
        error: { problem: "malformed", seq: 0 },
      });
      expect(AuditExport.safeParse({ companyId: company, events: [toWire(line)] }).success).toBe(
        false,
      );
    }
  });

  it("finds a client action replayed with its subject in NFD", () => {
    const nfc = "export-café".normalize("NFC");
    const nfd = nfc.normalize("NFD");
    expect(nfc).not.toBe(nfd);
    const signature = signAudit(jonas.ed.secretKey, {
      companyId: company,
      actor,
      action: "export",
      subject: nfc,
    });
    const fields = (seq: number, subject: string): AuditFields => ({
      companyId: company,
      seq,
      time: 1_800_000_000 + seq,
      actor,
      action: "export",
      subject,
      signature,
    });
    const first = chainAudit(AUDIT_GENESIS, fields(0, nfc));
    const replay = chainAudit(first.hash, fields(1, nfd));
    const events: AuditEvent[] = [first, replay];
    // Text that is not in NFC never passes: the replayed line stands out before its subject counts
    expect(verifyAudit(events, check)).toEqual({
      ok: false,
      error: { problem: "malformed", seq: 1 },
    });
    expect(
      AuditExport.safeParse({ companyId: company, events: events.map((e) => toWire(e)) }).success,
    ).toBe(false);
  });
});
