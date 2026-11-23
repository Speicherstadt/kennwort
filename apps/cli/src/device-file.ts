/**
 * What this machine remembers of its account (K-606): the server, the account ID, the Secret Key
 * and a random device ID, as the web app keeps account ID and Secret Key in its local storage
 * (apps/web/src/session/device.ts). None of it unlocks anything without the passphrase (F-05); the
 * account key and every key opened with it stay in memory and are gone when the command ends.
 * The file is the owner's alone (private-file.ts): folder 0700, file 0600, and one others may read
 * is refused.
 */
import { dirname, isAbsolute, join } from "node:path";
import { serverOrigin } from "@kennwort/client/session/server-url.ts";
import { bytes, encodeBytes } from "@kennwort/core";
import { formatSecretKey, parseSecretKey } from "@kennwort/crypto";
import { readPrivate, removePrivate, writePrivate } from "./private-file.ts";

export type Device = {
  /** The origin of the company's server, https (http only for localhost) */
  server: string;
  accountId: Uint8Array;
  secretKey: Uint8Array;
  /** Names this machine to the server for its device list (K-303) */
  deviceId: Uint8Array;
};

export type DeviceFileError = "insecure-device-file" | "damaged-device-file";

const VERSION = 1;

/** $XDG_CONFIG_HOME/kennwort/device.json; a relative XDG_CONFIG_HOME is ignored (XDG spec) */
export const devicePath = (env: Record<string, string | undefined>, home: string) => {
  const configured = env.XDG_CONFIG_HOME;
  const base = configured && isAbsolute(configured) ? configured : join(home, ".config"); // i18n-ignore: a path
  return join(base, "kennwort", "device.json"); // i18n-ignore: a path
};

const serialize = (device: Device) =>
  `${JSON.stringify({
    version: VERSION,
    server: device.server,
    accountId: encodeBytes(device.accountId),
    secretKey: formatSecretKey(device.secretKey),
    deviceId: encodeBytes(device.deviceId),
  })}\n`;

const parse = (text: string): Device | undefined => {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  if (raw?.version !== VERSION || typeof raw.server !== "string") return undefined;
  const server = serverOrigin(raw.server);
  const accountId = bytes(16).safeParse(raw.accountId);
  const deviceId = bytes(16).safeParse(raw.deviceId);
  const secretKey = parseSecretKey(typeof raw.secretKey === "string" ? raw.secretKey : "");
  if (!server.ok || !accountId.success || !deviceId.success || !secretKey.ok) return undefined;
  return {
    server: server.value,
    accountId: accountId.data,
    secretKey: secretKey.value,
    deviceId: deviceId.data,
  };
};

export const readDevice = (
  path: string,
): { ok: true; value: Device | undefined } | { ok: false; error: DeviceFileError } => {
  const read = readPrivate(path);
  if (!read.ok)
    return {
      ok: false,
      error: read.error === "insecure" ? "insecure-device-file" : "damaged-device-file",
    };
  if (read.value === undefined) return { ok: true, value: undefined };
  const device = parse(read.value);
  return device ? { ok: true, value: device } : { ok: false, error: "damaged-device-file" };
};

/** Written whole or not at all; false when it could not be written */
export const writeDevice = (path: string, device: Device): boolean =>
  writePrivate(path, serialize(device));

/** Forgotten, with the account state kept beside it (state-file.ts); true also when there was none */
export const removeDevice = (path: string): boolean =>
  removePrivate(statePath(path)) && removePrivate(path);

/** Where the account state this machine saw is kept: beside the device file */
export const statePath = (devicePath: string) => join(dirname(devicePath), "state.json"); // i18n-ignore: a path
