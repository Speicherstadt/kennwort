// K-307 part f (P-07): a vault log that names someone who left keeps taking entries after the root
// changed. The server runs the client's check (verifyLog) before it stores an entry; with only the
// new root it would refuse every entry of a log the departed account signed or is named in, so no
// manager could remove the departed account from the vault or rotate its key (found in review)
import { describe, expect, it } from "bun:test";
import {
  addMember,
  createVault,
  encodeBytes,
  idKey,
  removeAndRotate,
  toWire,
  verifyLog,
} from "@kennwort/core";
import { weberWithAnna } from "../testing/recovery-setup.ts";
import { rotationOf, seconds, sendRotation } from "../testing/root-setup.ts";

const post = (w: Awaited<ReturnType<typeof weberWithAnna>>, vaultId: string, body: unknown) =>
  w.o.setup.request(`/api/vaults/${vaultId}/log`, { token: w.o.token, body });

describe("a vault log after a new company root (P-07)", () => {
  it("takes the removal of an account that left before the change", async () => {
    const w = await weberWithAnna();
    const signer = { accountId: w.o.owner.accountId, edSecretKey: w.o.owner.keyBlock.ed.secretKey };
    const start = seconds() - 600;
    const vault = createVault(signer, w.o.company.certificate, start);
    const vaultId = encodeBytes(vault.ring.vaultId);
    await w.o.setup.request("/api/vaults", { token: w.o.token, body: { id: vaultId } });
    const genesis = { entry: toWire(vault.genesis), wrappedKey: encodeBytes(vault.wrappedKey) };
    expect((await post(w, vaultId, genesis)).status).toBe(201);
    const trust = {
      rootPublicKey: w.o.company.rootPublicKey,
      certificates: new Map(
        [w.o.company.certificate, w.annaCert].map((c) => [idKey(c.accountId), c]),
      ),
      now: seconds(),
    };
    const s0 = verifyLog(vault.ring.vaultId, [vault.genesis], trust);
    if (!s0.ok) throw new Error(s0.error);
    const added = addMember(
      signer,
      s0.value,
      vault.ring,
      w.annaCert,
      { role: "edit", validUntil: 0 },
      start + 1,
    );
    const addBody = { entry: toWire(added.entry), wrappedKey: encodeBytes(added.wrappedKey) };
    expect((await post(w, vaultId, addBody)).status).toBe(201);
    const s1 = verifyLog(vault.ring.vaultId, [vault.genesis, added.entry], trust);
    if (!s1.ok) throw new Error(s1.error);

    await w.o.setup.request(`/api/members/${w.annaIdText}`, { method: "DELETE", token: w.o.token });
    expect(await sendRotation(w, await rotationOf(w))).toBe(200);

    const exit = removeAndRotate(
      signer,
      s1.value,
      vault.ring.vaultId,
      w.anna.accountId,
      trust,
      seconds(),
    );
    if (!exit.ok) throw new Error(exit.error);
    const [remove] = exit.value.entries;
    expect((await post(w, vaultId, { entry: toWire(remove) })).status).toBe(201);
  });
});
