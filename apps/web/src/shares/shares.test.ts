import { encodeBytes, makeShare } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import { higherVersions, loadSharedWithMe } from "./shared-with-me.ts";
import { type Colleague, sessionOf, sparkasseInBuero, sparkasseLogin } from "./shares.test-kit.ts";
import { loadShares, revokeShare, shareWith } from "./shares.ts";

// K-305 part 6b (P-10): Jonas shares the Sparkasse login of Büro with Anna and Max, who are not in
// Büro; they read it under "Mit mir geteilt"; Jonas revokes Anna's share, the entry gets a new key
type World = Awaited<ReturnType<typeof sparkasseInBuero>>;

const certificateOf = (who: Colleague) => {
  const certificate = who.row.certificate;
  if (!certificate) throw new Error("not certified");
  return certificate;
};

const share = (w: World, who: Colleague, validUntil = 0) =>
  shareWith(
    w.shares.api,
    w.c.session,
    w.store,
    w.vault,
    w.entryIdText,
    certificateOf(who),
    validUntil,
  );

const reader = (w: World, who: Colleague, token: string) =>
  sessionOf(who, token, w.c.opened.state.rootFingerprint);

const readsAs = (w: World, r: ReturnType<typeof reader>) =>
  loadSharedWithMe(
    { ...w.shares.api, ...w.members.state.deps },
    r.session,
    w.loaded.trust,
    w.loaded.people,
  );

describe("sharing an entry (P-10)", () => {
  it("lets a colleague outside the vault read the entry, with who shared it", async () => {
    const w = await sparkasseInBuero();
    expect(await share(w, w.anna)).toEqual({ ok: true });
    const listed = await loadShares(
      w.shares.api,
      w.c.session,
      w.store,
      w.vault,
      w.entryIdText,
      w.loaded.trust,
    );
    expect(listed?.map((s) => encodeBytes(s.recipient))).toEqual([
      encodeBytes(w.anna.account.accountId),
    ]);
    const anna = reader(w, w.anna, "t-anna");
    expect(await readsAs(w, anna)).toEqual([
      {
        idText: w.entryIdText,
        vaultIdText: w.vault.idText,
        version: 1,
        content: sparkasseLogin,
        sharedBy: "Jonas",
      },
    ]);
    expect(anna.state().versions).toEqual({ [w.entryIdText]: 1 });
    expect(await readsAs(w, reader(w, w.max, "t-max"))).toEqual([]);
  });

  it("refuses a last day that is over and an entry the device holds no key for", async () => {
    const w = await sparkasseInBuero();
    expect(await share(w, w.anna, 1)).toEqual({ ok: false, error: "past" });
    const other = { ...w, entryIdText: encodeBytes(new Uint8Array(16).fill(7)) };
    expect(await share(other, w.anna)).toEqual({ ok: false, error: "no-key" });
    expect(w.shares.shares).toEqual([]);
  });

  it("lists only shares an editor of the vault signed over the entry's key", async () => {
    const w = await sparkasseInBuero();
    await share(w, w.anna);
    // Anna, who is no member, signs a share to Max with the key she has: not shown, not made again
    const key = w.store.keyOf(w.vault.idText, w.entryIdText);
    if (!key) throw new Error("no key");
    const place = {
      vaultId: w.vault.ring.vaultId,
      entryId: w.shares.shares[0]?.entryId ?? new Uint8Array(),
    };
    const author = {
      id: w.anna.account.accountId,
      edSecretKey: w.anna.account.keyBlock.ed.secretKey,
    };
    const max = certificateOf(w.max);
    await w.shares.api.putShare(
      "t-anna",
      makeShare(author, key.entryKey, max, place, { validUntil: 0, time: 1 }),
    );
    const listed = await loadShares(
      w.shares.api,
      w.c.session,
      w.store,
      w.vault,
      w.entryIdText,
      w.loaded.trust,
    );
    expect(listed?.map((s) => encodeBytes(s.recipient))).toEqual([
      encodeBytes(w.anna.account.accountId),
    ]);
  });
});

describe("revoking a share (P-10)", () => {
  it("writes the entry anew under a new key and makes the other shares again with it", async () => {
    const w = await sparkasseInBuero();
    await share(w, w.anna);
    await share(w, w.max, Math.floor(Date.now() / 1000) + 3600);
    const old = w.store.keyOf(w.vault.idText, w.entryIdText);
    const anna = reader(w, w.anna, "t-anna");
    await readsAs(w, anna);
    const revoked = await revokeShare(
      w.shares.api,
      w.c.session,
      w.store,
      w.vault,
      w.entryIdText,
      w.anna.account.accountId,
      w.loaded.trust,
    );
    expect(revoked).toEqual({ ok: true });
    const renewed = w.store.keyOf(w.vault.idText, w.entryIdText);
    expect(renewed?.entryKey).not.toEqual(old?.entryKey);
    const [after] = await w.syncOf(w.vault.ring.vaultId).pull();
    expect(after?.version).toBe(2);
    expect(w.shares.shares.map((s) => [encodeBytes(s.recipient), s.validUntil > 0])).toEqual([
      [encodeBytes(w.max.account.accountId), true],
    ]);
    expect(await readsAs(w, reader(w, w.max, "t-max"))).toMatchObject([
      { version: 2, content: sparkasseLogin },
    ]);
    expect(await readsAs(w, anna)).toEqual([]);
  });

  it("shows nothing that the old key opens once the record is under the new one", async () => {
    const w = await sparkasseInBuero();
    await share(w, w.anna);
    const kept = [...w.shares.shares];
    await share(w, w.max);
    await revokeShare(
      w.shares.api,
      w.c.session,
      w.store,
      w.vault,
      w.entryIdText,
      w.anna.account.accountId,
      w.loaded.trust,
    );
    // The server hands Anna's revoked share back: the newest record does not open with its key
    w.shares.shares.push(...kept);
    expect(await readsAs(w, reader(w, w.anna, "t-anna"))).toEqual([]);
  });

  it("does not show an older version than the reader has seen (E-13)", async () => {
    const w = await sparkasseInBuero();
    await share(w, w.anna);
    const [first] = await w.syncOf(w.vault.ring.vaultId).pull();
    await w.store.save(
      w.vault.idText,
      { ...sparkasseLogin, title: "Sparkasse neu" },
      w.entryIdText,
    );
    const anna = reader(w, w.anna, "t-anna");
    expect((await readsAs(w, anna))?.map((e) => e.version)).toEqual([2]);
    if (first) w.shares.pinned.set(w.shares.at(w.vault.ring.vaultId, first.entryId), first);
    expect(await readsAs(w, anna)).toEqual([]);
    expect(anna.state().versions).toEqual({ [w.entryIdText]: 2 });
  });
});

describe("higherVersions", () => {
  it("writes only versions beyond what the account state remembers", async () => {
    const w = await sparkasseInBuero();
    const entry = {
      idText: "a",
      vaultIdText: "v",
      version: 2,
      content: sparkasseLogin,
      sharedBy: null,
    };
    const state = { ...w.c.opened.state, versions: { a: 2, b: 1 } };
    expect(higherVersions([entry])(state)).toBeUndefined();
    expect(higherVersions([{ ...entry, version: 3 }])(state)?.versions).toEqual({ a: 3, b: 1 });
  });
});
