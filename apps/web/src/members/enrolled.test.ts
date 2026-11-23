import {
  createAccount,
  emptyState,
  encodeBytes,
  isCertified,
  type MemberView,
} from "@kennwort/core";
import { bundleFingerprint, comparisonCode } from "@kennwort/crypto";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { derive } from "../session/session.test-kit.ts";
import { companyCode, confirmEnrolled, enrolledCode, ownCodes } from "./enrolled.ts";
import { jonasCompany, ownerRow, server } from "./members.test-kit.ts";

// K-604: Jonas compares Sandra's code after she enrolled through the identity provider
const sandraEnrolled = async () => {
  const c = await jonasCompany();
  const sandra = createAccount(
    "Sandra Lager Regal Palette",
    emptyState(c.opened.state.rootFingerprint),
    {
      derive,
    },
  );
  const s = server(c, [ownerRow(c)]);
  const view: MemberView = {
    accountId: sandra.accountId,
    name: null,
    role: "member",
    status: "enrolled",
    enrolled: {
      accountId: sandra.accountId,
      xwingPublicKey: sandra.upload.xwingPublicKey,
      edPublicKey: sandra.upload.edPublicKey,
    },
  };
  return { c, s, sandra, view };
};

describe("codes", () => {
  it("are the bundle's and the pinned root's comparison codes", async () => {
    const { c, sandra, view } = await sandraEnrolled();
    expect(enrolledCode(view)).toBe(
      comparisonCode(bundleFingerprint(sandra.upload.xwingPublicKey, sandra.upload.edPublicKey)),
    );
    const { enrolled: _, ...without } = view;
    expect(enrolledCode(without)).toBeUndefined();
    expect(companyCode(c.session)).toBe(comparisonCode(c.opened.state.rootFingerprint));
    const own = ownCodes(c.session);
    expect(own?.own).toBe(
      comparisonCode(bundleFingerprint(c.certificate.xwingPublicKey, c.certificate.edPublicKey)),
    );
    expect(own?.company).toBe(companyCode(c.session));
    c.session.lock();
    flush();
    expect(ownCodes(c.session)).toBeUndefined();
    expect(companyCode(c.session)).toBeUndefined();
  });
});

describe("confirmEnrolled", () => {
  it("certifies her as a member after remembering the bundle, then uploads", async () => {
    const { c, s, sandra, view } = await sandraEnrolled();
    expect(await confirmEnrolled(s.api, c.session, view, c.certificate.companyId)).toBe(true);
    const [certificate] = s.certified;
    expect(certificate && isCertified(c.rootPublicKey, certificate)).toBe(true);
    expect(certificate?.role).toBe("member");
    const id = encodeBytes(sandra.accountId);
    const state = c.session.opened()?.state;
    expect(state?.certificates[id]).toBe(certificate?.issuedAt);
    expect(state?.bundles[id]).toEqual(
      bundleFingerprint(sandra.upload.xwingPublicKey, sandra.upload.edPublicKey),
    );
    expect(s.calls).toEqual(["state", "certify"]);
  });

  it("refuses when this account knows other keys for her, and writes nothing", async () => {
    const { c, s, sandra, view } = await sandraEnrolled();
    const id = encodeBytes(sandra.accountId);
    await c.session.updateState(s.api, (state) => ({
      ...state,
      bundles: { ...state.bundles, [id]: new Uint8Array(32).fill(7) },
    }));
    s.calls.length = 0;
    expect(await confirmEnrolled(s.api, c.session, view, c.certificate.companyId)).toBe(false);
    expect(s.certified).toEqual([]);
    expect(s.calls).toEqual([]);
  });

  it("certifies nothing without the company, the root key or an enrolled bundle", async () => {
    const { c, s, view } = await sandraEnrolled();
    expect(await confirmEnrolled(s.api, c.session, view, undefined)).toBe(false);
    const waiting = { ...view, status: "waiting" as const };
    expect(await confirmEnrolled(s.api, c.session, waiting, c.certificate.companyId)).toBe(false);
    c.session.lock();
    flush();
    expect(await confirmEnrolled(s.api, c.session, view, c.certificate.companyId)).toBe(false);
    expect(s.certified).toEqual([]);
  });
});
