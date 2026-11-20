// Review K-304 part 3: race on the last owner. K-304 part 1 (P-08): Jonas invites Anna, Anna answers with her bundle and the MAC, Jonas's client
// checks it and certifies; the server only keeps and hands out
import { describe, expect, it } from "bun:test";
import {
  bytes,
  certifyInvited,
  changeRole,
  createAccount,
  emptyState,
  encodeBytes,
  invitationMac,
  newInvitation,
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

  /** A request whose JSON body arrives only when the test lets it, as from a slow connection */
  const slowPut = (o: Owner, token: string, id: Uint8Array, body: unknown) => {
    let send = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        send = () => {
          controller.enqueue(new TextEncoder().encode(JSON.stringify(body)));
          controller.close();
        };
      },
    });
    const response = o.setup.app.request(
      `/api/members/${encodeBytes(id)}/role`,
      {
        method: "PUT",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: stream,
        duplex: "half",
      } as RequestInit,
      { address: "192.0.2.1" },
    );
    return { response, send };
  };

  it("keeps an owner when two owners demote each other at the same time", async () => {
    const { o, anna, annaToken, certificate, root } = await certifiedAnna();
    const annaOwner = changeRole(root, certificate, "owner");
    expect((await putRole(o, o.token, anna.accountId, wireOf(annaOwner))).status).toBe(200);
    // Jonas demotes Anna while Anna demotes Jonas; both bodies are still on their way
    const annaDown = slowPut(
      o,
      o.token,
      anna.accountId,
      wireOf(changeRole(root, annaOwner.certificate, "member")),
    );
    const jonasDown = slowPut(
      o,
      annaToken,
      o.owner.accountId,
      wireOf(changeRole(root, o.company.certificate, "member")),
    );
    await Bun.sleep(100);
    annaDown.send();
    jonasDown.send();
    const statuses = await Promise.all([annaDown.response, jonasDown.response]);
    const owners = (await members(o)).filter((m) => m.role === "owner");
    expect({ statuses: statuses.map((r) => r.status), owners: owners.length }).toMatchObject({
      owners: 1,
    });
  });
});
