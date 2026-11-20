import { createEntryStore } from "@kennwort/client/entries/entry-store.ts";
import { expect, it } from "vitest";
import { loadSharedWithMe } from "./shared-with-me.ts";
import { type Colleague, sessionOf, sparkasseInBuero } from "./shares.test-kit.ts";
import { revokeShare, shareWith } from "./shares.ts";

type World = Awaited<ReturnType<typeof sparkasseInBuero>>;
const cert = (who: Colleague) => {
  if (!who.row.certificate) throw new Error("not certified");
  return who.row.certificate;
};

it("a revoke on a device that still holds the old entry key does not hand a revoked share back the new key", async () => {
  const w: World = await sparkasseInBuero();
  // Jonas' second device (laptop) loaded the entry under its first key, EK0
  const laptop = createEntryStore((_t, v) => w.syncOf(v), w.c.session);
  await laptop.load(w.loaded.vaults, w.loaded.trust);

  // On the first device Jonas shares with Anna and Max, then revokes Anna: EK1, Max made again
  const put = (who: Colleague) =>
    shareWith(w.shares.api, w.c.session, w.store, w.vault, w.entryIdText, cert(who), 0);
  await put(w.anna);
  const annasOldShare = w.shares.shares[0];
  await put(w.max);
  const revoke = (store: typeof w.store, who: Colleague) =>
    revokeShare(
      w.shares.api,
      w.c.session,
      store,
      w.vault,
      w.entryIdText,
      who.account.accountId,
      w.loaded.trust,
    );
  expect(await revoke(w.store, w.anna)).toEqual({ ok: true });

  // The server keeps Anna's revoked share (signed by Jonas over EK0) and lists it again
  if (!annasOldShare) throw new Error("no share");
  w.shares.shares.push(annasOldShare);

  // Later Jonas revokes Max on the laptop, which still holds EK0
  expect(await revoke(laptop, w.max)).toEqual({ ok: true });

  // Anna was revoked and must not read the newest version
  const anna = sessionOf(w.anna, "t-anna", w.c.opened.state.rootFingerprint);
  const read = await loadSharedWithMe(
    { ...w.shares.api, ...w.members.state.deps },
    anna.session,
    w.loaded.trust,
    w.loaded.people,
  );
  expect(read).toEqual([]);
});
