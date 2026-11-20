// K-305 part 1 (P-05, P-06): Jonas creates a vault and adds Anna; the server keeps log and keys
import { describe, expect, it } from "bun:test";
import {
  addMember,
  CLOCK_SKEW_SECONDS,
  changeAccess,
  encodeBytes,
  idKey,
  openVaultName,
  removeMember,
  sealVaultName,
  toWire,
  verifyLog,
} from "@kennwort/core";
import {
  createBuero,
  type Listed,
  logOf,
  NOW,
  post,
  stateOf,
  type Weber,
  weber,
} from "../testing/weber-vaults.ts";

describe("vault log and keys (K-305 part 1)", () => {
  it("keeps the genesis and Jonas's key, and lists the vault as his", async () => {
    const w = await weber();
    const { vault, vaultId } = await createBuero(w);
    const entries = await logOf(w, vaultId);
    expect(entries).toEqual([vault.genesis]);
    const keys = (await (
      await w.o.setup.request(`/api/vaults/${vaultId}/keys`, { token: w.o.token })
    ).json()) as {
      keys: { epoch: number; wrapped: string }[];
    };
    expect(keys.keys).toEqual([{ epoch: 0, wrapped: encodeBytes(vault.wrappedKey) }]);
    const mine = (await (await w.o.setup.request("/api/vaults", { token: w.o.token })).json()) as {
      vaults: Listed[];
    };
    expect(mine.vaults).toEqual([{ id: vaultId, name: null, nameEpoch: null }]);
  });

  it("adds Anna with her key; she then sees the vault and its log, a chain the client accepts", async () => {
    const w = await weber();
    const { vault, vaultId } = await createBuero(w);
    const genesisState = stateOf(w, vault.ring.vaultId, [vault.genesis]);
    if (!genesisState.ok) throw new Error(genesisState.error);
    const added = addMember(
      w.jonas.signer,
      genesisState.value,
      vault.ring,
      w.annaCert,
      { role: "edit", validUntil: 0 },
      NOW + 1,
    );
    expect(
      (
        await post(w, vaultId, {
          entry: toWire(added.entry),
          wrappedKey: encodeBytes(added.wrappedKey),
        })
      ).status,
    ).toBe(201);
    expect((await logOf(w, vaultId, w.annaToken)) as unknown[]).toHaveLength(2);
    const annaVaults = (await (
      await w.o.setup.request("/api/vaults", { token: w.annaToken })
    ).json()) as { vaults: Listed[] };
    expect(annaVaults.vaults.map((v) => v.id)).toEqual([vaultId]);
    const checked = stateOf(w, vault.ring.vaultId, (await logOf(w, vaultId)) as never);
    expect(checked.ok).toBe(true);
  });

  it("keeps the chain whole: next number, previous hash, the session as signer, a manager", async () => {
    const w = await weber();
    const { vault, vaultId } = await createBuero(w);
    const state = stateOf(w, vault.ring.vaultId, [vault.genesis]);
    if (!state.ok) throw new Error(state.error);
    const added = addMember(
      w.jonas.signer,
      state.value,
      vault.ring,
      w.annaCert,
      { role: "read", validUntil: 0 },
      NOW + 1,
    );
    const body = { entry: toWire(added.entry), wrappedKey: encodeBytes(added.wrappedKey) };
    // Anna posts Jonas's entry: she is not its signer
    expect((await post(w, vaultId, body, w.annaToken)).status).toBe(403);
    expect(
      (await post(w, vaultId, { entry: { ...body.entry, seq: 5 }, wrappedKey: body.wrappedKey }))
        .status,
    ).toBe(409);
    expect(
      (
        await post(w, vaultId, {
          entry: { ...body.entry, prevHash: encodeBytes(new Uint8Array(32)) },
          wrappedKey: body.wrappedKey,
        })
      ).status,
    ).toBe(409);
    expect((await post(w, vaultId, { entry: body.entry })).status).toBe(400);
    expect(
      (
        await post(w, vaultId, {
          entry: { ...body.entry, vaultId: encodeBytes(new Uint8Array(16)) },
          wrappedKey: body.wrappedKey,
        })
      ).status,
    ).toBe(400);
    expect(
      (await post(w, vaultId, { entry: body.entry, wrappedKey: encodeBytes(new Uint8Array(10)) }))
        .status,
    ).toBe(400);
    // a signature that is not Jonas's: the chain would break for everyone
    const flipped = added.entry.signature.slice();
    flipped.set([(flipped.at(-1) ?? 0) ^ 1], flipped.length - 1);
    const forged = toWire({ ...added.entry, signature: flipped });
    expect((await post(w, vaultId, { entry: forged, wrappedKey: body.wrappedKey })).status).toBe(
      400,
    );
    expect((await post(w, vaultId, body)).status).toBe(201);
    expect((await post(w, vaultId, body)).status).toBe(409);
    // Anna only reads: as signer of her own entry she still is no manager
    const afterAdd = stateOf(w, vault.ring.vaultId, (await logOf(w, vaultId)) as never);
    if (!afterAdd.ok) throw new Error(afterAdd.error);
    const annaSigner = { accountId: w.annaId, edSecretKey: w.annaEd.secretKey };
    const self = changeAccess(
      annaSigner,
      afterAdd.value,
      vault.ring.vaultId,
      w.annaId,
      { role: "manage", validUntil: 0 },
      NOW + 2,
    );
    expect((await post(w, vaultId, { entry: toWire(self) }, w.annaToken)).status).toBe(403);
  });

  it("removes Anna: the vault is no longer hers, though she keeps her old key until a key rotation", async () => {
    const w = await weber();
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
    await post(w, vaultId, {
      entry: toWire(added.entry),
      wrappedKey: encodeBytes(added.wrappedKey),
    });
    const s1 = stateOf(w, vault.ring.vaultId, [vault.genesis, added.entry]);
    if (!s1.ok) throw new Error(s1.error);
    const removed = removeMember(w.jonas.signer, s1.value, vault.ring.vaultId, w.annaId, NOW + 2);
    expect((await post(w, vaultId, { entry: toWire(removed) })).status).toBe(201);
    const annaVaults = (await (
      await w.o.setup.request("/api/vaults", { token: w.annaToken })
    ).json()) as { vaults: Listed[] };
    expect(annaVaults.vaults).toEqual([]);
  });

  it("knows no vault of another company and shows the log to no outsider", async () => {
    const w = await weber();
    const { vaultId } = await createBuero(w);
    expect(await logOf(w, vaultId, w.annaToken)).toBe(404);
    expect(await logOf(w, encodeBytes(new Uint8Array(16).fill(9)))).toBe(404);
    expect((await post(w, encodeBytes(new Uint8Array(16).fill(9)), {})).status).toBe(404);
  });
});

const addAnna = async (
  w: Weber,
  access: { role: "read" | "edit" | "manage"; validUntil: number },
) => {
  const { vault, vaultId } = await createBuero(w);
  const s0 = stateOf(w, vault.ring.vaultId, [vault.genesis]);
  if (!s0.ok) throw new Error(s0.error);
  const added = addMember(w.jonas.signer, s0.value, vault.ring, w.annaCert, access, NOW + 1);
  expect(
    (
      await post(w, vaultId, {
        entry: toWire(added.entry),
        wrappedKey: encodeBytes(added.wrappedKey),
      })
    ).status,
  ).toBe(201);
  return { vault, vaultId, added };
};

describe("vault log against what verifyLog rejects (review of K-305 part 1)", () => {
  it("R1: a removed member no longer reads the vault's log", async () => {
    const w = await weber();
    const { vault, vaultId, added } = await addAnna(w, { role: "edit", validUntil: 0 });
    const s1 = stateOf(w, vault.ring.vaultId, [vault.genesis, added.entry]);
    if (!s1.ok) throw new Error(s1.error);
    const removed = removeMember(w.jonas.signer, s1.value, vault.ring.vaultId, w.annaId, NOW + 2);
    expect((await post(w, vaultId, { entry: toWire(removed) })).status).toBe(201);
    expect(await logOf(w, vaultId, w.annaToken)).toBe(404);
  });

  it("R2: a member whose access ran out no longer reads the vault's log", async () => {
    const w = await weber();
    const { vaultId } = await addAnna(w, {
      role: "edit",
      validUntil: Math.floor(Date.now() / 1000) - 10,
    });
    const listed = (await (
      await w.o.setup.request("/api/vaults", { token: w.annaToken })
    ).json()) as {
      vaults: Listed[];
    };
    expect(listed.vaults).toEqual([]);
    expect(await logOf(w, vaultId, w.annaToken)).toBe(404);
  });

  it("R3: the server takes no entry signed earlier than the last one (verifyLog: bad-time)", async () => {
    const w = await weber();
    const { vault, vaultId, added } = await addAnna(w, { role: "edit", validUntil: 0 });
    const s1 = stateOf(w, vault.ring.vaultId, [vault.genesis, added.entry]);
    if (!s1.ok) throw new Error(s1.error);
    // Jonas's second device runs a little behind the first
    const change = changeAccess(
      w.jonas.signer,
      s1.value,
      vault.ring.vaultId,
      w.annaId,
      { role: "read", validUntil: 0 },
      NOW,
    );
    const status = (await post(w, vaultId, { entry: toWire(change) })).status;
    const checked = stateOf(w, vault.ring.vaultId, (await logOf(w, vaultId)) as never);
    expect({ status, ok: checked.ok }).toEqual({ status: 400, ok: true });
  });

  it("R4: adding a current member again neither enters the log nor replaces their key", async () => {
    const w = await weber();
    const { vault, vaultId, added } = await addAnna(w, { role: "edit", validUntil: 0 });
    const s1 = stateOf(w, vault.ring.vaultId, [vault.genesis, added.entry]);
    if (!s1.ok) throw new Error(s1.error);
    const again = addMember(
      w.jonas.signer,
      s1.value,
      vault.ring,
      w.annaCert,
      { role: "read", validUntil: 0 },
      NOW + 2,
    );
    const status = (
      await post(w, vaultId, {
        entry: toWire(again.entry),
        wrappedKey: encodeBytes(again.wrappedKey),
      })
    ).status;
    const keys = (await (
      await w.o.setup.request(`/api/vaults/${vaultId}/keys`, { token: w.annaToken })
    ).json()) as { keys: { epoch: number; wrapped: string }[] };
    const checked = stateOf(w, vault.ring.vaultId, (await logOf(w, vaultId)) as never);
    expect({ status, ok: checked.ok, key: keys.keys[0]?.wrapped }).toEqual({
      status: 400,
      ok: true,
      key: encodeBytes(added.wrappedKey),
    });
  });

  it("R5: a role change for a non-member does not make them a member on the server", async () => {
    const w = await weber();
    const { vault, vaultId } = await createBuero(w);
    const s0 = stateOf(w, vault.ring.vaultId, [vault.genesis]);
    if (!s0.ok) throw new Error(s0.error);
    const change = changeAccess(
      w.jonas.signer,
      s0.value,
      vault.ring.vaultId,
      w.annaId,
      { role: "manage", validUntil: 0 },
      NOW + 1,
    );
    const status = (await post(w, vaultId, { entry: toWire(change) })).status;
    const checked = stateOf(w, vault.ring.vaultId, (await logOf(w, vaultId)) as never);
    expect({ status, ok: checked.ok }).toEqual({ status: 400, ok: true });
  });
  it("adds a removed member again in the same epoch, with a newly wrapped key", async () => {
    const w = await weber();
    const { vault, vaultId, added } = await addAnna(w, { role: "edit", validUntil: 0 });
    const s1 = stateOf(w, vault.ring.vaultId, [vault.genesis, added.entry]);
    if (!s1.ok) throw new Error(s1.error);
    const removed = removeMember(w.jonas.signer, s1.value, vault.ring.vaultId, w.annaId, NOW + 2);
    expect((await post(w, vaultId, { entry: toWire(removed) })).status).toBe(201);
    const s2 = stateOf(w, vault.ring.vaultId, [vault.genesis, added.entry, removed]);
    if (!s2.ok) throw new Error(s2.error);
    const back = addMember(
      w.jonas.signer,
      s2.value,
      vault.ring,
      w.annaCert,
      { role: "read", validUntil: 0 },
      NOW + 3,
    );
    const answer = await post(w, vaultId, {
      entry: toWire(back.entry),
      wrappedKey: encodeBytes(back.wrappedKey),
    });
    expect(answer.status).toBe(201);
    expect(await logOf(w, vaultId, w.annaToken)).toHaveLength(4);
  });
  it("a manager whose access ran out cannot extend it with a backdated entry", async () => {
    const w = await weber();
    const { vault, vaultId, added } = await addAnna(w, { role: "manage", validUntil: NOW + 5 });
    const s1 = stateOf(w, vault.ring.vaultId, [vault.genesis, added.entry]);
    if (!s1.ok) throw new Error(s1.error);
    // now is NOW + 600: Anna's access ended ten minutes ago; she signs as if it were NOW + 3
    const annaSigner = { accountId: w.annaId, edSecretKey: w.annaEd.secretKey };
    const forever = changeAccess(
      annaSigner,
      s1.value,
      vault.ring.vaultId,
      w.annaId,
      { role: "manage", validUntil: 0 },
      NOW + 3,
    );
    expect((await post(w, vaultId, { entry: toWire(forever) }, w.annaToken)).status).toBe(403);
  });
});

describe("signed times against the server's clock", () => {
  const atTime = async (w: Weber, time: number) => {
    const { vault, vaultId } = await createBuero(w);
    const s0 = stateOf(w, vault.ring.vaultId, [vault.genesis]);
    if (!s0.ok) throw new Error(s0.error);
    const added = addMember(
      w.jonas.signer,
      s0.value,
      vault.ring,
      w.annaCert,
      { role: "read", validUntil: 0 },
      time,
    );
    return (
      await post(w, vaultId, {
        entry: toWire(added.entry),
        wrappedKey: encodeBytes(added.wrappedKey),
      })
    ).status;
  };
  const serverNow = () => Math.floor(Date.now() / 1000);

  it("takes an entry from a device whose clock runs a minute ahead", async () => {
    expect(await atTime(await weber(), serverNow() + 60)).toBe(201);
  });

  it("refuses one signed an hour ahead, which clients would reject until then", async () => {
    expect(await atTime(await weber(), serverNow() + 3600)).toBe(400);
  });
  it("stores no entry signed further ahead than clients take (CLOCK_SKEW_SECONDS)", async () => {
    const w = await weber();
    const { vault, vaultId, added } = await addAnna(w, { role: "edit", validUntil: 0 });
    const s1 = stateOf(w, vault.ring.vaultId, [vault.genesis, added.entry]);
    if (!s1.ok) throw new Error(s1.error);
    const ahead = Math.floor(Date.now() / 1000) + CLOCK_SKEW_SECONDS + 60;
    const change = changeAccess(
      w.jonas.signer,
      s1.value,
      vault.ring.vaultId,
      w.annaId,
      { role: "read", validUntil: 0 },
      ahead,
    );
    const status = (await post(w, vaultId, { entry: toWire(change) })).status;
    const entries = (await logOf(w, vaultId)) as never;
    const trust = {
      rootPublicKey: w.o.company.rootPublicKey,
      certificates: new Map([
        [idKey(w.jonas.certificate.accountId), w.jonas.certificate],
        [idKey(w.annaId), w.annaCert],
      ]),
      now: Math.floor(Date.now() / 1000),
    };
    expect({ status, ok: verifyLog(vault.ring.vaultId, entries, trust).ok }).toEqual({
      status: 400,
      ok: true,
    });
  });
});

describe("the vault's name, sealed with its key (K-305 part 2)", () => {
  const rename = (w: Weber, vaultId: string, body: unknown, token = w.o.token) =>
    w.o.setup.request(`/api/vaults/${vaultId}/name`, { method: "PUT", token, body });
  const listOf = async (w: Weber, token: string) =>
    ((await (await w.o.setup.request("/api/vaults", { token })).json()) as { vaults: Listed[] })
      .vaults;

  it("keeps the name a manager sealed and lists it to every member, who opens it", async () => {
    const w = await weber();
    const { vault, vaultId } = await createBuero(w);
    const name = encodeBytes(sealVaultName(vault.ring, "Büro"));
    expect((await rename(w, vaultId, { epoch: 0, name })).status).toBe(200);
    const s0 = stateOf(w, vault.ring.vaultId, [vault.genesis]);
    if (!s0.ok) throw new Error(s0.error);
    const added = addMember(
      w.jonas.signer,
      s0.value,
      vault.ring,
      w.annaCert,
      { role: "read", validUntil: 0 },
      NOW + 1,
    );
    await post(w, vaultId, {
      entry: toWire(added.entry),
      wrappedKey: encodeBytes(added.wrappedKey),
    });
    const [listed] = await listOf(w, w.annaToken);
    expect(listed).toEqual({ id: vaultId, name, nameEpoch: 0 });
    expect(openVaultName(vault.ring, Buffer.from(name, "base64url"))).toEqual({
      ok: true,
      value: "Büro",
    });
    // Anna only reads: she does not rename
    expect((await rename(w, vaultId, { epoch: 0, name }, w.annaToken)).status).toBe(403);
  });

  it("takes only the current epoch and a sealed name of a possible length", async () => {
    const w = await weber();
    const { vault, vaultId } = await createBuero(w);
    const name = encodeBytes(sealVaultName(vault.ring, "Büro"));
    expect((await rename(w, vaultId, { epoch: 1, name })).status).toBe(400);
    expect(
      (await rename(w, vaultId, { epoch: 0, name: encodeBytes(new Uint8Array(41)) })).status,
    ).toBe(400);
    expect(
      (await rename(w, vaultId, { epoch: 0, name: encodeBytes(new Uint8Array(442)) })).status,
    ).toBe(400);
    expect(
      (await rename(w, vaultId, { epoch: 0, name: encodeBytes(new Uint8Array(42)) })).status,
    ).toBe(200);
    expect(
      (await rename(w, vaultId, { epoch: 0, name: encodeBytes(new Uint8Array(441)) })).status,
    ).toBe(200);
    expect((await rename(w, vaultId, { epoch: 0 })).status).toBe(400);
  });

  it("is no business of a non-member", async () => {
    const w = await weber();
    const { vault, vaultId } = await createBuero(w);
    const name = encodeBytes(sealVaultName(vault.ring, "Büro"));
    expect((await rename(w, vaultId, { epoch: 0, name }, w.annaToken)).status).toBe(404);
  });
});

describe("access requests (K-305 part 4)", () => {
  const ask = (w: Weber, vaultId: string, token = w.annaToken) =>
    w.o.setup.request(`/api/vaults/${vaultId}/requests`, { method: "POST", token, body: {} });
  const requestsOf = async (w: Weber, vaultId: string, token = w.o.token) => {
    const answer = await w.o.setup.request(`/api/vaults/${vaultId}/requests`, { token });
    if (answer.status !== 200) return answer.status;
    return ((await answer.json()) as { requests: { accountId: string }[] }).requests.map(
      (r) => r.accountId,
    );
  };
  const drop = (w: Weber, vaultId: string, accountId: string, token = w.o.token) =>
    w.o.setup.request(`/api/vaults/${vaultId}/requests/${accountId}`, { method: "DELETE", token });
  const annaText = (w: Weber) => encodeBytes(w.annaId);

  it("keeps Anna's request for the managers, once, and the add answers it", async () => {
    const w = await weber();
    const { vault, vaultId } = await createBuero(w);
    expect((await ask(w, vaultId)).status).toBe(201);
    expect((await ask(w, vaultId)).status).toBe(201);
    expect(await requestsOf(w, vaultId)).toEqual([annaText(w)]);
    // Anna is no member: she sees no requests
    expect(await requestsOf(w, vaultId, w.annaToken)).toBe(404);
    const s0 = stateOf(w, vault.ring.vaultId, [vault.genesis]);
    if (!s0.ok) throw new Error(s0.error);
    const added = addMember(
      w.jonas.signer,
      s0.value,
      vault.ring,
      w.annaCert,
      { role: "read", validUntil: 0 },
      NOW + 1,
    );
    await post(w, vaultId, {
      entry: toWire(added.entry),
      wrappedKey: encodeBytes(added.wrappedKey),
    });
    expect(await requestsOf(w, vaultId)).toEqual([]);
    // a member does not ask again
    expect((await ask(w, vaultId)).status).toBe(409);
    // and only managers see requests
    expect(await requestsOf(w, vaultId, w.annaToken)).toBe(403);
  });

  it("lets a manager decline and Anna withdraw, nobody else drop a request", async () => {
    const w = await weber();
    const { vault, vaultId } = await createBuero(w);
    await ask(w, vaultId);
    expect((await drop(w, vaultId, annaText(w))).status).toBe(200);
    expect(await requestsOf(w, vaultId)).toEqual([]);
    await ask(w, vaultId);
    expect((await drop(w, vaultId, annaText(w), w.annaToken)).status).toBe(200);
    expect(await requestsOf(w, vaultId)).toEqual([]);
    // Anna as a reader may not drop Jonas's request (there is none, but the right is checked)
    const s0 = stateOf(w, vault.ring.vaultId, [vault.genesis]);
    if (!s0.ok) throw new Error(s0.error);
    const added = addMember(
      w.jonas.signer,
      s0.value,
      vault.ring,
      w.annaCert,
      { role: "read", validUntil: 0 },
      NOW + 1,
    );
    await post(w, vaultId, {
      entry: toWire(added.entry),
      wrappedKey: encodeBytes(added.wrappedKey),
    });
    const jonasText = encodeBytes(w.jonas.signer.accountId);
    expect((await drop(w, vaultId, jonasText, w.annaToken)).status).toBe(403);
  });

  it("takes the request of a member whose time ran out; renewing her access answers it", async () => {
    const w = await weber();
    const { vault, vaultId } = await createBuero(w);
    const s0 = stateOf(w, vault.ring.vaultId, [vault.genesis]);
    if (!s0.ok) throw new Error(s0.error);
    const ranOut = Math.floor(Date.now() / 1000) - 10;
    const added = addMember(
      w.jonas.signer,
      s0.value,
      vault.ring,
      w.annaCert,
      { role: "read", validUntil: ranOut },
      NOW + 1,
    );
    await post(w, vaultId, {
      entry: toWire(added.entry),
      wrappedKey: encodeBytes(added.wrappedKey),
    });
    expect((await ask(w, vaultId)).status).toBe(201);
    expect(await requestsOf(w, vaultId)).toEqual([annaText(w)]);
    const s1 = stateOf(w, vault.ring.vaultId, [vault.genesis, added.entry]);
    if (!s1.ok) throw new Error(s1.error);
    const renewed = changeAccess(
      w.jonas.signer,
      s1.value,
      vault.ring.vaultId,
      w.annaId,
      { role: "read", validUntil: 0 },
      NOW + 2,
    );
    expect((await post(w, vaultId, { entry: toWire(renewed) })).status).toBe(201);
    expect(await requestsOf(w, vaultId)).toEqual([]);
  });

  it("a role change that leaves her time run out does not answer her request", async () => {
    const w = await weber();
    const { vault, vaultId } = await createBuero(w);
    const s0 = stateOf(w, vault.ring.vaultId, [vault.genesis]);
    if (!s0.ok) throw new Error(s0.error);
    const ranOut = Math.floor(Date.now() / 1000) - 10;
    const added = addMember(
      w.jonas.signer,
      s0.value,
      vault.ring,
      w.annaCert,
      { role: "read", validUntil: ranOut },
      NOW + 1,
    );
    await post(w, vaultId, {
      entry: toWire(added.entry),
      wrappedKey: encodeBytes(added.wrappedKey),
    });
    expect((await ask(w, vaultId)).status).toBe(201);
    const s1 = stateOf(w, vault.ring.vaultId, [vault.genesis, added.entry]);
    if (!s1.ok) throw new Error(s1.error);
    // Jonas only changes her role in the members list; the limit (run out) stays
    const roleOnly = changeAccess(
      w.jonas.signer,
      s1.value,
      vault.ring.vaultId,
      w.annaId,
      { role: "edit", validUntil: ranOut },
      NOW + 2,
    );
    expect((await post(w, vaultId, { entry: toWire(roleOnly) })).status).toBe(201);
    expect(await requestsOf(w, vaultId)).toEqual([annaText(w)]);
  });

  it("knows no vault outside the company", async () => {
    const w = await weber();
    const unknown = encodeBytes(new Uint8Array(16).fill(9));
    expect((await ask(w, unknown)).status).toBe(404);
    expect(await requestsOf(w, unknown)).toBe(404);
    expect((await drop(w, unknown, annaText(w))).status).toBe(404);
  });
});
