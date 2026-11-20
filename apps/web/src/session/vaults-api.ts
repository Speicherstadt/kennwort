/** Vaults on the server (K-305, P-05, P-06): it keeps log, wrapped keys and names; vaults.ts checks */
import {
  encodeBytes,
  VaultKeysWire as Keys,
  VaultListWire as Listed,
  VaultLogWire as Log,
  type LogEntry,
  VaultRequestsWire as Requests,
  toWire,
} from "@kennwort/core";
import type { Call } from "./api.ts";

type Schema<T> = { safeParse: (value: unknown) => { success: true; data: T } | { success: false } };
export type ListedVault = ReturnType<typeof Listed.parse>["vaults"][number];
export type Appended = "ok" | "stale" | "refused" | "unreachable";

const parsed = <T>(schema: Schema<T>, answer: { status: number; json: unknown }) => {
  const result = schema.safeParse(answer.json);
  return answer.status === 200 && result.success ? result.data : undefined;
};

export const vaultCalls = (call: Call) => ({
  vaults: async (token: string) =>
    parsed(Listed, await call("GET", "/api/vaults", undefined, token))?.vaults,
  vaultLog: async (token: string, vaultId: Uint8Array) =>
    parsed(Log, await call("GET", `/api/vaults/${encodeBytes(vaultId)}/log`, undefined, token))
      ?.entries,
  vaultKeys: async (token: string, vaultId: Uint8Array) =>
    parsed(Keys, await call("GET", `/api/vaults/${encodeBytes(vaultId)}/keys`, undefined, token))
      ?.keys,
  /** The vault's ID on the server, before its genesis entry (K-204); "taken" if it is there */
  newVault: async (token: string, vaultId: Uint8Array): Promise<"ok" | "taken" | "failed"> => {
    const answer = await call("POST", "/api/vaults", { id: encodeBytes(vaultId) }, token);
    return answer.status === 201 ? "ok" : answer.status === 409 ? "taken" : "failed";
  },
  appendLog: async (token: string, entry: LogEntry, wrappedKey?: Uint8Array): Promise<Appended> => {
    const body = {
      entry: toWire(entry),
      ...(wrappedKey ? { wrappedKey: encodeBytes(wrappedKey) } : {}),
    };
    const answer = await call("POST", `/api/vaults/${encodeBytes(entry.vaultId)}/log`, body, token);
    if (answer.status === 201) return "ok";
    if (answer.status === 409) return "stale";
    return answer.status === 0 ? "unreachable" : "refused";
  },
  renameVault: async (token: string, vaultId: Uint8Array, epoch: number, sealed: Uint8Array) =>
    (
      await call(
        "PUT",
        `/api/vaults/${encodeBytes(vaultId)}/name`,
        { epoch, name: encodeBytes(sealed) },
        token,
      )
    ).status === 200,
});

/** Access requests (K-305 part 4): the server keeps them, only a manager's add gives access */
export const requestCalls = (call: Call) => ({
  requestAccess: async (token: string, vaultId: Uint8Array) =>
    (await call("POST", `/api/vaults/${encodeBytes(vaultId)}/requests`, {}, token)).status === 201,
  vaultRequests: async (token: string, vaultId: Uint8Array) =>
    parsed(
      Requests,
      await call("GET", `/api/vaults/${encodeBytes(vaultId)}/requests`, undefined, token),
    )?.requests,
  dropRequest: async (token: string, vaultId: Uint8Array, accountId: Uint8Array) =>
    (
      await call(
        "DELETE",
        `/api/vaults/${encodeBytes(vaultId)}/requests/${encodeBytes(accountId)}`,
        undefined,
        token,
      )
    ).status === 200,
});

export type VaultApi = ReturnType<typeof vaultCalls> & ReturnType<typeof requestCalls>;
