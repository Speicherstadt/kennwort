import { describe, expect, it } from "vitest";
import { anna, certificate, jonas, logEntries, max, vaultId } from "../sync/test/fixtures.ts";
import { certificateFingerprint } from "./certificate.ts";
import { dueRekeys, rekeyMember } from "./renewal.ts";
import {
  annaNew,
  RENEWED_AT,
  renewedCertificate,
  renewedTrust,
  withheldTrust,
} from "./test/renewed.ts";
import { idKey, type Member, verifyLog } from "./verify-log.ts";

const checked = (trust = renewedTrust()) => {
  const state = verifyLog(vaultId, logEntries, trust);
  if (!state.ok) throw new Error(state.error);
  return state.value;
};
const signer = (p: typeof jonas) => ({ accountId: p.id, edSecretKey: p.ed.secretKey });

describe("rekeyMember (P-12)", () => {
  it("names the renewed bundle with the member's role and time, as the next link", () => {
    const state = checked();
    const made = rekeyMember(signer(annaNew), state, vaultId, renewedCertificate, RENEWED_AT + 10);
    if (!made.ok) throw new Error(made.error);
    expect(made.value).toMatchObject({
      vaultId,
      seq: state.seq + 1,
      prevHash: state.hash,
      lastSeen: state.hash,
      epoch: state.epoch,
      action: "rekey",
      accountId: anna.id,
      fingerprint: certificateFingerprint(renewedCertificate),
      role: "edit",
      validUntil: 0,
      vkCommitment: new Uint8Array(),
      time: RENEWED_AT + 10,
      signerId: anna.id,
    });
    const after = verifyLog(vaultId, [...logEntries, made.value], renewedTrust());
    expect(after.ok && after.value.members.get(idKey(anna.id))?.fingerprint).toEqual(
      certificateFingerprint(renewedCertificate),
    );
  });

  it("keeps a member's time limit", () => {
    const state = checked();
    const limited = new Map(state.members);
    limited.set(idKey(anna.id), {
      ...(state.members.get(idKey(anna.id)) as Member),
      validUntil: 99,
    });
    const made = rekeyMember(
      signer(jonas),
      { ...state, members: limited },
      vaultId,
      renewedCertificate,
      1,
    );
    expect(made.ok && made.value.validUntil).toBe(99);
  });

  it("makes nothing for an account the log does not name", () => {
    const state = checked();
    const others = new Map(state.members);
    others.delete(idKey(anna.id));
    expect(
      rekeyMember(signer(jonas), { ...state, members: others }, vaultId, renewedCertificate, 1),
    ).toEqual({
      ok: false,
      error: "not-member",
    });
  });
});

describe("dueRekeys", () => {
  it("gives the renewed certificate of each member the log names with an old bundle", () => {
    expect(dueRekeys(checked(), renewedTrust())).toEqual([renewedCertificate]);
  });

  it("gives none while the new certificate is withheld, nor for members who did not renew", () => {
    expect(dueRekeys(checked(withheldTrust()), withheldTrust())).toEqual([]);
    expect(checked(withheldTrust()).superseded).toEqual([idKey(anna.id)]);
    expect(checked().superseded).toEqual([idKey(anna.id)]);
  });

  it("gives none for a certificate filed under another account", () => {
    const misfiled = renewedTrust();
    misfiled.certificates.set(idKey(max.id), certificate(jonas));
    expect(dueRekeys({ ...checked(), superseded: [idKey(max.id)] }, misfiled)).toEqual([]);
    const unsigned = renewedTrust();
    unsigned.certificates.set(idKey(anna.id), {
      ...renewedCertificate,
      signature: new Uint8Array(65),
    });
    expect(dueRekeys(checked(), unsigned)).toEqual([]);
  });
});
