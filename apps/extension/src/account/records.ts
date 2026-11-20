/**
 * What the extension keeps of its account in chrome.storage.session (session-keys.ts), as named
 * bytes: the device (server, account ID, Secret Key, device ID), which stays over a lock as the web
 * app's local storage does, and the unlocked keys (AK, session token), which a lock clears. Both
 * are gone when the browser closes; nothing reaches the disk (docs/sicherheitsdesign.md, P-03).
 */
import type { Keys } from "../session-keys.ts";

export type DeviceRecord = {
  /** The origin of the company's server, e.g. https://kennwort.weber-haustechnik.test */
  server: string;
  accountId: Uint8Array;
  secretKey: Uint8Array;
  /** Names this device to the server for its device list (K-303) */
  deviceId: Uint8Array;
};

export type UnlockedRecord = { accountKey: Uint8Array; token: string };

const text = new TextEncoder();
const bytesToText = (bytes: Uint8Array | undefined) => {
  if (!bytes) return undefined;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
};
const sized = (bytes: Uint8Array | undefined, length: number) =>
  bytes?.length === length ? bytes : undefined;

export const deviceToKeys = (device: DeviceRecord): Keys => ({
  server: text.encode(device.server),
  account: device.accountId,
  secret: device.secretKey,
  device: device.deviceId,
});

/** The device as stored, or undefined for anything else (a record of an older version, damage) */
export const deviceFromKeys = (keys: Keys): DeviceRecord | undefined => {
  const server = bytesToText(keys.server);
  const accountId = sized(keys.account, 16);
  const secretKey = sized(keys.secret, 16);
  const deviceId = sized(keys.device, 16);
  if (!server || !accountId || !secretKey || !deviceId) return undefined;
  return { server, accountId, secretKey, deviceId };
};

export const unlockedToKeys = (unlocked: UnlockedRecord): Keys => ({
  "account-key": unlocked.accountKey,
  token: text.encode(unlocked.token),
});

export const unlockedFromKeys = (keys: Keys): UnlockedRecord | undefined => {
  const accountKey = sized(keys["account-key"], 32);
  const token = bytesToText(keys.token);
  return accountKey && token ? { accountKey, token } : undefined;
};
