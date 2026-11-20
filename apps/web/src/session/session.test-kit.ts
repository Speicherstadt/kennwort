/** What the session tests share: a server in memory, storage in memory, a light Argon2id */

import type { AccountApi as Api } from "@kennwort/client/session/api.ts";
import {
  type AccountUpload,
  encodeBytes,
  loginKeyPair,
  recoveryLoginKeyPair,
  type Stored,
} from "@kennwort/core";
import { ed25519KeyPair, passphraseKeysWith } from "@kennwort/crypto";

export const derive = (p: string, salt: Uint8Array, key: Uint8Array, account: Uint8Array) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);
export const PASSPHRASE = "Heizung Wasser Licht Kupfer";

/** A server in memory: stores the upload, signs in only with the right sign-in key */
export const fakeApi = (overrides: Partial<Api> = {}) => {
  const accounts = new Map<string, AccountUpload>();
  const api: Api = {
    setup: async (code, _companyId, upload) => {
      if (code !== "richtiger-code") return { ok: false, error: "wrong-code" };
      accounts.set(encodeBytes(upload.accountId), upload);
      return { ok: true, value: "token-1" };
    },
    accept: async (_id, token, upload) => {
      if (token !== "einladung") return { ok: false, error: "invalid-invitation" };
      accounts.set(encodeBytes(upload.accountId), upload);
      return { ok: true, value: "token-2" };
    },
    uploadKeys: async () => true,
    keys: async (token): Promise<Stored | undefined> => {
      const upload = [...accounts.values()].find((_, i) => token === `signed-in-${i}`);
      return upload;
    },
    signIn: async (accountId, passphrase, secretKey, d) => {
      const upload = accounts.get(encodeBytes(accountId));
      if (!upload) return { ok: false, error: "denied" };
      const keys = loginKeyPair(passphrase, upload.accountSalt, secretKey, accountId, d);
      const ok = encodeBytes(keys.publicKey) === encodeBytes(upload.loginPublicKey);
      const index = [...accounts.keys()].indexOf(encodeBytes(accountId));
      return ok ? { ok: true, token: `signed-in-${index}` } : { ok: false, error: "denied" };
    },
    signInWithRecovery: async (accountId, recoveryKey) => {
      const upload = accounts.get(encodeBytes(accountId));
      if (!upload) return { ok: false, error: "denied" };
      const { publicKey } = recoveryLoginKeyPair(recoveryKey, accountId);
      const ok = encodeBytes(publicKey) === encodeBytes(upload.recoveryLoginPublicKey);
      const index = [...accounts.keys()].indexOf(encodeBytes(accountId));
      return ok ? { ok: true, token: `signed-in-${index}` } : { ok: false, error: "denied" };
    },
    /** The sign-in key a device kept after it unlocked from its offline copy (K-308 part b) */
    signInWithLoginKey: async (accountId, loginKey) => {
      const upload = accounts.get(encodeBytes(accountId));
      if (!upload) return { ok: false, error: "denied" };
      const ok =
        encodeBytes(ed25519KeyPair(loginKey).publicKey) === encodeBytes(upload.loginPublicKey);
      const index = [...accounts.keys()].indexOf(encodeBytes(accountId));
      return ok ? { ok: true, token: `signed-in-${index}` } : { ok: false, error: "denied" };
    },
    replaceUnlock: async (token, update) => {
      const [id, upload] = [...accounts.entries()].find((_, i) => token === `signed-in-${i}`) ?? [];
      if (!id || !upload) return false;
      accounts.set(id, { ...upload, ...update });
      return true;
    },
    ...overrides,
  };
  return api;
};

export const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
};
