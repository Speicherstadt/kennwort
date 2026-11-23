// Weber Haustechnik for the vault tests (K-305): Jonas with his company and Anna, certified, and
// the vault Büro; shared by the log, request and group tests of the server
import { expect } from "bun:test";
import {
  type Certificate,
  certify,
  createVault,
  encodeBytes,
  idKey,
  LogEntryWire,
  toWire,
  verifyLog,
} from "@kennwort/core";
import { ed25519KeyPair, xwingKeyPair } from "@kennwort/crypto";
import { accountKeys } from "../db/schema.ts";
import { ownerWithKeys } from "./owner-with-keys.ts";
import { invitationBody } from "./sign-in-setup.ts";

const CODE = "setup-code-of-weber-haustechnik";
const PASSPHRASE = "Heizung-Wasser-Licht-Kupfer";
/** The tests sign a little in the past: the server takes no entry signed ahead of its clock */
export const NOW = Math.floor(Date.now() / 1000) - 600;

/** Jonas with his company; Anna accepted an invitation (her keys and certificate are made up here) */
export const weber = async (more: Parameters<typeof ownerWithKeys>[4] = {}) => {
  const o = await ownerWithKeys(CODE, PASSPHRASE, true, false, more);
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
  // what PUT /api/members/:id/certificate leaves behind once Anna's keys are up
  o.setup.db
    .insert(accountKeys)
    .values({
      accountId: encodeBytes(annaId),
      xwingPublicKey: Buffer.from(annaCert.xwingPublicKey),
      edPublicKey: Buffer.from(annaCert.edPublicKey),
      keyBlock: Buffer.alloc(1),
      unlockPassphrase: Buffer.alloc(1),
      unlockRecovery: Buffer.alloc(1),
      state: Buffer.alloc(1),
      stateCounter: 0,
      certificate: JSON.stringify(toWire(annaCert)),
      updatedAt: 0,
    })
    .run();
  return { o, jonas, annaId, annaToken, annaCert, annaEd };
};
export type Listed = { id: string; name: string | null; nameEpoch: number | null };
export type Weber = Awaited<ReturnType<typeof weber>>;

export const post = (w: Weber, vaultId: string, body: unknown, token = w.o.token) =>
  w.o.setup.request(`/api/vaults/${vaultId}/log`, { token, body });

/** POST /api/vaults (K-204) and the genesis entry with Jonas's key */
export const createBuero = async (w: Weber) => {
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
export const logOf = async (w: Weber, vaultId: string, token = w.o.token) => {
  const answer = await w.o.setup.request(`/api/vaults/${vaultId}/log`, { token });
  if (answer.status !== 200) return answer.status;
  const { entries } = (await answer.json()) as { entries: unknown[] };
  return entries.map((e) => LogEntryWire.parse(e));
};
export const stateOf = (
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
