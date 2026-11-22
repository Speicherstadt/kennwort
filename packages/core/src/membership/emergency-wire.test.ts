import { describe, expect, it } from "vitest";
import { recordToWire, sealRecord } from "../sync/record.ts";
import { fullGrant, GRANTED_AT, grantTo, jonas, ring, sandra } from "../sync/test/emergency.ts";
import { bank, logEntries } from "../sync/test/fixtures.ts";
import { toWire } from "../sync/wire.ts";
import { signStatement } from "./emergency.ts";
import {
  EmergencyListWire,
  EmergencyVaultsWire,
  grantToWire,
  packagesToWire,
  ReleaseWire,
  statementToWire,
} from "./emergency-wire.ts";
import { entryHash } from "./log-entry.ts";

// What GET /api/emergency and the release routes answer, read back as the server wrote it
const { grant, packages } = grantTo();
const request = signStatement("emergency-request", sandra.ed.secretKey, grant, GRANTED_AT + 1);
const objection = signStatement("emergency-objection", jonas.ed.secretKey, grant, GRANTED_AT + 1);
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
const listed = {
  grant,
  request,
  objection,
  approval: null,
  releaseAt: GRANTED_AT + 7,
};
const listedWire = {
  ...listed,
  grant: grantToWire(grant),
  request: statementToWire(request),
  objection: statementToWire(objection),
};

describe("emergency access on the wire", () => {
  it("reads the lists back, and nothing without its parts", () => {
    const wire = {
      given: [listedWire],
      received: [listedWire],
      revocations: [statementToWire(request)],
    };
    expect(EmergencyListWire.parse(json(wire))).toEqual({
      given: [listed],
      received: [listed],
      revocations: [request],
    });
    const { releaseAt: _, ...noRelease } = listedWire;
    expect(EmergencyListWire.safeParse(json({ ...wire, given: [noRelease] })).success).toBe(false);
    expect(EmergencyListWire.safeParse(json({ given: [], received: [] })).success).toBe(false);
  });

  it("reads a release back, with the key block of a full grant", () => {
    const full = fullGrant();
    const wire = {
      packages: packagesToWire(full.packages),
      request: statementToWire(request),
      approval: null,
      keyBlock: "AAAA",
    };
    expect(ReleaseWire.parse(json(wire))).toEqual({
      packages: full.packages,
      request,
      approval: null,
      keyBlock: new Uint8Array(3),
    });
    expect(ReleaseWire.safeParse(json({ ...wire, keyBlock: undefined })).success).toBe(false);
    const view = { ...wire, packages: packagesToWire(packages), keyBlock: null };
    expect(ReleaseWire.parse(json(view)).packages).toEqual(packages);
  });

  it("reads the released vaults back with log, keys and records", () => {
    const record = sealRecord(
      { id: jonas.id, edSecretKey: jonas.ed.secretKey },
      ring,
      new Uint8Array(16).fill(0xe1),
      1,
      bank,
      entryHash(logEntries[0] as (typeof logEntries)[number]),
    );
    const vault = {
      id: ring.vaultId,
      name: null,
      nameEpoch: null,
      log: logEntries,
      keys: [{ epoch: 0, wrapped: new Uint8Array(3) }],
      records: [record],
    };
    const wire = {
      vaults: [
        {
          ...toWire(vault),
          log: logEntries.map((e) => toWire(e)),
          keys: [{ epoch: 0, wrapped: "AAAA" }],
          records: [recordToWire(record)],
        },
      ],
    };
    expect(EmergencyVaultsWire.parse(json(wire))).toEqual({ vaults: [vault] });
    const noKeys = { vaults: [{ ...wire.vaults[0], keys: [{ epoch: 0 }] }] };
    expect(EmergencyVaultsWire.safeParse(json(noKeys)).success).toBe(false);
  });
});
