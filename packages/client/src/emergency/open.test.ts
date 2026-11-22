import { encodeBytes, type Release, signStatement } from "@kennwort/core";
import { jonas, sandra, vaultId } from "@kennwort/core/testing";
import { sealKeyBlock, wrapEmergencyVaultKey } from "@kennwort/crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  accountKeyOf,
  blockOf,
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
import { openReleased } from "./open.ts";

// K-307 part d (P-14): Sandra opens what the server released, only after every check
beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW * 1000 }));
afterEach(() => vi.useRealTimers());

describe("opening what was released (P-14)", () => {
  const released = async (scope: "view" | "full" = "view") => {
    const s = server();
    const made = await jonasGrants(s, scope);
    const request = signStatement("emergency-request", sandra.ed.secretKey, made.grant, NOW);
    s.served.listed.push(listedOf(made, { request }));
    const session = sessionOf(openedAs(sandra));
    const loaded = await load(s.api, session);
    if (!loaded.ok || !loaded.value.received[0]) throw new Error("no grant");
    const checked = { ...loaded.value, received: loaded.value.received[0] };
    const keyBlock =
      scope === "full" ? sealKeyBlock(accountKeyOf(jonas), jonas.id, blockOf(jonas)) : null;
    const release = (changes: Partial<Release> = {}): Release => ({
      packages: made.packages,
      request,
      approval: null,
      keyBlock,
      ...changes,
    });
    return { s, made, request, session, checked, release };
  };

  it("refuses packages the server lets out before the waiting time (early release)", async () => {
    const r = await released();
    r.s.served.release = r.release();
    const early = await openReleased(r.s.api, r.session.opened(), r.checked);
    expect(early).toEqual({ ok: false, error: "waiting" });
    r.s.served.release = "waiting";
    expect(await openReleased(r.s.api, r.session.opened(), r.checked)).toEqual({
      ok: false,
      error: "waiting",
    });
    expect(r.s.served.audits).toEqual([]);
  });

  it("opens Büro read-only after the wait, and signs the access into the audit log", async () => {
    const r = await released();
    r.s.served.release = r.release();
    vi.setSystemTime((NOW + 7 * DAY) * 1000);
    const checked = { ...r.checked, trust: { ...r.checked.trust, now: NOW + 7 * DAY } };
    const opened = await openReleased(r.s.api, r.session.opened(), checked);
    expect(opened.ok && opened.value.map((v) => v.entries.map((e) => e.content.title))).toEqual([
      ["Sparkasse"],
    ]);
    expect(r.s.served.audits).toEqual([`emergency-access ${encodeBytes(jonas.id)}/${NOW}`]);
  });

  it("opens at once with Jonas's signed approval of the request", async () => {
    const r = await released();
    const approval = signStatement("emergency-approval", jonas.ed.secretKey, r.made.grant, NOW);
    r.s.served.release = r.release({ approval });
    const opened = await openReleased(r.s.api, r.session.opened(), r.checked);
    expect(opened.ok && opened.value[0]?.entries).toHaveLength(1);
  });

  it("refuses a release after Jonas objected, which Sandra's client has seen (release after objection)", async () => {
    const r = await released();
    const objection = signStatement("emergency-objection", jonas.ed.secretKey, r.made.grant, NOW);
    r.s.served.listed = [listedOf(r.made, { request: r.request, objection })];
    await load(r.s.api, r.session);
    r.s.served.release = r.release();
    const checked = { ...r.checked, trust: { ...r.checked.trust, now: NOW + 30 * DAY } };
    expect(await openReleased(r.s.api, r.session.opened(), checked)).toEqual({
      ok: false,
      error: "objected",
    });
  });

  it("opens no vault with a key the server swapped in (a key without its binding)", async () => {
    const r = await released();
    const forged = wrapEmergencyVaultKey(
      { publicKey: sandra.xwing.publicKey, fingerprint: r.made.grant.granteeFingerprint },
      new Uint8Array(32).fill(0x99),
      { ...ring, grantorId: jonas.id, granteeId: sandra.id },
    );
    const approval = signStatement("emergency-approval", jonas.ed.secretKey, r.made.grant, NOW);
    r.s.served.release = r.release({
      approval,
      packages: { vaults: [{ vaultId, epoch: 0, wrapped: forged }] },
    });
    const opened = await openReleased(r.s.api, r.session.opened(), r.checked);
    expect(opened.ok && opened.value[0]).toMatchObject({ entries: [], error: "not-committed" });
  });

  it("opens the grantor's vaults with full access through the certified key block", async () => {
    const r = await released("full");
    const approval = signStatement("emergency-approval", jonas.ed.secretKey, r.made.grant, NOW);
    r.s.served.release = r.release({ approval });
    const opened = await openReleased(r.s.api, r.session.opened(), r.checked);
    expect(opened.ok && opened.value[0]?.entries.map((e) => e.content.title)).toEqual([
      "Sparkasse",
    ]);
    r.s.served.release = r.release({ approval, keyBlock: new Uint8Array(8) });
    expect(await openReleased(r.s.api, r.session.opened(), r.checked)).toEqual({
      ok: false,
      error: "wrong-key-block",
    });
  });
});
