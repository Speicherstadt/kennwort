/**
 * What this device remembers of its account: the account ID and the Secret Key (F-05), so the user
 * types only the passphrase. Neither unlocks anything alone; AK and every key opened with it stay
 * in memory only (session.ts). A storage that throws or holds nonsense counts as a new device.
 */
import { encodeBytes } from "@kennwort/core";
import { formatSecretKey, parseSecretKey } from "@kennwort/crypto";

export type DeviceAccount = { accountId: string; secretKey: Uint8Array };
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
const KEY = "kennwort-device";

export const readDevice = (storage: Storage | undefined): DeviceAccount | undefined => {
  try {
    const raw = JSON.parse(storage?.getItem(KEY) ?? "null") as {
      accountId?: unknown;
      secretKey?: unknown;
    } | null;
    if (typeof raw?.accountId !== "string" || typeof raw.secretKey !== "string") return undefined;
    const secretKey = parseSecretKey(raw.secretKey);
    return secretKey.ok ? { accountId: raw.accountId, secretKey: secretKey.value } : undefined;
  } catch {
    return undefined;
  }
};

export const rememberDevice = (
  storage: Storage | undefined,
  accountId: Uint8Array,
  secretKey: Uint8Array,
) => {
  try {
    storage?.setItem(
      KEY,
      JSON.stringify({ accountId: encodeBytes(accountId), secretKey: formatSecretKey(secretKey) }),
    );
  } catch {
    // Not remembered: the next unlock asks for the Secret Key again
  }
};

export const forgetDevice = (storage: Storage | undefined) => {
  try {
    storage?.removeItem(KEY);
  } catch {
    // Nothing remembered that could be forgotten
  }
};
