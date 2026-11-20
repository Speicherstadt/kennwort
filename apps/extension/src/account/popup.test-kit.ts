/** Fakes for the extension's account tests: the browser's session area and alarms, in memory */
import type { Api } from "@kennwort/client/session/api.ts";
import { createCompany, type Derive, encodeBytes, loginKeyPair, type Stored } from "@kennwort/core";
import { formatSecretKey, passphraseKeysWith } from "@kennwort/crypto";
import type { SessionArea } from "../session-keys.ts";
import type { AlarmsApi } from "./auto-lock.ts";

export const fakeAlarms = () => {
  const alarms = new Map<string, number>();
  const api: AlarmsApi = {
    create: (name, info) => void alarms.set(name, info.when),
    get: async (name) => {
      const when = alarms.get(name);
      return when === undefined ? undefined : { scheduledTime: when };
    },
    clear: async (name) => alarms.delete(name),
  };
  return { api, alarms };
};

export const memoryArea = (): SessionArea & { items: Map<string, unknown> } => {
  const items = new Map<string, unknown>();
  return {
    items,
    get: async (key) => (items.has(key) ? { [key]: structuredClone(items.get(key)) } : {}),
    set: async (values) => {
      for (const [key, value] of Object.entries(values)) items.set(key, structuredClone(value));
    },
    remove: async (key) => void items.delete(key),
  };
};

/** A light Argon2id for tests, as the web app's session tests use */
export const derive = (p: string, salt: Uint8Array, key: Uint8Array, account: Uint8Array) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);
export const PASSPHRASE = "Pumpe Kessel Rohr Ventil";

/**
 * A company's server in memory for one owner: signs in only with the right sign-in key, hands out
 * the ciphertexts for a token it gave, and forgets a token on `expire` (the session ended)
 */
export const accountServer = () => {
  const company = createCompany(PASSPHRASE, { derive });
  const upload = company.owner.upload;
  const tokens = new Set<string>();
  let issued = 0;
  const api = {
    signIn: async (
      accountId: Uint8Array,
      passphrase: string,
      secretKey: Uint8Array,
      d?: Derive,
    ) => {
      if (encodeBytes(accountId) !== encodeBytes(upload.accountId))
        return { ok: false as const, error: "denied" };
      const keys = loginKeyPair(passphrase, upload.accountSalt, secretKey, accountId, d);
      if (encodeBytes(keys.publicKey) !== encodeBytes(upload.loginPublicKey))
        return { ok: false as const, error: "denied" };
      const token = `token-${++issued}`;
      tokens.add(token);
      return { ok: true as const, token };
    },
    keys: async (token: string): Promise<Stored | undefined> =>
      tokens.has(token) ? upload : undefined,
  } as unknown as Api;
  return {
    api,
    accountId: encodeBytes(upload.accountId),
    secretKey: formatSecretKey(company.owner.secretKey),
    expire: () => tokens.clear(),
  };
};
