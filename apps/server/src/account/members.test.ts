// K-304 part 1 (P-08): Jonas invites Anna, Anna answers with her bundle and the MAC, Jonas's client
// checks it and certifies; the server only keeps and hands out
import { describe, expect, it } from "bun:test";
import {
  bytes,
  CertificateWire,
  certifyInvited,
  changeRole,
  createAccount,
  emptyState,
  encodeBytes,
  invitationMac,
  isCertified,
  newInvitation,
  openRootGrant,
  toWire,
} from "@kennwort/core";
import { ownerWithKeys, quick } from "../testing/owner-with-keys.ts";

const CODE = "setup-code-of-weber-haustechnik";
const PASSPHRASE = "Heizung-Wasser-Licht-Kupfer";

type Owner = Awaited<ReturnType<typeof ownerWithKeys>>;
type Member = {
  id: string;
  role: string;
  name: string | null;
  xwingPublicKey: string | null;
  edPublicKey: string | null;
  certificate: unknown;
  invitation: { id: string; sealedSecret: string; mac: string } | null;
};

const keysOf = (account: ReturnType<typeof createAccount>, inviteMac?: Uint8Array) => {
  const u = account.upload;
  return {
    xwingPublicKey: encodeBytes(u.xwingPublicKey),
    edPublicKey: encodeBytes(u.edPublicKey),
    keyBlock: encodeBytes(u.keyBlock),
    unlock: {
      passphrase: encodeBytes(u.unlock.passphrase),
      recovery: encodeBytes(u.unlock.recovery),
    },
    recoveryLoginPublicKey: encodeBytes(u.recoveryLoginPublicKey),
    state: encodeBytes(u.state),
    stateCounter: 0,
    ...(inviteMac ? { inviteMac: encodeBytes(inviteMac) } : {}),
  };
};

/** Jonas invites; Anna accepts and uploads her keys with the MAC (or another one, if given) */
const invite = async (
  o: Owner,
  mac?: (secret: Uint8Array, id: Uint8Array, a: ReturnType<typeof createAccount>) => Uint8Array,
) => {
  const invitation = newInvitation(o.owner.accountKey, o.owner.accountId);
  const made = await o.setup.request("/api/invitations", {
    token: o.token,
    body: {
      id: encodeBytes(invitation.id),
      sealedSecret: encodeBytes(invitation.sealedSecret),
      label: "Anna",
    },
  });
  expect(made.status).toBe(201);
  const { token } = (await made.json()) as { token: string };
  const anna = createAccount("Anna Heizung Bad Fliese", emptyState(o.owner.state.rootFingerprint), {
    derive: quick,
  });
  const accepted = await o.setup.request(`/auth/invitations/${encodeBytes(invitation.id)}/accept`, {
    body: {
      token,
      accountId: encodeBytes(anna.accountId),
      loginPublicKey: encodeBytes(anna.upload.loginPublicKey),
      accountSalt: encodeBytes(anna.upload.accountSalt),
    },
  });
  const session = (await accepted.json()) as { token: string };
  const bundle = {
    accountId: anna.accountId,
    xwingPublicKey: anna.upload.xwingPublicKey,
    edPublicKey: anna.upload.edPublicKey,
  };
  const theMac = mac
    ? mac(invitation.secret, invitation.id, anna)
    : invitationMac(invitation.secret, invitation.id, bundle);
  const uploaded = await o.setup.request("/api/account/keys", {
    method: "PUT",
    token: session.token,
    body: keysOf(anna, theMac),
  });
  expect(uploaded.status).toBe(201);
  return { invitation, anna, annaToken: session.token };
};

const members = async (o: Owner, token = o.token) =>
  ((await (await o.setup.request("/api/members", { token })).json()) as { members: Member[] })
    .members;

/** What Jonas's client does with a pending member it finds in the list */
const certifyPending = (o: Owner, member: Member) => {
  if (!member.invitation || !member.xwingPublicKey || !member.edPublicKey)
    throw new Error("not pending");
  return certifyInvited(
    {
      accountKey: o.owner.accountKey,
      accountId: o.owner.accountId,
      companyId: o.company.companyId,
      rootSecretKey: o.owner.state.rootSecretKey,
      certified: {},
    },
    {
      accountId: bytes(16).parse(member.id),
      xwingPublicKey: bytes(1216).parse(member.xwingPublicKey),
      edPublicKey: bytes(32).parse(member.edPublicKey),
      invitation: {
        id: bytes(16).parse(member.invitation.id),
        sealedSecret: bytes().parse(member.invitation.sealedSecret),
        mac: bytes(64).parse(member.invitation.mac),
      },
    },
  );
};

describe("members (K-304, P-08)", () => {
  it("shows Anna as pending to Jonas, who certifies her; then she has her certificate", async () => {
    const o = await ownerWithKeys(CODE, PASSPHRASE);
    const { anna, annaToken } = await invite(o);
    const listed = await members(o);
    const pending = listed.find((m) => m.id === encodeBytes(anna.accountId));
    expect(pending?.role).toBe("member");
    expect(pending?.certificate).toBeNull();
    expect(pending?.invitation).not.toBeNull();
    const jonas = listed.find((m) => m.id === encodeBytes(o.owner.accountId));
    expect(jonas?.certificate).not.toBeNull();
    expect(jonas?.invitation).toBeNull();

    const certified = certifyPending(o, pending as Member);
    if (!certified.ok) throw new Error(certified.error);
    const put = await o.setup.request(`/api/members/${encodeBytes(anna.accountId)}/certificate`, {
      method: "PUT",
      token: o.token,
      body: toWire(certified.value),
    });
    expect(put.status).toBe(200);
    const audit = (await (await o.setup.request("/api/audit", { token: o.token })).json()) as {
      events: { action: string; subject: string }[];
    };
    expect(audit.events.at(-1)).toMatchObject({
      action: "member-certified",
      subject: encodeBytes(anna.accountId),
    });

    const after = (await members(o)).find((m) => m.id === encodeBytes(anna.accountId));
    expect(after?.invitation).toBeNull();
    const stored = CertificateWire.parse(after?.certificate);
    expect(isCertified(o.company.rootPublicKey, stored)).toBe(true);
    // Anna's own devices get it with her keys
    const keys = (await (
      await o.setup.request("/api/account/keys", { token: annaToken })
    ).json()) as {
      certificate: unknown;
    };
    expect(CertificateWire.parse(keys.certificate).role).toBe("member");
    // Certified once: a second certificate is refused
    const again = await o.setup.request(`/api/members/${encodeBytes(anna.accountId)}/certificate`, {
      method: "PUT",
      token: o.token,
      body: toWire(certified.value),
    });
    expect(again.status).toBe(409);
  });

  it("does not certify a bundle whose MAC was not made with the link's secret", async () => {
    const o = await ownerWithKeys(CODE, PASSPHRASE);
    const { anna } = await invite(o, (_s, id, a) =>
      invitationMac(new Uint8Array(32), id, {
        accountId: a.accountId,
        xwingPublicKey: a.upload.xwingPublicKey,
        edPublicKey: a.upload.edPublicKey,
      }),
    );
    const pending = (await members(o)).find((m) => m.id === encodeBytes(anna.accountId));
    expect(certifyPending(o, pending as Member)).toEqual({ ok: false, error: "mac-mismatch" });
  });

  it("refuses certificates from members, for other keys, roles or companies", async () => {
    const o = await ownerWithKeys(CODE, PASSPHRASE);
    const { anna, annaToken } = await invite(o);
    const pending = (await members(o)).find((m) => m.id === encodeBytes(anna.accountId)) as Member;
    const certified = certifyPending(o, pending);
    if (!certified.ok) throw new Error(certified.error);
    const put = (token: string, body: unknown) =>
      o.setup.request(`/api/members/${encodeBytes(anna.accountId)}/certificate`, {
        method: "PUT",
        token,
        body,
      });
    const wire = toWire(certified.value);
    // Anna is a member: she may not certify, not even herself
    expect((await put(annaToken, wire)).status).toBe(403);
    expect((await put(o.token, { ...wire, role: "owner" })).status).toBe(400);
    expect(
      (await put(o.token, { ...wire, edPublicKey: encodeBytes(new Uint8Array(32)) })).status,
    ).toBe(400);
    expect(
      (await put(o.token, { ...wire, xwingPublicKey: encodeBytes(new Uint8Array(1216)) })).status,
    ).toBe(400);
    expect(
      (await put(o.token, { ...wire, accountId: encodeBytes(new Uint8Array(16)) })).status,
    ).toBe(400);
    expect(
      (await put(o.token, { ...wire, companyId: encodeBytes(new Uint8Array(16)) })).status,
    ).toBe(400);
    expect((await put(o.token, { nonsense: true })).status).toBe(400);
    expect(
      (
        await o.setup.request("/api/members/nobody/certificate", {
          method: "PUT",
          token: o.token,
          body: wire,
        })
      ).status,
    ).toBe(404);
    expect(
      (await members(o)).find((m) => m.id === encodeBytes(anna.accountId))?.certificate,
    ).toBeNull();
  });

  it("names a member after the invitation; the first owner has no name, the company its root", async () => {
    const o = await ownerWithKeys(CODE, PASSPHRASE);
    const { anna } = await invite(o);
    const listed = await members(o);
    expect(listed.find((m) => m.id === encodeBytes(anna.accountId))?.name).toBe("Anna");
    expect(listed.find((m) => m.id === encodeBytes(o.owner.accountId))?.name).toBeNull();
    const company = (await (await o.setup.request("/api/company", { token: o.token })).json()) as {
      rootPublicKey: string;
    };
    expect(company.rootPublicKey).toBe(encodeBytes(o.company.rootPublicKey));
  });

  it("shows the invitation only to the admin who made it", async () => {
    const o = await ownerWithKeys(CODE, PASSPHRASE);
    const { anna, annaToken } = await invite(o);
    const seenByAnna = (await members(o, annaToken)).find(
      (m) => m.id === encodeBytes(anna.accountId),
    );
    expect(seenByAnna?.invitation).toBeNull();
    expect(seenByAnna?.xwingPublicKey).toBe(encodeBytes(anna.upload.xwingPublicKey));
  });

  it("refuses an invitation without ID or sealed secret, and an ID twice", async () => {
    const o = await ownerWithKeys(CODE, PASSPHRASE);
    const post = (body: unknown) => o.setup.request("/api/invitations", { token: o.token, body });
    const good = {
      id: encodeBytes(new Uint8Array(16).fill(7)),
      sealedSecret: encodeBytes(new Uint8Array(73)),
      label: "Anna",
    };
    expect((await post({})).status).toBe(400);
    expect((await post({ ...good, sealedSecret: encodeBytes(new Uint8Array(72)) })).status).toBe(
      400,
    );
    expect((await post({ ...good, id: encodeBytes(new Uint8Array(15)) })).status).toBe(400);
    for (const label of [undefined, "", "   ", "x".repeat(65), "Anna\nMax", "Anna\u0000"])
      expect((await post({ ...good, label })).status).toBe(400);
    expect((await post(good)).status).toBe(201);
    expect((await post(good)).status).toBe(409);
  });

  it("refuses an invitation MAC of the wrong length", async () => {
    const o = await ownerWithKeys(CODE, PASSPHRASE, false);
    const jonas = o.owner;
    const body = { ...keysOf(jonas), inviteMac: encodeBytes(new Uint8Array(63)) };
    const answer = await o.setup.request("/api/account/keys", {
      method: "PUT",
      token: o.token,
      body,
    });
    expect(answer.status).toBe(400);
  });
});

describe("roles (K-304 part 3)", () => {
  /** Jonas has invited and certified Anna; returns her certificate as the server has it */
  const certifiedAnna = async () => {
    const o = await ownerWithKeys(CODE, PASSPHRASE);
    const { anna, annaToken } = await invite(o);
    const pending = (await members(o)).find((m) => m.id === encodeBytes(anna.accountId)) as Member;
    const certified = certifyPending(o, pending);
    if (!certified.ok) throw new Error(certified.error);
    await o.setup.request(`/api/members/${encodeBytes(anna.accountId)}/certificate`, {
      method: "PUT",
      token: o.token,
      body: toWire(certified.value),
    });
    const root = o.owner.state.rootSecretKey;
    if (!root) throw new Error("no root");
    return { o, anna, annaToken, certificate: certified.value, root };
  };
  const putRole = (o: Owner, token: string, id: Uint8Array, body: unknown) =>
    o.setup.request(`/api/members/${encodeBytes(id)}/role`, { method: "PUT", token, body });
  const wireOf = (change: ReturnType<typeof changeRole>) => ({
    certificate: toWire(change.certificate),
    ...(change.rootGrant ? { rootGrant: encodeBytes(change.rootGrant) } : {}),
  });

  it("makes Anna an admin with the root key, and a member again without it", async () => {
    const { o, anna, annaToken, certificate, root } = await certifiedAnna();
    const promoted = changeRole(root, certificate, "admin");
    expect((await putRole(o, o.token, anna.accountId, wireOf(promoted))).status).toBe(200);
    const listed = (await members(o)).find((m) => m.id === encodeBytes(anna.accountId));
    expect(listed?.role).toBe("admin");
    expect(CertificateWire.parse(listed?.certificate).role).toBe("admin");
    const grant = (await (
      await o.setup.request("/api/account/root-grant", { token: annaToken })
    ).json()) as { rootGrant: string };
    const opened = openRootGrant(
      anna.keyBlock,
      anna.accountId,
      o.company.companyId,
      bytes().parse(grant.rootGrant),
    );
    expect(opened).toEqual({ ok: true, value: root });
    const audit = (await (await o.setup.request("/api/audit", { token: o.token })).json()) as {
      events: { action: string; subject: string }[];
    };
    expect(audit.events.at(-1)).toMatchObject({
      action: "role-changed",
      subject: encodeBytes(anna.accountId),
    });

    const demoted = changeRole(root, promoted.certificate, "member");
    expect((await putRole(o, o.token, anna.accountId, wireOf(demoted))).status).toBe(200);
    expect((await o.setup.request("/api/account/root-grant", { token: annaToken })).status).toBe(
      404,
    );
    expect((await members(o)).find((m) => m.id === encodeBytes(anna.accountId))?.role).toBe(
      "member",
    );
  });

  it("lets only owners change roles, never their own, and only for certified accounts", async () => {
    const { o, anna, annaToken, certificate, root } = await certifiedAnna();
    const promoted = wireOf(changeRole(root, certificate, "admin"));
    expect((await putRole(o, annaToken, anna.accountId, promoted)).status).toBe(403);
    const own = changeRole(root, o.company.certificate, "admin");
    expect((await putRole(o, o.token, o.owner.accountId, wireOf(own))).status).toBe(409);
    expect((await putRole(o, o.token, new Uint8Array(16), promoted)).status).toBe(404);
    // As admin, Anna still may not change roles
    await putRole(o, o.token, anna.accountId, promoted);
    const back = wireOf(changeRole(root, o.company.certificate, "member"));
    expect((await putRole(o, annaToken, o.owner.accountId, back)).status).toBe(403);
    // An account without a certificate gets no role
    const { anna: sandra } = await invite(o);
    const sandraKeys = {
      ...certificate,
      accountId: sandra.accountId,
      xwingPublicKey: sandra.upload.xwingPublicKey,
      edPublicKey: sandra.upload.edPublicKey,
    };
    expect(
      (await putRole(o, o.token, sandra.accountId, wireOf(changeRole(root, sandraKeys, "admin"))))
        .status,
    ).toBe(409);
  });

  it("refuses a role without its root key, a member with one, and other keys or companies", async () => {
    const { o, anna, certificate, root } = await certifiedAnna();
    const admin = changeRole(root, certificate, "admin");
    const member = changeRole(root, certificate, "member");
    const put = (body: unknown) => putRole(o, o.token, anna.accountId, body);
    expect((await put({ certificate: toWire(admin.certificate) })).status).toBe(400);
    expect(
      (
        await put({
          ...wireOf(member),
          rootGrant: encodeBytes(admin.rootGrant ?? new Uint8Array()),
        })
      ).status,
    ).toBe(400);
    expect(
      (await put({ ...wireOf(admin), rootGrant: encodeBytes(new Uint8Array(100)) })).status,
    ).toBe(400);
    const otherKeys = changeRole(
      root,
      { ...certificate, edPublicKey: new Uint8Array(32).fill(1) },
      "admin",
    );
    expect((await put(wireOf(otherKeys))).status).toBe(400);
    const otherCompany = changeRole(
      root,
      { ...certificate, companyId: new Uint8Array(16) },
      "admin",
    );
    expect((await put(wireOf(otherCompany))).status).toBe(400);
    const otherAccount = changeRole(
      root,
      { ...certificate, accountId: o.owner.accountId },
      "admin",
    );
    expect((await put(wireOf(otherAccount))).status).toBe(400);
    expect((await put({})).status).toBe(400);
    expect((await members(o)).find((m) => m.id === encodeBytes(anna.accountId))?.role).toBe(
      "member",
    );
  });
});
