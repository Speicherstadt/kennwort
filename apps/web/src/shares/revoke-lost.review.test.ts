import { encodeBytes } from "@kennwort/core";
import { expect, it } from "vitest";
import { createEntryStore } from "../entries/entry-store.ts";
import { loadSharedWithMe } from "./shared-with-me.ts";
import { type Colleague, sessionOf, sparkasseInBuero, sparkasseLogin } from "./shares.test-kit.ts";
import { loadShares, revokeShare, shareWith } from "./shares.ts";

// Review of K-305 part 6b: a revoke whose new version could not be stored must not be lost. The
// share is deleted only after the new version and the re-made shares are stored, so it stays listed
// and the revoke can be asked again, also after locking; once done, the share opens no later version
it("a revoke whose new version could not be written is not lost: the revoked share opens no later version", async () => {
  const w = await sparkasseInBuero();
  if (!w.anna.row.certificate) throw new Error("not certified");
  await shareWith(
    w.shares.api,
    w.c.session,
    w.store,
    w.vault,
    w.entryIdText,
    w.anna.row.certificate,
    0,
  );
  const annasShare = w.shares.shares[0];
  if (!annasShare) throw new Error("no share");
  const revoke = (store: typeof w.store) =>
    revokeShare(
      w.shares.api,
      w.c.session,
      store,
      w.vault,
      w.entryIdText,
      w.anna.account.accountId,
      w.loaded.trust,
    );
  const listed = (store: typeof w.store) =>
    loadShares(w.shares.api, w.c.session, store, w.vault, w.entryIdText, w.loaded.trust);

  // The server refuses the new version under the new key: the share stays, the revoke is not done
  const server = w.syncOf(w.vault.ring.vaultId);
  const push = server.push;
  server.push = () => ({ ok: false, current: undefined });
  expect(await revoke(w.store)).toEqual({ ok: false, error: "not-renewed" });
  server.push = push;
  expect((await listed(w.store))?.map((s) => encodeBytes(s.recipient))).toEqual([
    encodeBytes(w.anna.account.accountId),
  ]);
  // Nor does a later save finish it alone, without making the other shares again
  await w.store.save(w.vault.idText, sparkasseLogin, w.entryIdText);
  expect(await listed(w.store)).toHaveLength(1);

  // Jonas locks and unlocks (the entry store is made anew): Anna's share is still listed to revoke
  const again = createEntryStore((_t, v) => w.syncOf(v), w.c.session);
  await again.load(w.loaded.vaults, w.loaded.trust);
  expect((await listed(again))?.map((s) => encodeBytes(s.recipient))).toEqual([
    encodeBytes(w.anna.account.accountId),
  ]);
  expect(await revoke(again)).toEqual({ ok: true });
  expect(await listed(again)).toEqual([]);
  await again.save(
    w.vault.idText,
    { ...sparkasseLogin, title: `${sparkasseLogin.title} 2` },
    w.entryIdText,
  );

  // The server still hands Anna her revoked share: it must not open the changed version
  w.shares.shares.push(annasShare);
  const anna = sessionOf(w.anna as Colleague, "t-anna", w.c.opened.state.rootFingerprint);
  const read = await loadSharedWithMe(
    { ...w.shares.api, ...w.members.state.deps },
    anna.session,
    w.loaded.trust,
    w.loaded.people,
  );
  expect(read?.map((e) => [e.version, e.content.title])).toEqual([]);
});
