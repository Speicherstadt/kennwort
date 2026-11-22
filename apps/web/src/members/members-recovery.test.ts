import {
  certify,
  createAccount,
  emptyState,
  encodeBytes,
  grantRecoveryKey,
  newCompanyRecoveryKey,
  openRecoveryGrant,
  type Policy,
  recoveryPolicy,
  standardPolicy,
} from "@kennwort/core";
import type { Deposit } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { derive } from "../session/session.test-kit.ts";
import { jonasCompany, ownerRow, type Row, server } from "./members.test-kit.ts";
import { leaveCompany, loadMembers, setRole } from "./members.ts";

// K-307 part c (P-13): an owner who goes held the recovery key, so a new one comes; a new owner
// gets the key wrapped
type Company = Awaited<ReturnType<typeof jonasCompany>>;

const sandra = (c: Company, role: "owner" | "member") => {
  const account = createAccount("Sandra Lager Büro", emptyState(c.opened.state.rootFingerprint), {
    derive,
  });
  const root = c.opened.state.rootSecretKey ?? new Uint8Array(32);
  const certificate = certify(root, {
    ...c.certificate,
    accountId: account.accountId,
    xwingPublicKey: account.upload.xwingPublicKey,
    edPublicKey: account.upload.edPublicKey,
    role,
  });
  const row: Row = {
    id: account.accountId,
    role,
    name: "Sandra",
    xwingPublicKey: account.upload.xwingPublicKey,
    edPublicKey: account.upload.edPublicKey,
    certificate,
    invitation: null,
  };
  return { account, row };
};

/** The members server with company recovery: a policy that is on (or off) and the key behind it */
const withRecovery = (c: Company, rows: Row[], on: boolean) => {
  const s = server(c, rows);
  const root = c.opened.state.rootSecretKey ?? new Uint8Array(32);
  const key = newCompanyRecoveryKey();
  const base = standardPolicy(c.certificate.companyId);
  let policy: Policy = recoveryPolicy(root, base, on ? key.fingerprint : undefined);
  let publicKey: Uint8Array | null = on ? key.publicKey : null;
  const keys: { grants: { accountId: Uint8Array }[] }[] = [];
  const deposits: Deposit[] = [];
  const api = {
    ...s.api,
    company: async () => ({
      id: encodeBytes(c.certificate.companyId),
      rootPublicKey: c.rootPublicKey,
      policy,
      recoveryPublicKey: publicKey,
    }),
    saveRecoveryKey: async (
      _t: string,
      next: Policy,
      pk: Uint8Array,
      grants: { accountId: Uint8Array }[],
    ) => {
      keys.push({ grants });
      policy = next;
      publicKey = pk;
      return true;
    },
    saveDeposit: async (_t: string, deposit: Deposit) => {
      deposits.push(deposit);
      return true;
    },
  };
  return { ...s, api, keys, deposits, key };
};

const viewsOf = async (api: Parameters<typeof loadMembers>[0], c: Company) => {
  const loaded = await loadMembers(api, c.session.opened() ?? c.opened);
  if (!loaded.ok) throw new Error(loaded.error);
  return loaded.value.views;
};

describe("leaveCompany with company recovery", () => {
  it("makes a new key for the owners who stay when an owner leaves, and deposits to it", async () => {
    const c = await jonasCompany();
    const s2 = sandra(c, "owner");
    const s = withRecovery(c, [ownerRow(c), s2.row], true);
    const views = await viewsOf(s.api, c);
    expect(await leaveCompany(s.api, c.session, s2.account.accountId, views)).toBe(true);
    expect(s.keys).toHaveLength(1);
    expect(s.keys[0]?.grants.map((g) => encodeBytes(g.accountId))).toEqual([
      encodeBytes(c.opened.accountId),
    ]);
    expect(s.deposits).toHaveLength(1);
  });

  it("keeps the key when a member leaves or recovery is off", async () => {
    const c = await jonasCompany();
    const member = sandra(c, "member");
    const s = withRecovery(c, [ownerRow(c), member.row], true);
    expect(
      await leaveCompany(s.api, c.session, member.account.accountId, await viewsOf(s.api, c)),
    ).toBe(true);
    expect(s.keys).toEqual([]);
    const owner = sandra(c, "owner");
    const off = withRecovery(c, [ownerRow(c), owner.row], false);
    expect(
      await leaveCompany(off.api, c.session, owner.account.accountId, await viewsOf(off.api, c)),
    ).toBe(true);
    expect(off.keys).toEqual([]);
  });

  it("does nothing more when the server does not let the account leave", async () => {
    const c = await jonasCompany();
    const owner = sandra(c, "owner");
    const s = withRecovery(c, [ownerRow(c), owner.row], true);
    const refusing = { ...s.api, leave: async () => false };
    expect(await leaveCompany(refusing, c.session, owner.account.accountId, [])).toBe(false);
    expect(s.keys).toEqual([]);
  });
});

describe("setRole with company recovery", () => {
  it("wraps the recovery key to a new owner, so it opens with the new owner's keys", async () => {
    const c = await jonasCompany();
    const member = sandra(c, "member");
    const s = withRecovery(c, [ownerRow(c), member.row], true);
    const policy = (await s.api.company()).policy;
    const fingerprint = policy.companyRecovery.enabled
      ? policy.companyRecovery.fingerprint
      : new Uint8Array();
    const grants: (Uint8Array | undefined)[] = [];
    const api = {
      ...s.api,
      recoveryGrant: async () => grantRecoveryKey(s.key.secretKey, c.certificate),
      changeRole: async (_t: string, _c: unknown, _r: unknown, recoveryGrant?: Uint8Array) => {
        grants.push(recoveryGrant);
        return true;
      },
    };
    const [, view] = await viewsOf(api, c);
    if (!view) throw new Error("Sandra is listed");
    expect(await setRole(api, c.session, view, "owner")).toBe(true);
    const opened = openRecoveryGrant(
      member.account.keyBlock,
      member.account.accountId,
      c.certificate.companyId,
      grants[0] ?? new Uint8Array(),
      fingerprint,
    );
    expect(opened.ok).toBe(true);
    expect(await setRole(api, c.session, view, "admin")).toBe(true);
    expect(grants[1]).toBeUndefined();
    expect(s.keys).toEqual([]);
  });

  it("refuses to make an owner while this owner holds no valid recovery key", async () => {
    const c = await jonasCompany();
    const member = sandra(c, "member");
    const s = withRecovery(c, [ownerRow(c), member.row], true);
    const [, view] = await viewsOf(s.api, c);
    if (!view) throw new Error("Sandra is listed");
    expect(await setRole(s.api, c.session, view, "owner")).toBe(false);
    expect(s.roles).toEqual([]);
  });

  it("makes a new key when an owner steps down", async () => {
    const c = await jonasCompany();
    const owner = sandra(c, "owner");
    const s = withRecovery(c, [ownerRow(c), owner.row], true);
    const [, view] = await viewsOf(s.api, c);
    if (!view) throw new Error("Sandra is listed");
    expect(await setRole(s.api, c.session, view, "admin")).toBe(true);
    expect(s.keys).toHaveLength(1);
  });
});
