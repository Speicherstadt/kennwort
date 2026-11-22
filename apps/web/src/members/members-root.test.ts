import { certify, createAccount, emptyState, encodeBytes, type MemberView } from "@kennwort/core";
import { comparisonCode, rootFingerprint } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { derive } from "../session/session.test-kit.ts";
import { jonasCompany, ownerRow, type Row, server } from "./members.test-kit.ts";
import { leaveCompany, loadMembers, setRole } from "./members.ts";

// K-307 part f (P-07): when an owner or admin goes, Jonas's client replaces the company root
type Company = Awaited<ReturnType<typeof jonasCompany>>;

const colleague = (c: Company, name: string, role: MemberView["role"]) => {
  const account = createAccount(
    `${name} Lager Büro Werkstatt`,
    emptyState(c.opened.state.rootFingerprint),
    {
      derive,
    },
  );
  const certificate = certify(c.opened.state.rootSecretKey as Uint8Array, {
    ...c.certificate,
    accountId: account.accountId,
    xwingPublicKey: account.upload.xwingPublicKey,
    edPublicKey: account.upload.edPublicKey,
    role,
  });
  const row: Row = {
    id: account.accountId,
    role,
    name,
    xwingPublicKey: account.upload.xwingPublicKey,
    edPublicKey: account.upload.edPublicKey,
    certificate,
    invitation: null,
  };
  const view: MemberView = {
    accountId: account.accountId,
    name,
    role,
    status: "certified",
    certificate,
  };
  return { account, row, view };
};

describe("leaving the company", () => {
  it("replaces the root when an admin leaves, without her, and pins it on Jonas's devices", async () => {
    const c = await jonasCompany();
    const sandra = colleague(c, "Sandra", "admin");
    const s = server(c, [ownerRow(c), sandra.row]);
    const views = [sandra.view];
    expect(await leaveCompany(s.api, c.session, sandra.account.accountId, views)).toBe(true);
    expect(s.calls).toContain("root");
    const [rotation] = s.rotations;
    expect(rotation?.certificates.map((x) => encodeBytes(x.accountId))).toEqual([
      encodeBytes(c.opened.accountId),
    ]);
    const pinned = c.session.opened()?.state.rootFingerprint;
    expect(pinned).toEqual(rootFingerprint(s.company.rootPublicKey));
    expect(c.session.opened()?.keyBlock.rootFingerprint).toEqual(pinned);
    expect(s.keyBlocks).toHaveLength(1);
  });

  it("keeps the root when a member leaves", async () => {
    const c = await jonasCompany();
    const max = colleague(c, "Max", "member");
    const s = server(c, [ownerRow(c), max.row]);
    expect(await leaveCompany(s.api, c.session, max.account.accountId, [max.view])).toBe(true);
    expect(s.calls).not.toContain("root");
  });

  it("says so when the root could not be replaced", async () => {
    const c = await jonasCompany();
    const sandra = colleague(c, "Sandra", "admin");
    const s = server(c, [ownerRow(c), sandra.row]);
    const refusing = { ...s.api, replaceRoot: async () => false };
    expect(await leaveCompany(refusing, c.session, sandra.account.accountId, [sandra.view])).toBe(
      false,
    );
  });
});

describe("a new role", () => {
  it("replaces the root when an admin becomes a member", async () => {
    const c = await jonasCompany();
    const anna = colleague(c, "Anna", "admin");
    const s = server(c, [ownerRow(c), anna.row]);
    expect(await setRole(s.api, c.session, anna.view, "member")).toBe(true);
    expect(s.calls.filter((call) => call === "root")).toHaveLength(1);
  });

  it("keeps the root when a member becomes an admin", async () => {
    const c = await jonasCompany();
    const anna = colleague(c, "Anna", "member");
    const s = server(c, [ownerRow(c), anna.row]);
    expect(await setRole(s.api, c.session, anna.view, "admin")).toBe(true);
    expect(s.calls).not.toContain("root");
  });
});

describe("loading the members after the root changed", () => {
  it("shows a change waiting with the new root's code on a device that has not confirmed it", async () => {
    const c = await jonasCompany();
    const sandra = colleague(c, "Sandra", "admin");
    const s = server(c, [ownerRow(c), sandra.row]);
    await leaveCompany(s.api, c.session, sandra.account.accountId, [sandra.view]);
    // c.opened is this account as it was before the change: like Anna's device, it pinned the old root
    expect(await loadMembers(s.api, c.opened)).toEqual({
      ok: false,
      error: "root-change",
      pending: {
        changes: s.company.rootChanges,
        code: comparisonCode(rootFingerprint(s.company.rootPublicKey)),
      },
    });
  });

  it("refuses the old root on a device that confirmed the change", async () => {
    const c = await jonasCompany();
    const sandra = colleague(c, "Sandra", "admin");
    const s = server(c, [ownerRow(c), sandra.row]);
    await leaveCompany(s.api, c.session, sandra.account.accountId, [sandra.view]);
    const opened = c.session.opened();
    if (!opened) throw new Error("locked");
    expect((await loadMembers(s.api, opened)).ok).toBe(true);
    s.company.rootPublicKey = c.rootPublicKey;
    expect(await loadMembers(s.api, opened)).toEqual({ ok: false, error: "root-retired" });
  });

  it("knows nothing without a company ID it can read", async () => {
    const c = await jonasCompany();
    const s = server(c, [ownerRow(c)]);
    const api = {
      ...s.api,
      company: async () => ({ ...(await s.api.company("t")), id: "weber" }),
    } as typeof s.api;
    expect(await loadMembers(api, c.opened)).toEqual({ ok: false, error: "unreachable" });
  });
});
