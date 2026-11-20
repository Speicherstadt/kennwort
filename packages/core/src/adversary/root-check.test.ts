// K-206 review: pins the half of the E-05 fix in openRecord that checks the company root's
// signature and the account ID (certificateOf). eth.test.ts names these cases but refuses them
// through the fingerprint check, so replacing certificateOf with a plain map lookup keeps it green.
import { ed25519KeyPair } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { certify } from "../membership/certificate.ts";
import { idKey, type Trust } from "../membership/verify-log.ts";
import { openRecord, sealRecord } from "../sync/record.ts";
import {
  anna,
  bank,
  certificate,
  contextFor,
  id,
  log,
  person,
  root,
  trust,
} from "../sync/test/fixtures.ts";

const ctx = contextFor(anna);
// A record Anna really signed: only the certificate the server delivers for her is wrong
const record = sealRecord(ctx.author, ctx.ring, id(0xe1), 1, bank, ctx.lastSeen);
const openWith = (cert: ReturnType<typeof certificate>) => {
  const lying: Trust = {
    ...trust,
    certificates: new Map(trust.certificates).set(idKey(anna.id), cert),
  };
  return openRecord(record, ctx.ring, log, lying, 0);
};

describe("openRecord takes the author's key only from a root-signed certificate (E-05)", () => {
  it("refuses Anna's keys in a certificate a root the client did not pin signed", () => {
    const evilRoot = ed25519KeyPair(new Uint8Array(32).fill(0x67));
    expect(openWith(certify(evilRoot.secretKey, { ...certificate(anna) }))).toEqual({
      ok: false,
      error: "uncertified-author",
    });
  });

  it("refuses Anna's keys in a root-signed certificate made out to another account", () => {
    const mallory = person(0x66);
    expect(
      openWith(certify(root.secretKey, { ...certificate(anna), accountId: mallory.id })),
    ).toEqual({
      ok: false,
      error: "uncertified-author",
    });
  });
});
