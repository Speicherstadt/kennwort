import { certify, encodeBytes, idKey, verifyLog } from "@kennwort/core";
import { ed25519KeyPair, type KeyBlock, xwingKeyPair } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import type { Row } from "../members/members.test-kit.ts";
import { accounts, annaInBuero, keyHolders, recordsOf } from "./exit.test-kit.ts";
import { createExits } from "./exit.ts";
import { catchUpRenewals, renewalEntries } from "./renewals.ts";

// K-307 part e (P-12): Anna renewed her keys; once the root certified the new bundle, Büro gets a
// rekey entry and then its rotation, with nothing marked
type World = Awaited<ReturnType<typeof annaInBuero>>;

const newBlock = (w: World): KeyBlock => ({
  xwing: xwingKeyPair(),
  ed: ed25519KeyPair(),
  rootFingerprint: w.c.opened.state.rootFingerprint,
});

/** Anna's row as the server lists it after her renewal; certified unless told otherwise */
const annaRenews = async (w: World, certified = true) => {
  const rows = (await w.members.api.members("t")) as Row[];
  const index = rows.findIndex((r) => encodeBytes(r.id) === encodeBytes(w.anna.account.accountId));
  const old = rows[index] as Row;
  const block = newBlock(w);
  const root = w.c.opened.state.rootSecretKey as Uint8Array;
  const certificate = certify(root, {
    accountId: old.id,
    xwingPublicKey: block.xwing.publicKey,
    edPublicKey: block.ed.publicKey,
    companyId: w.c.certificate.companyId,
    role: "member",
    // Later than what her old keys signed in Büro: those entries still verify
    issuedAt: Math.floor(Date.now() / 1000) + 1,
  });
  rows[index] = {
    ...old,
    xwingPublicKey: block.xwing.publicKey,
    edPublicKey: block.ed.publicKey,
    certificate: certified ? certificate : null,
    previous: old.certificate ? [old.certificate] : [],
  };
  return { block, certificate };
};

describe("catching up a member's renewed keys (P-12)", () => {
  it("signs the manager's rekey for her, then the rotation, and marks nothing", async () => {
    const w = await annaInBuero();
    const { certificate } = await annaRenews(w);
    const loaded = await w.reload();
    expect(w.vaultOf(loaded).log.superseded).toEqual([idKey(w.anna.account.accountId)]);
    const tried = new Set<string>();
    expect(await catchUpRenewals(w.deps, loaded, tried)).toBe(true);
    expect(await catchUpRenewals(w.deps, loaded, tried)).toBe(false);
    const rekeyed = await w.reload();
    const vault = w.vaultOf(rekeyed);
    expect(vault.entries.at(-1)?.action).toBe("rekey");
    expect(vault.log.superseded).toEqual([]);
    expect(vault.log.rotationDue).toBe(true);
    expect(await createExits(w.deps, w.exits).catchUp(rekeyed)).toEqual([]);
    expect(keyHolders(w, 1)).toEqual(accounts(w.c.opened.accountId, certificate.accountId));
    expect(await recordsOf(w)).toEqual([[2, 1]]);
    const content = w.store.entries().find((e) => e.idText === w.entryIdText)?.content;
    expect(content).not.toHaveProperty("toChange");
  });

  it("waits while her new bundle has no certificate: no rekey, no rotation", async () => {
    const w = await annaInBuero();
    await annaRenews(w, false);
    const loaded = await w.reload();
    expect(w.vaultOf(loaded).log.superseded).toEqual([idKey(w.anna.account.accountId)]);
    expect(w.vaultOf(loaded).log.rotationDue).toBe(true);
    expect(await createExits(w.deps, w.exits).catchUp(loaded)).toEqual([]);
    expect(keyHolders(w, 1)).toEqual([]);
    expect(await recordsOf(w)).toEqual([[1, 0]]);
  });

  it("lets her sign her own rekey only with the keys her new certificate names", async () => {
    const w = await annaInBuero();
    const { block } = await annaRenews(w);
    const loaded = await w.reload();
    const vault = w.vaultOf(loaded);
    const anna = { accountId: w.anna.account.accountId, edSecretKey: block.ed.secretKey };
    const own = renewalEntries(anna, block, vault, loaded.trust);
    expect(own.map((e) => [e.action, encodeBytes(e.signerId)])).toEqual([
      ["rekey", encodeBytes(anna.accountId)],
    ]);
    expect(verifyLog(vault.ring.vaultId, [...vault.entries, ...own], loaded.trust).ok).toBe(true);
    expect(renewalEntries(anna, newBlock(w), vault, loaded.trust)).toEqual([]);
    // Max is no manager of Büro: he signs no rekey for her
    const max = {
      accountId: w.max.account.accountId,
      edSecretKey: w.max.account.keyBlock.ed.secretKey,
    };
    expect(renewalEntries(max, w.max.account.keyBlock, vault, loaded.trust)).toEqual([]);
  });

  it("signs nothing when the pinned root confirms no renewed bundle", async () => {
    const w = await annaInBuero();
    await annaRenews(w);
    const loaded = await w.reload();
    const opened = w.c.session.opened();
    if (!opened) throw new Error("locked");
    const jonas = { accountId: opened.accountId, edSecretKey: opened.keyBlock.ed.secretKey };
    const untrusting = { ...loaded.trust, certificates: new Map() };
    expect(renewalEntries(jonas, opened.keyBlock, w.vaultOf(loaded), untrusting)).toEqual([]);
  });
});
