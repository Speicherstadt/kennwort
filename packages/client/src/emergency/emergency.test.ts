import { emptyState, encodeBytes, type Statement, signStatement } from "@kennwort/core";
import { anna, jonas, root, sandra } from "@kennwort/core/testing";
import { rootFingerprint } from "@kennwort/crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Vault } from "../vaults/vaults.ts";
import {
  DAY,
  jonasGrants,
  listedOf,
  load,
  NOW,
  openedAs,
  ring,
  server,
  sessionOf,
} from "./emergency.test-kit.ts";
import {
  approveEarly,
  grantAccess,
  objectTo,
  renewGrants,
  requestAccess,
  revoke,
} from "./emergency.ts";

// K-307 part d (P-14): Jonas names Sandra for emergency access to Büro (the server in memory lies
// where a test says so)
beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW * 1000 }));
afterEach(() => vi.useRealTimers());

describe("emergency access on the client (P-14)", () => {
  it("lets Jonas name only a certified colleague, and Sandra see the grant", async () => {
    const s = server();
    const made = await jonasGrants(s);
    expect(made.grant).toMatchObject({ scope: "view", waitSeconds: 7 * DAY, time: NOW });
    const jonasSession = sessionOf(openedAs(jonas));
    const loaded = await load(s.api, jonasSession);
    if (!loaded.ok) throw new Error(loaded.error);
    const stranger = new Uint8Array(16).fill(0x99);
    expect(
      await grantAccess(s.api, jonasSession.opened(), loaded.value.trust, stranger, {
        scope: "full",
        waitSeconds: DAY,
      }),
    ).toBe("uncertified");
    s.served.listed.push(listedOf(made));
    const sandraSession = sessionOf(openedAs(sandra));
    const seen = await load(s.api, sandraSession);
    expect(seen.ok && seen.value.received.map((r) => r.person?.name)).toEqual(["Jonas"]);
    expect(sandraSession.opened().state.emergency).toEqual({
      [encodeBytes(jonas.id)]: { grant: NOW, revoked: false, objected: 0 },
    });
    const given = await load(s.api, jonasSession);
    expect(given.ok && given.value.given.map((g) => g.grantee?.name)).toEqual(["Sandra"]);
  });

  it("shows no forged grant, and none the server plays back after a revocation", async () => {
    const s = server();
    const made = await jonasGrants(s);
    s.served.listed.push(listedOf({ grant: { ...made.grant, waitSeconds: DAY } }));
    const sandraSession = sessionOf(openedAs(sandra));
    const forged = await load(s.api, sandraSession);
    expect(forged.ok && forged.value.received).toEqual([]);
    s.served.listed = [listedOf(made)];
    s.served.revocations = [
      signStatement("emergency-revocation", jonas.ed.secretKey, made.grant, made.grant.time),
      // one the server made up, and one of a grant to Anna, are ignored
      signStatement("emergency-revocation", sandra.ed.secretKey, made.grant, made.grant.time + 5),
    ];
    const toAnna = signStatement(
      "emergency-revocation",
      jonas.ed.secretKey,
      { ...made.grant, grantee: anna.id },
      made.grant.time + 9,
    );
    s.served.revocations = [toAnna];
    const elsewhere = await load(s.api, sandraSession);
    expect(elsewhere.ok && elsewhere.value.received).toHaveLength(1);
    s.served.revocations = [
      signStatement("emergency-revocation", jonas.ed.secretKey, made.grant, made.grant.time),
      signStatement("emergency-revocation", sandra.ed.secretKey, made.grant, made.grant.time + 5),
    ];
    const revoked = await load(s.api, sandraSession);
    expect(revoked.ok && revoked.value.received).toEqual([]);
    // the server drops the revocation and serves the grant again: Sandra's state remembers
    s.served.revocations = [];
    const replayed = await load(s.api, sandraSession);
    expect(replayed.ok && replayed.value.received).toEqual([]);
    expect(sandraSession.opened().state.emergency[encodeBytes(jonas.id)]?.revoked).toBe(true);
  });

  it("signs request, objection, approval and revocation for the right grant and time", async () => {
    const s = server();
    const made = await jonasGrants(s);
    expect(await requestAccess(s.api, openedAs(sandra), made.grant)).toBe(true);
    const request = s.served.sent.at(-1) as Statement;
    expect(request.at).toBe(NOW);
    const listed = listedOf(made, { request });
    expect(await objectTo(s.api, openedAs(jonas), listed)).toBe(true);
    // asked again within the same second after the objection: a later time than the objected one
    const objectedState = {
      ...emptyState(rootFingerprint(root.publicKey)),
      emergency: { [encodeBytes(jonas.id)]: { grant: NOW, revoked: false, objected: NOW } },
    };
    expect(await requestAccess(s.api, openedAs(sandra, objectedState), made.grant)).toBe(true);
    expect(s.served.sent.pop()?.at).toBe(NOW + 1);
    expect(await approveEarly(s.api, openedAs(jonas), listed)).toBe(true);
    expect(await revoke(s.api, openedAs(jonas), made.grant)).toBe(true);
    expect(s.served.sent.map((st) => st.at)).toEqual([NOW, NOW, NOW, made.grant.time]);
    expect(await objectTo(s.api, openedAs(jonas), listedOf(made))).toBe(false);
    expect(await approveEarly(s.api, openedAs(jonas), listedOf(made))).toBe(false);
  });
});

describe("renewing after a key rotation (P-11)", () => {
  it("makes a view grant anew with the current key, under the same terms", async () => {
    const s = server();
    const made = await jonasGrants(s);
    const jonasSession = sessionOf(openedAs(jonas));
    const loaded = await load(s.api, jonasSession);
    if (!loaded.ok) throw new Error(loaded.error);
    const rotated = { ring: { ...ring, epoch: 1, vaultKey: new Uint8Array(32).fill(0x66) } };
    const given = [listedOf(made)];
    const opened = jonasSession.opened();
    expect(await renewGrants(s.api, opened, loaded.value.trust, given, [{ ring } as Vault])).toBe(
      0,
    );
    expect(await renewGrants(s.api, opened, loaded.value.trust, given, [rotated as Vault])).toBe(1);
    const renewed = s.served.grants.at(-1)?.grant;
    expect(renewed?.items.map((i) => i.epoch)).toEqual([1]);
    expect(renewed?.time).toBe(NOW + 1);
    expect(renewed?.waitSeconds).toBe(made.grant.waitSeconds);
  });
});
