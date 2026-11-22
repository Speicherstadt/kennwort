// K-307 part f (P-07, F-14) on the wire, as in the ETH study's malicious server: the real server
// behind a fetch that lies, and the checks of packages/core that the clients run on its answers.
// Sandra, an admin, left Weber Haustechnik with a copy of the old root; Jonas replaced it.
import { afterAll, describe, expect, it } from "bun:test";
import {
  type AccountState,
  acceptRootChange,
  CompanyWire,
  certify,
  checkMembers,
  emptyState,
  encodeBytes,
  MembersWire,
  rootOf,
  type ServedRoot,
  toWire,
} from "@kennwort/core";
import { lyingFetch, type Rewrite } from "@kennwort/core/adversary";
import { comparisonCode, ed25519KeyPair, rootFingerprint, signRootChange } from "@kennwort/crypto";
import { weberWithAnna } from "../testing/recovery-setup.ts";
import { rotationOf, seconds, sendRotation } from "../testing/root-setup.ts";

const w = await weberWithAnna();
const oldRoot = w.o.company.rootPublicKey;
const rotation = await rotationOf(w);
expect(await sendRotation(w, rotation)).toBe(200);
const newRoot = rotation.change.newRootPublicKey;
// Sandra's own root, and the change she signs with her copy of the old one
const sandras = ed25519KeyPair(new Uint8Array(32).fill(0x5a));
const forkedChange = signRootChange(w.root, sandras.secretKey, w.o.company.companyId, seconds());

const server = Bun.serve({
  port: 0,
  fetch: (request) => w.o.setup.app.fetch(request, { address: "192.0.2.1" }),
});
afterAll(() => server.stop(true));
const base = `http://localhost:${server.port}`;
type Wire = Record<string, unknown>;
const get = async (path: string, rewrite: Rewrite = (_u, _m, body) => body) =>
  (
    await lyingFetch(fetch, rewrite)(`${base}${path}`, {
      headers: { authorization: `Bearer ${w.annaToken}` },
    })
  ).json();
const servedRoot = async (rewrite?: Rewrite): Promise<ServedRoot> => {
  const company = CompanyWire.parse(await get("/api/company", rewrite));
  return {
    companyId: w.o.company.companyId,
    rootPublicKey: company.rootPublicKey,
    rootChanges: company.rootChanges ?? [],
  };
};
const withChanges =
  (root: Uint8Array, changes: unknown[]): Rewrite =>
  (_u, _m, body) => ({
    ...(body as Wire),
    rootPublicKey: encodeBytes(root),
    rootChanges: changes,
  });

// Anna's device before and after she compared the code with Jonas and confirmed
const pinnedOld: AccountState = emptyState(rootFingerprint(oldRoot));
const confirmed = acceptRootChange(pinnedOld, [rotation.change]) as AccountState;

describe("the server cannot fork the root", () => {
  it("a second change from the old root is refused once the first is confirmed", async () => {
    const served = await servedRoot(withChanges(sandras.publicKey, [toWire(forkedChange)]));
    expect(rootOf(confirmed, served, seconds())).toEqual({ kind: "refused", error: "root-fork" });
  });

  it("two changes from the old root side by side are refused before either is confirmed", async () => {
    const both = [toWire(rotation.change), toWire(forkedChange)];
    for (const root of [newRoot, sandras.publicKey])
      expect(rootOf(pinnedOld, await servedRoot(withChanges(root, both)), seconds())).toEqual({
        kind: "refused",
        error: "root-fork",
      });
  });

  it("a change shown alone waits for the person, and its code is not the one Jonas shows", async () => {
    const served = await servedRoot(withChanges(sandras.publicKey, [toWire(forkedChange)]));
    const view = rootOf(pinnedOld, served, seconds());
    expect(view.kind).toBe("change");
    const shown = view.kind === "change" ? comparisonCode(view.fingerprint) : "";
    expect(shown).not.toBe(comparisonCode(rootFingerprint(newRoot)));
  });

  it("the server itself takes no second change from the old root", async () => {
    const rival = { ...rotation, change: forkedChange };
    expect(await sendRotation(w, rival)).toBe(409);
  });
});

describe("the server cannot replay the change", () => {
  it("the honest change, served again with the old root, does not bring the old root back", async () => {
    const served = await servedRoot(withChanges(oldRoot, [toWire(rotation.change)]));
    expect(rootOf(confirmed, served, seconds())).toEqual({
      kind: "refused",
      error: "root-retired",
    });
  });

  it("the change counts for no other company", async () => {
    const served = await servedRoot();
    const elsewhere = { ...served, companyId: new Uint8Array(16).fill(0xee) };
    const otherPinned = emptyState(rootFingerprint(oldRoot));
    expect(rootOf(otherPinned, elsewhere, seconds())).toEqual({
      kind: "refused",
      error: "root-mismatch",
    });
  });

  it("the server takes the same change only once", async () => {
    expect(await sendRotation(w, rotation)).toBe(409);
  });
});

describe("the server cannot keep the old root alive", () => {
  it("serving the old root to a confirmed device is refused", async () => {
    const served = await servedRoot(withChanges(oldRoot, []));
    expect(rootOf(confirmed, served, seconds())).toEqual({
      kind: "refused",
      error: "root-retired",
    });
  });

  const annaWith = async (issuedAt: number, seen: Record<string, number>) => {
    const forged = certify(w.root, { ...w.annaCert, issuedAt });
    const members = MembersWire.parse(
      await get("/api/members", (_u, _m, body) => ({
        members: (body as { members: Wire[] }).members.map((m) =>
          m.id === w.annaIdText ? { ...m, certificate: toWire(forged), previous: [] } : m,
        ),
      })),
    ).members;
    return checkMembers(newRoot, members, seen, confirmed.retiredRoots).find(
      (v) => encodeBytes(v.accountId) === w.annaIdText,
    );
  };

  it("a certificate Sandra issues with the old root after the change counts for nothing", async () => {
    expect((await annaWith(seconds() + 400, {}))?.status).toBe("invalid");
  });

  it("one she backdates loses to the newer certificate the device has seen", async () => {
    const renewed = rotation.certificates.find((c) => encodeBytes(c.accountId) === w.annaIdText);
    const newest = renewed?.issuedAt ?? 0;
    expect((await annaWith(newest - 1, { [w.annaIdText]: newest }))?.status).toBe("invalid");
  });

  it("the honest answer checks out under the new root for the confirmed device", async () => {
    const served = await servedRoot();
    expect(rootOf(confirmed, served, seconds())).toEqual({ kind: "current", root: newRoot });
    const members = MembersWire.parse(await get("/api/members")).members;
    const views = checkMembers(newRoot, members, {}, confirmed.retiredRoots);
    expect(views.map((v) => v.status)).toEqual(["certified", "certified"]);
  });
});
