/** A vault server in memory for the vault tests: it stores what it is given, checks nothing */

import type { VaultApi } from "@kennwort/client/session/vaults-api.ts";
import type { VaultDeps } from "@kennwort/client/vaults/vaults.ts";
import { certify, encodeBytes, type LogEntry } from "@kennwort/core";
import { annaRow, jonasCompany, ownerRow, type Row, server } from "../members/members.test-kit.ts";

type Stored = {
  entries: LogEntry[];
  /** Wrapped vault keys by account, then by epoch */
  keys: Map<string, Map<number, Uint8Array>>;
  name: Uint8Array | null;
  requests: Map<string, number>;
};

/**
 * `requester`: whose account an access request comes from (the fake knows no sessions); `viewer`:
 * whose keys it hands out, by default the first account it holds keys for
 */
export const vaultServer = (
  requester: Uint8Array = new Uint8Array(16),
  viewer: () => Uint8Array | undefined = () => undefined,
) => {
  const vaults = new Map<string, Stored>();
  const of = (vaultId: Uint8Array) => vaults.get(encodeBytes(vaultId));
  const keep = (vault: Stored, accountId: Uint8Array, epoch: number, wrapped: Uint8Array) => {
    const mine = vault.keys.get(encodeBytes(accountId)) ?? new Map<number, Uint8Array>();
    vault.keys.set(encodeBytes(accountId), mine.set(epoch, wrapped));
  };
  const api: VaultApi = {
    // as the real server: only vaults whose log names a member, none still without genesis
    vaults: async () =>
      [...vaults.entries()]
        .filter(([, v]) => v.entries.length > 0)
        .map(([id, v]) => ({
          id: Buffer.from(id, "base64url") as Uint8Array,
          name: v.name,
          nameEpoch: v.name ? 0 : null,
        })),
    vaultLog: async (_t, id) => of(id)?.entries,
    vaultKeys: async (_t, id) => {
      const vault = of(id);
      const who = viewer();
      const mine = who ? vault?.keys.get(encodeBytes(who)) : vault?.keys.values().next().value;
      return [...(mine ?? new Map()).entries()].map(([epoch, wrapped]) => ({ epoch, wrapped }));
    },
    newVault: async (_t, id) => {
      if (vaults.has(encodeBytes(id))) return "taken";
      vaults.set(encodeBytes(id), {
        entries: [],
        keys: new Map(),
        name: null,
        requests: new Map(),
      });
      return "ok";
    },
    appendLog: async (_t, entry, wrappedKey, wrappedKeys) => {
      const vault = of(entry.vaultId);
      if (!vault) return "refused";
      // the next link only, as the real server takes it
      if (entry.seq !== vault.entries.length) return "stale";
      vault.entries.push(entry);
      if (wrappedKey) keep(vault, entry.accountId, entry.epoch, wrappedKey);
      for (const key of wrappedKeys ?? []) keep(vault, key.accountId, entry.epoch, key.wrapped);
      // as the real server: someone removed keeps none of the vault's keys (P-11)
      if (entry.action === "remove") vault.keys.delete(encodeBytes(entry.accountId));
      const current = entry.validUntil === 0 || entry.validUntil > Math.floor(Date.now() / 1000);
      if (entry.action === "add" || (entry.action === "role" && current))
        vault.requests.delete(encodeBytes(entry.accountId));
      return "ok";
    },
    requestAccess: async (_t, id) => {
      of(id)?.requests.set(encodeBytes(requester), 1);
      return of(id) !== undefined;
    },
    vaultRequests: async (_t, id) => {
      const vault = of(id);
      return vault
        ? [...vault.requests.entries()].map(([accountId, requestedAt]) => ({
            accountId: Buffer.from(accountId, "base64url") as Uint8Array,
            requestedAt,
            role: null,
          }))
        : undefined;
    },
    dropRequest: async (_t, id, accountId) =>
      of(id)?.requests.delete(encodeBytes(accountId)) ?? false,
    renameVault: async (_t, id, _epoch, sealed) => {
      const vault = of(id);
      if (vault) vault.name = sealed;
      return vault !== undefined;
    },
  };
  return { api, vaults };
};

/** Jonas with his company, the members list and a vault server */
export const jonasWithVaults = async (
  rows?: (c: Awaited<ReturnType<typeof jonasCompany>>) => Row[],
) => {
  const c = await jonasCompany();
  const members = server(c, rows ? rows(c) : [ownerRow(c)]);
  const store = vaultServer();
  const api: VaultDeps = { ...members.api, ...store.api };
  return { c, api, store, members };
};

/** Anna, whose keys Jonas confirmed: a certified row of the members list */
export const certifiedAnna = (c: Awaited<ReturnType<typeof jonasCompany>>): Row =>
  certifiedRow(c, annaRow(c).row);

/** A row of the members list whose keys Jonas confirmed with the company root */
export const certifiedRow = (c: Awaited<ReturnType<typeof jonasCompany>>, row: Row): Row => {
  const root = c.opened.state.rootSecretKey;
  if (!root || !row.xwingPublicKey || !row.edPublicKey) throw new Error("no root key or keys");
  const certificate = certify(root, {
    accountId: row.id,
    xwingPublicKey: row.xwingPublicKey,
    edPublicKey: row.edPublicKey,
    companyId: c.certificate.companyId,
    role: "member",
    issuedAt: 1,
  });
  return { ...row, certificate, invitation: null };
};
