// K-205 "Fertig, wenn": a manipulated line stands out when the export is checked
import { describe, expect, it } from "bun:test";
import { AuditExport, type AuditHead, encodeBytes, signAudit, verifyAudit } from "@kennwort/core";
import { ed25519KeyPair } from "@kennwort/crypto";
import { sql } from "drizzle-orm";
import { invitationBody, signInSetup } from "../testing/sign-in-setup.ts";

const jonasKeys = ed25519KeyPair(new Uint8Array(32).fill(0x10));

/** Weber Haustechnik: Jonas signs in, invites Anna, she accepts, Jonas creates a vault and exports */
const history = async () => {
  const setup = await signInSetup();
  const jonas = await setup.member("weber", "owner");
  const invite = (await (
    await setup.request("/api/invitations", {
      method: "POST",
      token: jonas.token,
      body: invitationBody(),
    })
  ).json()) as { id: string; token: string };
  const accepted = await setup.request(`/auth/invitations/${invite.id}/accept`, {
    body: {
      token: invite.token,
      accountId: encodeBytes(new Uint8Array(16).fill(0x20)),
      loginPublicKey: encodeBytes(new Uint8Array(32).fill(2)),
      accountSalt: encodeBytes(new Uint8Array(16).fill(3)),
    },
  });
  const anna = (await accepted.json()) as { accountId: string; token: string };
  const vault = encodeBytes(new Uint8Array(16).fill(0xb0));
  expect(
    (await setup.request("/api/vaults", { token: jonas.token, body: { id: vault } })).status,
  ).toBe(201);
  const exportEvent = {
    companyId: "weber",
    actor: jonas.id,
    action: "export" as const,
    subject: "export-1",
  };
  const signed = await setup.request("/api/audit", {
    token: jonas.token,
    body: {
      action: "export",
      subject: "export-1",
      signature: encodeBytes(signAudit(jonasKeys.secretKey, exportEvent)),
    },
  });
  expect(signed.status).toBe(201);
  const read = async () =>
    AuditExport.parse(await (await setup.request("/api/audit", { token: jonas.token })).json());
  const check = (remembered?: AuditHead) => ({
    companyId: "weber",
    publicKeyOf: (actor: string) => (actor === jonas.id ? jonasKeys.publicKey : undefined),
    ...(remembered ? { remembered } : {}),
  });
  return { setup, jonas, anna, read, check };
};

describe("audit log", () => {
  it("records sign-ins, invitations, vaults and signed client actions as one checked chain", async () => {
    const { read, check, jonas, anna } = await history();
    const exported = await read();
    expect(exported.events.map((e) => [e.actor, e.action])).toEqual([
      [jonas.id, "signed-in"],
      [jonas.id, "invitation-created"],
      [anna.accountId, "invitation-accepted"],
      [anna.accountId, "signed-in"],
      [jonas.id, "vault-created"],
      [jonas.id, "export"],
    ]);
    expect(verifyAudit(exported.events, check()).ok).toBe(true);
  });

  it("finds a changed, a deleted and an inserted line in the database", async () => {
    const { setup, read, check } = await history();
    setup.db.run(sql`update audit_events set subject = 'other' where seq = 4`);
    expect(verifyAudit((await read()).events, check())).toEqual({
      ok: false,
      error: { problem: "changed", seq: 4 },
    });
    setup.db.run(sql`delete from audit_events where seq = 2`);
    expect(verifyAudit((await read()).events, check())).toMatchObject({
      ok: false,
      error: { problem: "gap", seq: 2 },
    });
  });

  it("finds a shortened log against the head a client remembered", async () => {
    const { setup, read, check } = await history();
    const head = verifyAudit((await read()).events, check());
    if (!head.ok) throw new Error(head.error.problem);
    setup.db.run(sql`delete from audit_events where seq = 5`);
    expect(verifyAudit((await read()).events, check(head.value))).toEqual({
      ok: false,
      error: { problem: "truncated", seq: 5 },
    });
  });

  it("gives the export only to owners and admins", async () => {
    const { setup, anna } = await history();
    expect((await setup.request("/api/audit", { token: anna.token })).status).toBe(403);
  });

  it("takes only client actions, signed, once per subject", async () => {
    const { setup, jonas } = await history();
    const post = (body: unknown) => setup.request("/api/audit", { token: jonas.token, body });
    const signature = encodeBytes(new Uint8Array(65).fill(1));
    expect((await post({ action: "export", subject: "export-1", signature })).status).toBe(409);
    expect((await post({ action: "signed-in", subject: "x", signature })).status).toBe(400);
    expect((await post({ action: "recovery", subject: "", signature })).status).toBe(400);
    expect((await post({ action: "recovery", subject: "r-1", signature: "AAAA" })).status).toBe(
      400,
    );
    expect((await post({ action: "recovery", subject: "r-1", signature })).status).toBe(201);
  });
});
