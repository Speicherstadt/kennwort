// K-307 part c (P-13) on the wire: the real server behind a fetch that lies, and the checks of
// packages/core that the clients run on what it answers
import { afterAll, describe, expect, it } from "bun:test";
import {
  approveRecovery,
  bytes,
  CompanyWire,
  depositFor,
  encodeBytes,
  newCompanyRecoveryKey,
  openRecoveryPackage,
  RecoveryBundleWire,
  sealRecoveryPackage,
} from "@kennwort/core";
import { lyingFetch, type Rewrite } from "@kennwort/core/adversary";
import { depositAccountKey, xwingKeyPair } from "@kennwort/crypto";
import { annaDeposits, makeRecoveryKey, weberWithAnna } from "../testing/recovery-setup.ts";

const w = await weberWithAnna();
const { key, policy } = await makeRecoveryKey(w);
await annaDeposits(w, policy, key.publicKey);
const server = Bun.serve({
  port: 0,
  fetch: (request) => w.o.setup.app.fetch(request, { address: "192.0.2.1" }),
});
afterAll(() => server.stop(true));
const base = `http://localhost:${server.port}`;
const get = async (path: string, token: string, rewrite: Rewrite) =>
  (
    await lyingFetch(fetch, rewrite)(`${base}${path}`, {
      headers: { authorization: `Bearer ${token}` },
    })
  ).json();
type Wire = Record<string, unknown>;

describe("company recovery attacks over HTTP", () => {
  it("a recovery key the server swaps into the company gets no deposit", async () => {
    const swapped = newCompanyRecoveryKey();
    const company = CompanyWire.parse(
      await get("/api/company", w.annaToken, (_url, _method, body) => ({
        ...(body as Wire),
        recoveryPublicKey: encodeBytes(swapped.publicKey),
      })),
    );
    expect(company.policy).toEqual(policy);
    const decided = depositFor(policy, company.recoveryPublicKey, undefined, w.anna);
    expect(decided).toEqual({ kind: "other-key" });
  });

  it("an old deposit the server replays after the key changed fails the owner's check", async () => {
    const place = { companyId: w.o.company.companyId, accountId: w.anna.accountId };
    const earlier = newCompanyRecoveryKey();
    const old = depositAccountKey(earlier, w.anna.accountKey, place, w.anna.keyBlock.ed.secretKey);
    const bundle = RecoveryBundleWire.parse(
      await get(`/api/members/${w.annaIdText}/recovery`, w.o.token, (_u, _m, body) => ({
        ...(body as Wire),
        deposit: {
          pkg: encodeBytes(old.pkg),
          commitment: encodeBytes(old.commitment),
          signature: encodeBytes(old.signature),
        },
      })),
    );
    const device = xwingKeyPair();
    const approved = approveRecovery({
      recoveryKey: key,
      bundle,
      certificate: w.annaCert,
      rootFingerprint: w.o.owner.state.rootFingerprint,
      device: { publicKey: device.publicKey, pairingSecret: new Uint8Array(32).fill(1) },
    });
    expect(approved).toEqual({ ok: false, error: "not-signed" });
  });

  it("an AK the server wraps to the new device itself is refused", async () => {
    const device = xwingKeyPair();
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const announced = (await (
      await fetch(`${base}/auth/pairings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicKey: encodeBytes(device.publicKey) }),
      })
    ).json()) as { id: string; pollToken: string };
    // The server knows the one-time key but not the secret in the QR code
    const forged = sealRecoveryPackage(device.publicKey, new Uint8Array(32).fill(9), {
      accountKey: crypto.getRandomValues(new Uint8Array(32)),
      accountId: w.anna.accountId,
      stateHash: new Uint8Array(32),
    });
    const lying = lyingFetch(fetch, () => ({ state: "package", package: encodeBytes(forged) }));
    const answer = (await (
      await lying(`${base}/auth/pairings/${announced.id}/poll`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pollToken: announced.pollToken }),
      })
    ).json()) as { package: string };
    const pkg = bytes().parse(answer.package);
    expect(openRecoveryPackage(device, secret, pkg)).toEqual({ ok: false, error: "not-authentic" });
  });
});
