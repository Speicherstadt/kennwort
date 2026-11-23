/**
 * Unlocking with a passkey in the web app (K-707, P-03): the passkey this device set up, remembered
 * next to the account ID and Secret Key (device.ts) – its credential ID and PRF salt, neither of
 * them secret – and the three flows of packages/client/src/session/passkey-unlock.ts. The lock
 * screen offers the passkey only for the account this device knows; one the server no longer has
 * or the account state no longer names is forgotten here.
 */
import type { Call } from "@kennwort/client/session/api.ts";
import type { Opened, UpdateState } from "@kennwort/client/session/open-account.ts";
import {
  type PasskeyDevice,
  type PasskeyError,
  removePasskeyUnlock,
  setUpPasskeyUnlock,
  unlockWithPasskeyOnline,
  type WebAuthn,
} from "@kennwort/client/session/passkey-unlock.ts";
import type { StateDeps } from "@kennwort/client/session/state-sync.ts";
import { activeSalt, bytes } from "@kennwort/core";
import { createSignal } from "solid-js";
import type { DeviceAccount } from "./device.ts";
import { type AccountCopy, keepAccount, withKeptState } from "./offline-unlock.ts";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
const KEY = "kennwort-passkey";

export const readPasskeyDevice = (storage: Storage | undefined): PasskeyDevice | undefined => {
  try {
    const raw = JSON.parse(storage?.getItem(KEY) ?? "null") as Partial<PasskeyDevice> | null;
    const { accountId, credentialId, salt } = raw ?? {};
    return typeof accountId === "string" &&
      typeof credentialId === "string" &&
      typeof salt === "string"
      ? { accountId, credentialId, salt }
      : undefined;
  } catch {
    return undefined;
  }
};

const rememberPasskeyDevice = (storage: Storage | undefined, device: PasskeyDevice) => {
  try {
    storage?.setItem(KEY, JSON.stringify(device));
  } catch {
    // Not remembered: the lock screen offers only the passphrase
  }
};

export const forgetPasskeyDevice = (storage: Storage | undefined) => {
  try {
    storage?.removeItem(KEY);
  } catch {
    // Nothing remembered that could be forgotten
  }
};

/** The browser's WebAuthn; one without it fails every ceremony, which the flows report as no PRF */
export const browserWebAuthn = (): WebAuthn => ({
  create: async (options) => navigator.credentials.create(options),
  get: async (options) => navigator.credentials.get(options),
});

/** WebAuthn and the calls to the server; without them (tests, the demo) no passkey */
export type PasskeyPlatform = { call: Call; webAuthn: WebAuthn; api: StateDeps };

export type PasskeySessionDeps = {
  storage: Storage | undefined;
  copy?: AccountCopy | undefined;
  passkeys?: PasskeyPlatform | undefined;
  flows?: {
    setUp: typeof setUpPasskeyUnlock;
    remove: typeof removePasskeyUnlock;
    unlock: typeof unlockWithPasskeyOnline;
  };
};

type Parts = {
  opened: () => Opened | undefined;
  open: (value: Opened) => void;
  updateState: UpdateState;
  device: () => DeviceAccount | undefined;
};

const realFlows = {
  setUp: setUpPasskeyUnlock,
  remove: removePasskeyUnlock,
  unlock: unlockWithPasskeyOnline,
};

export const createPasskeyUnlock = (deps: PasskeySessionDeps, parts: Parts) => {
  const flows = deps.flows ?? realFlows;
  const [remembered, setRemembered] = createSignal(readPasskeyDevice(deps.storage));
  const forget = () => {
    forgetPasskeyDevice(deps.storage);
    setRemembered(undefined);
  };
  const platform = () => deps.passkeys;
  const unsupported = { ok: false as const, error: "no-prf" as PasskeyError };
  const account = { opened: parts.opened, updateState: parts.updateState };
  /** The passkey the lock screen may offer: only for the account this device knows */
  const offered = () => {
    const passkey = remembered();
    return deps.passkeys && passkey && passkey.accountId === parts.device()?.accountId
      ? passkey
      : undefined;
  };
  return {
    offered,
    /** The credential ID of the passkey this device unlocks with, if any */
    thisDevice: () => remembered()?.credentialId,
    forget,
    setUp: async () => {
      const using = platform();
      if (!using) return unsupported;
      const result = await flows.setUp(using, account);
      if (result.ok) {
        rememberPasskeyDevice(deps.storage, result.value);
        setRemembered(result.value);
      }
      return result;
    },
    remove: async (credentialId: string) => {
      const using = platform();
      if (!using) return unsupported;
      const result = await flows.remove(using, account, credentialId);
      if (result.ok && remembered()?.credentialId === credentialId) forget();
      return result;
    },
    /** Signs in and unlocks with the offered passkey, with the state this device kept merged in */
    unlock: async () => {
      const using = platform();
      const passkey = offered();
      if (!using || !passkey) return unsupported;
      const result = await flows.unlock(using, passkey);
      if (!result.ok) {
        if (result.error === "passkey-removed") forget();
        return result;
      }
      const { opened, stored } = result.value;
      const accountId = bytes(16).parse(passkey.accountId);
      const merged = { ...opened, ...(await withKeptState(deps.copy, accountId, opened)) };
      // A removal this device saw counts even if the server plays back an older state (E-07)
      if (!activeSalt(merged.state.passkeys, bytes().parse(passkey.credentialId))) {
        merged.accountKey.fill(0);
        forget();
        return { ok: false as const, error: "passkey-removed" as PasskeyError };
      }
      parts.open(merged);
      void keepAccount(deps.copy, stored, merged);
      return { ok: true as const, value: true as const };
    },
  };
};

export type PasskeyUnlock = ReturnType<typeof createPasskeyUnlock>;
