// K-307 part a (P-11): the key rotation on the server. Jonas removes Anna and rotates; the server
// keeps the new key for the remaining members only, gives Anna nothing more and takes records only
// in the current epoch
import { describe, expect, it } from "bun:test";
import {
  addMember,
  encodeBytes,
  idKey,
  openRings,
  type Rotation,
  recordToWire,
  removeAndRotate,
  rotateVaultKey,
  sealRecord,
  toWire,
} from "@kennwort/core";
import { rootFingerprint, xwingKeyPair } from "@kennwort/crypto";
import { eq } from "drizzle-orm";
import { vaultKeys } from "../db/schema.ts";
import { createBuero, NOW, post, stateOf, type Weber, weber } from "../testing/weber-vaults.ts";

const keysBody = (rotation: Pick<Rotation, "wrappedKeys">) =>
  rotation.wrappedKeys.map((k) => ({
    accountId: encodeBytes(k.accountId),
    wrapped: encodeBytes(k.wrapped),
  }));

/** Büro with Anna as editor; the checked state after her add */
const withAnna = async (w: Weber) => {
  const { vault, vaultId } = await createBuero(w);
  const s0 = stateOf(w, vault.ring.vaultId, [vault.genesis]);
  if (!s0.ok) throw new Error(s0.error);
  const added = addMember(
    w.jonas.signer,
    s0.value,
    vault.ring,
    w.annaCert,
    { role: "edit", validUntil: 0 },
    NOW + 1,
  );
  await post(w, vaultId, { entry: toWire(added.entry), wrappedKey: encodeBytes(added.wrappedKey) });
  const entries = [vault.genesis, added.entry];
  const state = stateOf(w, vault.ring.vaultId, entries);
  if (!state.ok) throw new Error(state.error);
  return { vault, vaultId, entries, state: state.value };
};
const trust = (w: Weber) => ({
  rootPublicKey: w.o.company.rootPublicKey,
  certificates: new Map([w.jonas.certificate, w.annaCert].map((c) => [idKey(c.accountId), c])),
  now: NOW + 100,
});
const keysOf = async (w: Weber, vaultId: string, token: string) => {
  const answer = await w.o.setup.request(`/api/vaults/${vaultId}/keys`, { token });
  if (answer.status !== 200) return answer.status;
  return ((await answer.json()) as { keys: { epoch: number; wrapped: string }[] }).keys;
};
const putRecord = (w: Weber, vaultId: Uint8Array, epoch: number, version: number) =>
  w.o.setup.request(`/api/vaults/${encodeBytes(vaultId)}/records`, {
    method: "PUT",
    token: w.o.token,
    body: recordToWire(
      sealRecord(
        { id: w.jonas.signer.accountId, edSecretKey: w.jonas.signer.edSecretKey },
        { vaultId, epoch, vaultKey: new Uint8Array(32).fill(epoch + 1) },
        new Uint8Array(16).fill(0xe1),
        version,
        {
          type: "note",
          title: "Heizungsraum",
          fields: [],
          tags: [],
          favorite: false,
          history: [],
        },
        new Uint8Array(),
      ),
    ),
  });

describe("key rotation on the server (K-307, P-11)", () => {
  it("keeps a rotation's keys for every member; Anna opens hers against the signed log", async () => {
    const w = await weber();
    const { vault, vaultId, entries, state } = await withAnna(w);
    const rotation = rotateVaultKey(w.jonas.signer, state, vault.ring.vaultId, trust(w), NOW + 2);
    if (!rotation.ok) throw new Error(rotation.error);
    const answer = await post(w, vaultId, {
      entry: toWire(rotation.value.entry),
      wrappedKeys: keysBody(rotation.value),
    });
    expect(answer.status).toBe(201);
    const keys = await keysOf(w, vaultId, w.annaToken);
    if (typeof keys === "number") throw new Error(`keys: ${keys}`);
    expect(keys.map((k) => k.epoch)).toEqual([0, 1]);
    const after = stateOf(w, vault.ring.vaultId, [...entries, rotation.value.entry]);
    if (!after.ok) throw new Error(after.error);
    const annaBlock = {
      xwing: xwingKeyPair(new Uint8Array(32).fill(8)),
      ed: w.annaEd,
      rootFingerprint: rootFingerprint(w.o.company.rootPublicKey),
    };
    const rings = openRings(
      annaBlock,
      w.annaId,
      after.value,
      vault.ring.vaultId,
      keys.map((k) => ({ epoch: k.epoch, wrapped: Buffer.from(k.wrapped, "base64url") })),
    );
    expect(rings.ok && rings.value.current.vaultKey).toEqual(rotation.value.ring.vaultKey);
  });

  it("removes Anna with a rotation: she gets no key at all any more, Jonas the new one", async () => {
    const w = await weber();
    const { vault, vaultId, state } = await withAnna(w);
    const exit = removeAndRotate(
      w.jonas.signer,
      state,
      vault.ring.vaultId,
      w.annaId,
      trust(w),
      NOW + 2,
    );
    if (!exit.ok) throw new Error(exit.error);
    const [remove, rotate] = exit.value.entries;
    expect((await post(w, vaultId, { entry: toWire(remove) })).status).toBe(201);
    expect(
      w.o.setup.db
        .select()
        .from(vaultKeys)
        .where(eq(vaultKeys.accountId, encodeBytes(w.annaId)))
        .all(),
    ).toEqual([]);
    expect(
      (await post(w, vaultId, { entry: toWire(rotate), wrappedKeys: keysBody(exit.value) })).status,
    ).toBe(201);
    expect(await keysOf(w, vaultId, w.annaToken)).toBe(404);
    const jonasKeys = await keysOf(w, vaultId, w.o.token);
    expect(typeof jonasKeys !== "number" && jonasKeys.map((k) => k.epoch)).toEqual([0, 1]);
  });

  it("refuses a rotation with a key for someone no longer in the vault, or none for a member", async () => {
    const w = await weber();
    const { vault, vaultId, state } = await withAnna(w);
    const exit = removeAndRotate(
      w.jonas.signer,
      state,
      vault.ring.vaultId,
      w.annaId,
      trust(w),
      NOW + 2,
    );
    if (!exit.ok) throw new Error(exit.error);
    const [remove, rotate] = exit.value.entries;
    await post(w, vaultId, { entry: toWire(remove) });
    const forAnna = [
      ...keysBody(exit.value),
      { accountId: encodeBytes(w.annaId), wrapped: keysBody(exit.value)[0]?.wrapped },
    ];
    expect((await post(w, vaultId, { entry: toWire(rotate), wrappedKeys: forAnna })).status).toBe(
      400,
    );
    expect((await post(w, vaultId, { entry: toWire(rotate), wrappedKeys: [] })).status).toBe(400);
    expect(
      w.o.setup.db
        .select()
        .from(vaultKeys)
        .all()
        .map((k) => k.epoch),
    ).toEqual([0]);
  });

  it("takes records only in the epoch of the log's newest entry", async () => {
    const w = await weber();
    const { vault, vaultId, state } = await withAnna(w);
    expect((await putRecord(w, vault.ring.vaultId, 0, 1)).status).toBe(200);
    const rotation = rotateVaultKey(w.jonas.signer, state, vault.ring.vaultId, trust(w), NOW + 2);
    if (!rotation.ok) throw new Error(rotation.error);
    await post(w, vaultId, {
      entry: toWire(rotation.value.entry),
      wrappedKeys: keysBody(rotation.value),
    });
    const old = await putRecord(w, vault.ring.vaultId, 0, 2);
    expect(old.status).toBe(409);
    expect(((await old.json()) as { error: string }).error).toBe("epoch");
    expect((await putRecord(w, vault.ring.vaultId, 1, 2)).status).toBe(200);
  });
});
