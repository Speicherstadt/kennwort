// K-305 part 1 (P-05, P-06): Jonas creates a vault and adds Anna; the server keeps log and keys
import { describe, expect, it } from "bun:test";
import {
  addMember,
  type Certificate,
  certify,
  changeAccess,
  createVault,
  encodeBytes,
  idKey,
  LogEntryWire,
  removeMember,
  toWire,
  verifyLog,
} from "@kennwort/core";
import { ed25519KeyPair, xwingKeyPair } from "@kennwort/crypto";
import { ownerWithKeys } from "../testing/owner-with-keys.ts";
import { invitationBody } from "../testing/sign-in-setup.ts";

const CODE = "setup-code-of-weber-haustechnik";
const PASSPHRASE = "Heizung-Wasser-Licht-Kupfer";
const NOW = 1_800_000_000;

/** Jonas with his company; Anna accepted an invitation (her keys and certificate are made up here) */
const weber = async () => {
  const o = await ownerWithKeys(CODE, PASSPHRASE);
  const made = await o.setup.request("/api/invitations", {
    token: o.token,
    body: invitationBody("Anna"),
  });
  const { id, token } = (await made.json()) as { id: string; token: string };
  const annaId = new Uint8Array(16).fill(0x20);
  const accepted = await o.setup.request(`/auth/invitations/${id}/accept`, {
    body: {
      token,
      accountId: encodeBytes(annaId),
      loginPublicKey: encodeBytes(new Uint8Array(32).fill(1)),
      accountSalt: encodeBytes(new Uint8Array(16)),
    },
  });
  const annaToken = ((await accepted.json()) as { token: string }).token;
  const jonas = {
    signer: { accountId: o.owner.accountId, edSecretKey: o.owner.keyBlock.ed.secretKey },
    certificate: o.company.certificate,
  };
  const annaEd = ed25519KeyPair(new Uint8Array(32).fill(7));
  const rootSecretKey = o.owner.state.rootSecretKey;
  if (!rootSecretKey) throw new Error("the owner holds the root key");
  const annaCert: Certificate = certify(rootSecretKey, {
    ...o.company.certificate,
    accountId: annaId,
    xwingPublicKey: xwingKeyPair(new Uint8Array(32).fill(8)).publicKey,
    edPublicKey: annaEd.publicKey,
    role: "member",
  });
  return { o, jonas, annaId, annaToken, annaCert, annaEd };
};
type Weber = Awaited<ReturnType<typeof weber>>;

const post = (w: Weber, vaultId: string, body: unknown, token = w.o.token) =>
  w.o.setup.request(`/api/vaults/${vaultId}/log`, { token, body });

/** POST /api/vaults (K-204) and the genesis entry with Jonas's key */
const createBuero = async (w: Weber) => {
  const vault = createVault(w.jonas.signer, w.jonas.certificate, NOW);
  const vaultId = encodeBytes(vault.ring.vaultId);
  await w.o.setup.request("/api/vaults", { token: w.o.token, body: { id: vaultId } });
  const answer = await post(w, vaultId, {
    entry: toWire(vault.genesis),
    wrappedKey: encodeBytes(vault.wrappedKey),
  });
  expect(answer.status).toBe(201);
  return { vault, vaultId };
};
const logOf = async (w: Weber, vaultId: string, token = w.o.token) => {
  const answer = await w.o.setup.request(`/api/vaults/${vaultId}/log`, { token });
  if (answer.status !== 200) return answer.status;
  const { entries } = (await answer.json()) as { entries: unknown[] };
  return entries.map((e) => LogEntryWire.parse(e));
};
const stateOf = (
  w: Weber,
  vaultId: Uint8Array,
  entries: ReturnType<typeof LogEntryWire.parse>[],
) => {
  const trust = {
    rootPublicKey: w.o.company.rootPublicKey,
    certificates: new Map([
      [idKey(w.jonas.certificate.accountId), w.jonas.certificate],
      [idKey(w.annaId), w.annaCert],
    ]),
    now: NOW + 100,
  };
  return verifyLog(vaultId, entries, trust);
};

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
      vaults: string[];
    };
    expect(mine.vaults).toEqual([vaultId]);
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
    ).json()) as { vaults: string[] };
    expect(annaVaults.vaults).toEqual([vaultId]);
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
    ).json()) as { vaults: string[] };
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
