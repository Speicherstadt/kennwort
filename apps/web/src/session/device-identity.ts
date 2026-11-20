/**
 * How this device names itself to the server (K-303, device list): a random ID made once and kept,
 * and a short name from the browser, e.g. "Firefox · Linux". Neither is secret; the ID lets the
 * server keep one session per device. A storage that throws gives a fresh ID each time.
 */
import { encodeBytes } from "@kennwort/core";
import { randomBytes } from "@kennwort/crypto";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
const KEY = "kennwort-device-id";
const ID = /^[A-Za-z0-9_-]{22}$/;

export type DeviceIdentity = { id: string; name: string };

export const deviceId = (
  storage: Storage | undefined,
  random: (length: number) => Uint8Array = randomBytes,
) => {
  try {
    const kept = storage?.getItem(KEY);
    if (kept && ID.test(kept)) return kept;
    const made = encodeBytes(random(16));
    storage?.setItem(KEY, made);
    return made;
  } catch {
    return encodeBytes(random(16));
  }
};

// In this order: Edge and Opera also say Chrome, Chrome also says Safari, Android also says Linux
const BROWSERS = [
  ["Edg/", "Edge"],
  ["OPR/", "Opera"],
  ["Firefox/", "Firefox"],
  ["Chrome/", "Chrome"],
  ["Safari/", "Safari"],
] as const;
const SYSTEMS = [
  ["iPhone", "iPhone"],
  ["iPad", "iPad"],
  ["Android", "Android"],
  ["Mac OS X", "macOS"],
  ["Windows", "Windows"],
  ["CrOS", "ChromeOS"],
  ["Linux", "Linux"],
] as const;

/** "Browser · System" from a user agent; what it does not recognise it leaves out */
export const deviceName = (userAgent: string) => {
  const browser = BROWSERS.find(([mark]) => userAgent.includes(mark))?.[1];
  const system = SYSTEMS.find(([mark]) => userAgent.includes(mark))?.[1];
  return [browser, system].filter(Boolean).join(" · ") || "Browser";
};

export const deviceIdentity = (
  storage: Storage | undefined,
  userAgent: string,
): DeviceIdentity => ({
  id: deviceId(storage),
  name: deviceName(userAgent),
});
