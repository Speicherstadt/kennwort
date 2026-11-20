/** A vault server in memory for the vault tests: it stores what it is given, checks nothing */
import { encodeBytes, type LogEntry } from "@kennwort/core";
import { jonasCompany, ownerRow, type Row, server } from "../members/members.test-kit.ts";
import type { VaultApi } from "../session/vaults-api.ts";
import type { VaultDeps } from "./vaults.ts";

type Stored = { entries: LogEntry[]; keys: Map<string, Uint8Array>; name: Uint8Array | null };

export const vaultServer = () => {
  const vaults = new Map<string, Stored>();
  const of = (vaultId: Uint8Array) => vaults.get(encodeBytes(vaultId));
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
      const wrapped = of(id)?.keys.values().next().value;
      return wrapped ? [{ epoch: 0, wrapped }] : [];
    },
    newVault: async (_t, id) => {
      if (vaults.has(encodeBytes(id))) return "taken";
      vaults.set(encodeBytes(id), { entries: [], keys: new Map(), name: null });
      return "ok";
    },
    appendLog: async (_t, entry, wrappedKey) => {
      const vault = of(entry.vaultId);
      if (!vault) return "refused";
      // the next link only, as the real server takes it
      if (entry.seq !== vault.entries.length) return "stale";
      vault.entries.push(entry);
      if (wrappedKey) vault.keys.set(encodeBytes(entry.accountId), wrappedKey);
      return "ok";
    },
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
