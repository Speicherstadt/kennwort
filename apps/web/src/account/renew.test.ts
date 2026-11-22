import { type Certificate, encodeBytes, isCertified } from "@kennwort/core";
import { bundleFingerprint, comparisonCode, keyBlockFingerprint } from "@kennwort/crypto";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { annaRow, type Row } from "../members/members.test-kit.ts";
import { derive, PASSPHRASE } from "../session/session.test-kit.ts";
import { renewalServer } from "./renew.test-kit.ts";
import { confirmRenewed, renewAccount, renewedCode } from "./renew.ts";

// K-307 part e (P-12): renewing the account's keys in the web app, against a server in memory
describe("renewAccount", () => {
  it("renews every key, opens the account under them and, holding the root key, certifies them", async () => {
    const { c, s, api, uploads } = await renewalServer();
    const before = c.session.device()?.secretKey;
    const renewed = await renewAccount(api, c.session, undefined, PASSPHRASE, derive);
    if (!renewed.ok) throw new Error(renewed.error);
    const opened = c.session.opened();
    expect(uploads).toHaveLength(1);
    expect(opened?.accountKey).not.toEqual(c.upload.keyBlock);
    expect(opened?.keyBlock.ed.publicKey).toEqual(uploads[0]?.edPublicKey);
    expect(c.session.device()?.secretKey).toEqual(renewed.value.keys.secretKey);
    expect(renewed.value.keys.secretKey).not.toEqual(before);
    expect(renewed.value.code).toBe(comparisonCode(keyBlockFingerprint(opened?.keyBlock as never)));
    // Jonas owns the company and holds the root key: he confirms his new bundle himself
    expect(renewed.value.certified).toBe(true);
    const [certificate] = s.certified;
    expect(certificate && isCertified(c.rootPublicKey, certificate)).toBe(true);
    expect(certificate?.edPublicKey).toEqual(uploads[0]?.edPublicKey);
    expect(certificate?.issuedAt).toBeGreaterThan(c.certificate.issuedAt);
    expect(c.session.opened()?.state.certificates[encodeBytes(c.opened.accountId)]).toBe(
      certificate?.issuedAt,
    );
  });

  it("sends nothing for a passphrase that does not open the account", async () => {
    const { c, api, uploads } = await renewalServer();
    expect(await renewAccount(api, c.session, undefined, "Vertippt", derive)).toEqual({
      ok: false,
      error: "wrong-passphrase",
    });
    expect(uploads).toEqual([]);
  });

  it("does nothing while the account is locked", async () => {
    const { c, api } = await renewalServer();
    c.session.lock();
    flush();
    expect(await renewAccount(api, c.session, undefined, PASSPHRASE, derive)).toEqual({
      ok: false,
      error: "locked",
    });
  });
});

describe("confirming a member's renewed keys", () => {
  const renewedAnna = async () => {
    const r = await renewalServer();
    const { row, account } = annaRow(r.c);
    const old = { ...row, invitation: null, certificate: null };
    const anna = annaRow(r.c).account;
    const renewedRow: Row = {
      ...old,
      xwingPublicKey: anna.upload.xwingPublicKey,
      edPublicKey: anna.upload.edPublicKey,
      previous: [
        { ...r.c.certificate, accountId: account.accountId, role: "member" } as Certificate,
      ],
    };
    return { ...r, renewedRow, anna };
  };

  it("shows the code of the renewed bundle, none for a member who did not renew", async () => {
    const { renewedRow, anna } = await renewedAnna();
    const renewed = {
      accountId: renewedRow.id,
      xwingPublicKey: anna.upload.xwingPublicKey,
      edPublicKey: anna.upload.edPublicKey,
    };
    const view = { accountId: renewedRow.id, name: "Anna", role: "member" as const, previous: [] };
    expect(renewedCode({ ...view, status: "renewed", renewed })).toBe(
      comparisonCode(bundleFingerprint(renewed.xwingPublicKey, renewed.edPublicKey)),
    );
    expect(renewedCode({ ...view, status: "waiting" })).toBeUndefined();
  });

  it("remembers the new certificate and bundle before it uploads the certificate", async () => {
    const { c, s, api, renewedRow, anna } = await renewedAnna();
    const view = {
      accountId: renewedRow.id,
      name: "Anna",
      role: "member" as const,
      status: "renewed" as const,
      renewed: {
        accountId: renewedRow.id,
        xwingPublicKey: anna.upload.xwingPublicKey,
        edPublicKey: anna.upload.edPublicKey,
      },
      previous: [],
    };
    expect(await confirmRenewed(api, c.session, view, c.certificate.companyId)).toBe(true);
    const [certificate] = s.certified;
    expect(certificate && isCertified(c.rootPublicKey, certificate)).toBe(true);
    const id = encodeBytes(renewedRow.id);
    const state = c.session.opened()?.state;
    expect(state?.certificates[id]).toBe(certificate?.issuedAt);
    expect(state?.bundles[id]).toEqual(
      bundleFingerprint(anna.upload.xwingPublicKey, anna.upload.edPublicKey),
    );
    expect(s.calls).toEqual(["state", "certify"]);
  });

  it("certifies nothing without the company, the root key or a renewed bundle", async () => {
    const { c, api, renewedRow, s } = await renewedAnna();
    const view = {
      accountId: renewedRow.id,
      name: "Anna",
      role: "member" as const,
      status: "waiting" as const,
      previous: [],
    };
    expect(await confirmRenewed(api, c.session, view, c.certificate.companyId)).toBe(false);
    expect(await confirmRenewed(api, c.session, { ...view, status: "renewed" }, undefined)).toBe(
      false,
    );
    expect(s.certified).toEqual([]);
  });
});
