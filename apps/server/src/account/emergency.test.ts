// K-307 part d (P-14): emergency access on the server: grants, requests, the waiting time,
// objections, early approval, revocation, and what comes out after the wait
import { describe, expect, it } from "bun:test";
import {
  AuditExport,
  EmergencyListWire,
  EmergencyVaultsWire,
  encodeBytes,
  grantToWire,
  idKey,
  makeGrant,
  packagesToWire,
  ReleaseWire,
  removeMember,
  toWire,
  verifyLog,
} from "@kennwort/core";
import { emergencyGrants } from "../db/schema.ts";
import { DAY, type WeberWithBuero, weberWithBuero } from "../testing/emergency-setup.ts";

const list = async (e: WeberWithBuero, token: string) =>
  EmergencyListWire.parse(await (await e.request("/api/emergency", { token })).json());
const actions = async (e: WeberWithBuero) =>
  AuditExport.parse(await (await e.request("/api/audit")).json())
    .events.map((event) => event.action)
    .filter((action) => action.startsWith("emergency"));

describe("granting emergency access (P-14)", () => {
  it("stores a signed grant and lists it to both sides, without the packages", async () => {
    const e = await weberWithBuero();
    const { grant, status } = await e.grant();
    expect(status).toBe(200);
    const mine = await list(e, e.w.o.token);
    expect(mine.given.map((g) => g.grant)).toEqual([grant]);
    expect(mine.received).toEqual([]);
    const annas = await list(e, e.w.annaToken);
    expect(annas.received).toEqual([
      { grant, request: null, objection: null, approval: null, releaseAt: null },
    ]);
    expect(JSON.stringify(annas)).not.toContain("packages");
    expect(await actions(e)).toEqual(["emergency-granted"]);
  });

  it("takes a grant only as the grantor signed it, for a colleague's own bundle", async () => {
    const e = await weberWithBuero();
    const made = makeGrant(
      e.jonas,
      e.w.annaCert,
      { scope: "view", rings: [e.buero.ring] },
      {
        waitSeconds: DAY,
        time: e.seconds(),
      },
    );
    const put = (grant: object, path = e.w.annaIdText, token = e.w.o.token) =>
      e.request(`/api/emergency/${path}`, {
        method: "PUT",
        token,
        body: { grant, packages: packagesToWire(made.packages) },
      });
    const wire = grantToWire(made.grant);
    // changed, for another path, naming oneself, sent by the grantee
    expect((await put({ ...wire, waitSeconds: 2 * DAY })).status).toBe(400);
    expect((await put(wire, e.jonasIdText)).status).toBe(404);
    expect((await put(wire, e.w.annaIdText, e.w.annaToken)).status).toBe(404);
    expect((await put(wire, e.jonasIdText, e.w.annaToken)).status).toBe(400);
    expect((await put(wire, "nobody")).status).toBe(404);
    expect((await put({ ...wire, scope: "full" })).status).toBe(400);
    // a bundle other than the one the server holds for Anna
    const swapped = { ...e.w.annaCert, xwingPublicKey: e.w.o.company.certificate.xwingPublicKey };
    const toSwapped = makeGrant(
      e.jonas,
      swapped,
      { scope: "view", rings: [e.buero.ring] },
      {
        waitSeconds: DAY,
        time: e.seconds(),
      },
    );
    expect((await put(grantToWire(toSwapped.grant))).status).toBe(400);
    expect((await put(wire)).status).toBe(200);
    // an older or equal grant does not replace a newer one
    expect((await put(wire)).status).toBe(409);
  });

  it("names only vaults the grantor is a member of, each with its package", async () => {
    const e = await weberWithBuero();
    const otherVault = { ...e.buero.ring, vaultId: new Uint8Array(16).fill(0x99) };
    expect((await e.grant({ scope: "view", rings: [otherVault] })).status).toBe(400);
    const later = { ...e.buero.ring, epoch: 1 };
    expect((await e.grant({ scope: "view", rings: [later] })).status).toBe(400);
    const made = makeGrant(
      e.jonas,
      e.w.annaCert,
      { scope: "view", rings: [e.buero.ring] },
      {
        waitSeconds: DAY,
        time: e.seconds(),
      },
    );
    const body = { grant: grantToWire(made.grant), packages: { vaults: [] } };
    const answer = await e.request(`/api/emergency/${e.w.annaIdText}`, { method: "PUT", body });
    expect(answer.status).toBe(400);
  });
});

describe("the waiting time (P-14)", () => {
  it("lets the packages out only after the waiting time, and logs every step", async () => {
    const e = await weberWithBuero();
    const { grant, packages } = await e.grant();
    expect((await e.release()).status).toBe(404);
    expect((await e.annaRequests(grant)).status).toBe(201);
    const listed = (await list(e, e.w.o.token)).given[0];
    expect(listed?.request?.at).toBe(e.seconds());
    expect(listed?.releaseAt).toBe(e.seconds() + 7 * DAY);
    expect((await e.release()).status).toBe(403);
    e.w.o.setup.clock.advance(7 * DAY * 1000 - 1);
    expect((await e.release()).status).toBe(403);
    e.w.o.setup.clock.advance(1);
    const released = await e.release();
    expect(released.status).toBe(200);
    const body = ReleaseWire.parse(await released.json());
    expect(body.packages).toEqual(packages);
    expect(body.keyBlock).toBeNull();
    expect((await e.release(e.w.o.token)).status).toBe(404);
    await e.release();
    expect(await actions(e)).toEqual([
      "emergency-granted",
      "emergency-requested",
      "emergency-released",
    ]);
  });

  it("takes a request only from the grantee, signed by it, at the server's time", async () => {
    const e = await weberWithBuero();
    const { grant } = await e.grant();
    const ask = (body: object, token = e.w.annaToken) =>
      e.request(`/api/emergency/${e.jonasIdText}/request`, { token, body });
    expect((await ask(e.statement("emergency-request", "jonas", grant))).status).toBe(400);
    expect((await ask(e.statement("emergency-objection", "anna", grant))).status).toBe(400);
    expect(await e.annaRequests(grant, e.seconds() - 3600)).toHaveProperty("status", 400);
    expect((await ask(e.statement("emergency-request", "anna", grant), e.w.o.token)).status).toBe(
      404,
    );
    expect((await e.annaRequests(grant)).status).toBe(201);
    // one request at a time
    expect((await e.annaRequests(grant)).status).toBe(409);
  });

  it("blocks the packages once the grantor objects, until a new request and its own wait", async () => {
    const e = await weberWithBuero();
    const { grant } = await e.grant();
    await e.annaRequests(grant);
    const requested = e.seconds();
    const object = (body: object, token = e.w.o.token) =>
      e.request(`/api/emergency/${e.w.annaIdText}/objection`, { token, body });
    expect(
      (await object(e.statement("emergency-objection", "jonas", grant, requested + 1))).status,
    ).toBe(400);
    expect(
      (await object(e.statement("emergency-objection", "anna", grant, requested))).status,
    ).toBe(400);
    expect(
      (await object(e.statement("emergency-objection", "jonas", grant, requested))).status,
    ).toBe(200);
    e.w.o.setup.clock.advance(30 * DAY * 1000);
    expect((await e.release()).status).toBe(409);
    expect((await list(e, e.w.annaToken)).received[0]?.objection?.at).toBe(requested);
    // a request for the same time would be the one objected to
    expect((await e.annaRequests(grant, requested)).status).toBe(400);
    expect((await e.annaRequests(grant)).status).toBe(201);
    expect((await e.release()).status).toBe(403);
    expect(await actions(e)).toEqual([
      "emergency-granted",
      "emergency-requested",
      "emergency-objected",
      "emergency-requested",
    ]);
  });

  it("refuses an objection once the packages are out", async () => {
    const e = await weberWithBuero();
    const { grant } = await e.grant();
    await e.annaRequests(grant);
    const requested = e.seconds();
    e.w.o.setup.clock.advance(7 * DAY * 1000);
    const late = await e.request(`/api/emergency/${e.w.annaIdText}/objection`, {
      body: e.statement("emergency-objection", "jonas", grant, requested),
    });
    expect(late.status).toBe(409);
    expect((await e.release()).status).toBe(200);
  });

  it("lets the packages out at once when the grantor approves early", async () => {
    const e = await weberWithBuero();
    const { grant } = await e.grant();
    await e.annaRequests(grant);
    const approve = (by: "jonas" | "anna") =>
      e.request(`/api/emergency/${e.w.annaIdText}/approval`, {
        body: e.statement("emergency-approval", by, grant, e.seconds()),
      });
    expect((await approve("anna")).status).toBe(400);
    expect((await approve("jonas")).status).toBe(200);
    const body = ReleaseWire.parse(await (await e.release()).json());
    expect(body.approval?.at).toBe(e.seconds());
    expect(await actions(e)).toEqual([
      "emergency-granted",
      "emergency-requested",
      "emergency-released",
    ]);
  });

  it("keeps a running request when the grantor renews the grant after a rotation", async () => {
    const e = await weberWithBuero();
    const first = await e.grant();
    await e.annaRequests(first.grant);
    e.w.o.setup.clock.advance(1000);
    const renewed = await e.grant(undefined, { waitSeconds: 7 * DAY, time: e.seconds() });
    expect(renewed.status).toBe(200);
    expect((await list(e, e.w.annaToken)).received[0]?.request).not.toBeNull();
    e.w.o.setup.clock.advance(1000);
    // other terms start over
    await e.grant(undefined, { waitSeconds: DAY, time: e.seconds() });
    expect((await list(e, e.w.annaToken)).received[0]?.request).toBeNull();
  });
});

describe("revoking and what the grantee reads (P-14)", () => {
  it("drops a revoked grant and shows the grantee the signed revocation", async () => {
    const e = await weberWithBuero();
    const { grant } = await e.grant();
    const revoke = (at: number) =>
      e.request(`/api/emergency/${e.w.annaIdText}`, {
        method: "DELETE",
        body: e.statement("emergency-revocation", "jonas", grant, at),
      });
    expect((await revoke(grant.time - 1)).status).toBe(400);
    expect((await revoke(grant.time)).status).toBe(200);
    const annas = await list(e, e.w.annaToken);
    expect(annas.received).toEqual([]);
    expect(annas.revocations.map((r) => r.at)).toEqual([grant.time]);
    expect((await e.annaRequests(grant)).status).toBe(404);
    expect(await actions(e)).toEqual(["emergency-granted", "emergency-revoked"]);
  });

  it("gives the grantee the named vaults with log and records, only once released", async () => {
    const e = await weberWithBuero();
    const { grant } = await e.grant();
    const vaults = () =>
      e.request(`/api/emergency/${e.jonasIdText}/vaults`, { token: e.w.annaToken });
    expect((await vaults()).status).toBe(404);
    await e.annaRequests(grant);
    expect((await vaults()).status).toBe(403);
    e.w.o.setup.clock.advance(7 * DAY * 1000);
    const shown = EmergencyVaultsWire.parse(await (await vaults()).json());
    expect(shown.vaults.map((v) => encodeBytes(v.id))).toEqual([e.vaultId]);
    expect(shown.vaults[0]?.log).toHaveLength(1);
    expect(shown.vaults[0]?.keys).toEqual([]);
  });

  it("gives no vault of a view grant the grantor is no longer a member of", async () => {
    // Review of K-307 part d: the grantee reads no more than the grantor still may
    const e = await weberWithBuero();
    const { grant } = await e.grant();
    const trust = {
      rootPublicKey: e.w.o.company.rootPublicKey,
      certificates: new Map([[idKey(e.jonas.id), e.w.o.company.certificate]]),
      now: e.seconds(),
    };
    const state = verifyLog(e.buero.ring.vaultId, [e.buero.genesis], trust);
    if (!state.ok) throw new Error(state.error);
    const signer = { accountId: e.jonas.id, edSecretKey: e.jonas.edSecretKey };
    const left = removeMember(signer, state.value, e.buero.ring.vaultId, e.jonas.id, e.seconds());
    const posted = await e.request(`/api/vaults/${e.vaultId}/log`, {
      body: { entry: toWire(left) },
    });
    expect(posted.status).toBe(201);
    await e.annaRequests(grant);
    e.w.o.setup.clock.advance(7 * DAY * 1000);
    const shown = await e.request(`/api/emergency/${e.jonasIdText}/vaults`, {
      token: e.w.annaToken,
    });
    expect(EmergencyVaultsWire.parse(await shown.json()).vaults).toEqual([]);
  });

  it("for full access gives the sealed key block and the grantor's vault keys", async () => {
    const e = await weberWithBuero();
    const { grant, status } = await e.grant({ scope: "full", accountKey: e.w.o.owner.accountKey });
    expect(status).toBe(200);
    await e.annaRequests(grant);
    await e.request(`/api/emergency/${e.w.annaIdText}/approval`, {
      body: e.statement("emergency-approval", "jonas", grant, e.seconds()),
    });
    const body = ReleaseWire.parse(await (await e.release()).json());
    expect(body.keyBlock).toEqual(e.w.o.owner.upload.keyBlock);
    const shown = EmergencyVaultsWire.parse(
      await (
        await e.request(`/api/emergency/${e.jonasIdText}/vaults`, { token: e.w.annaToken })
      ).json(),
    );
    expect(shown.vaults.map((v) => encodeBytes(v.id))).toEqual([e.vaultId]);
    expect(shown.vaults[0]?.keys.map((k) => k.epoch)).toEqual([0]);
  });

  it("ends emergency access when the grantee leaves the company", async () => {
    const e = await weberWithBuero();
    await e.grant();
    await e.request(`/api/members/${e.w.annaIdText}`, { method: "DELETE" });
    expect(e.w.o.setup.db.select().from(emergencyGrants).all()).toEqual([]);
    expect((await list(e, e.w.o.token)).given).toEqual([]);
  });
});
