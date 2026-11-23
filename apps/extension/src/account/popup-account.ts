/**
 * The account in the extension's popup (K-402): connect a server and an account, unlock with the
 * passphrase exactly as the web app does (signInAndUnlock, packages/client), lock by hand or by the
 * lock alarm. The popup is closed and opened all the time, so what is open lives in
 * chrome.storage.session, never on the disk: AK and the session token (cleared on lock) and the
 * device (server, account ID, Secret Key; kept until the browser closes). Each time the popup
 * opens, AK opens the key block and the account state anew from the server's ciphertexts, with the
 * account state this device kept merged in (unlocked-store.ts).
 */
import type { Api } from "@kennwort/client/session/api.ts";
import { type Opened, stateUpdater } from "@kennwort/client/session/open-account.ts";
import { type ServerError, serverOrigin } from "@kennwort/client/session/server-url.ts";
import { type SessionError, signInAndUnlock } from "@kennwort/client/session/unlock.ts";
import { bytes, type Derive } from "@kennwort/core";
import { parseSecretKey, randomBytes } from "@kennwort/crypto";
import { createSignal } from "solid-js";
import type { SessionArea } from "../session-keys.ts";
import type { AlarmsApi } from "./auto-lock.ts";
import { createLockTimer, MINUTE } from "./lock-timer.ts";
import type { DeviceRecord } from "./records.ts";
import { createUnlockedStore } from "./unlocked-store.ts";

export type PopupError = SessionError | ServerError | "invalid-account" | "storage-failed";
export type PopupOutcome = { ok: true } | { ok: false; error: PopupError };
export type Phase = "starting" | "connect" | "locked" | "open";

export type PopupAccountDeps = {
  area: SessionArea | undefined;
  alarms: AlarmsApi | undefined;
  /** The server's API for this device (server-api.ts: fetch against the device's server only) */
  apiFor: (device: DeviceRecord) => Api;
  now?: () => number;
  random?: (length: number) => Uint8Array;
  /** Argon2id as F-05 fixes it; only tests pass a lighter one */
  derive?: Derive;
  schedule?: (run: () => void, ms: number) => unknown;
  cancel?: (timer: unknown) => void;
  /**
   * false for the inline menu (K-403): it opens what the popup unlocked but never sets or moves the
   * lock time and never locks, so a page that focuses a login field over and over cannot keep the
   * extension unlocked, and a menu that fails to open locks nothing
   */
  movesLock?: boolean;
};

/** What the user types to connect: the server and the account as the recovery kit shows them */
export type ConnectInput = {
  server: string;
  accountId: string;
  secretKey: string;
  passphrase: string;
};

/** The device the user typed, or why it is not one */
const deviceOf = (
  input: ConnectInput,
  random: (length: number) => Uint8Array,
): { ok: true; value: DeviceRecord } | { ok: false; error: PopupError } => {
  const server = serverOrigin(input.server);
  if (!server.ok) return server;
  const accountId = bytes(16).safeParse(input.accountId.trim());
  const secretKey = parseSecretKey(input.secretKey.trim());
  if (!accountId.success || !secretKey.ok) return { ok: false, error: "invalid-account" };
  return {
    ok: true,
    value: {
      server: server.value,
      accountId: accountId.data,
      secretKey: secretKey.value,
      deviceId: random(16),
    },
  };
};

export const createPopupAccount = (deps: PopupAccountDeps) => {
  const now = deps.now ?? Date.now;
  const movesLock = deps.movesLock ?? true;
  const store = createUnlockedStore(deps.area, deps.alarms);
  const [phase, setPhase] = createSignal<Phase>("starting");
  const [device, setDeviceSignal] = createSignal<DeviceRecord>();
  const [opened, setOpenedSignal] = createSignal<Opened>();
  // Plain mirrors: Solid 2 hands back the old value until the next flush, and lock, touch and the
  // state updates must see what is open right now (as the web app's createLock)
  let current: Opened | undefined;
  let currentDevice: DeviceRecord | undefined;
  let api: Api | undefined;
  const setOpened = (value: Opened | undefined) => {
    current = value;
    setOpenedSignal(value);
  };
  const setDevice = (value: DeviceRecord | undefined) => {
    currentDevice = value;
    api = value ? deps.apiFor(value) : undefined;
    setDeviceSignal(value);
  };

  /** Locks: the keys leave the session area and the memory; the device stays */
  const lock = async () => {
    current?.accountKey.fill(0);
    setOpened(undefined);
    setPhase(currentDevice ? "locked" : "connect");
    await Promise.all([store.clearKeys(), timer.stop()]);
  };
  const timer = createLockTimer(
    {
      alarms: deps.alarms,
      now,
      schedule: deps.schedule ?? ((run, ms) => setTimeout(run, ms)),
      cancel: deps.cancel ?? ((handle) => clearTimeout(handle as number)),
    },
    () => void lock(),
  );
  const open = (value: Opened) => {
    setOpened(value);
    setPhase("open");
    // The lock time the account state remembers from the last valid policy, until it loads
    if (movesLock) timer.start(value.state.policyLock * MINUTE);
  };

  /** Signs in and unlocks this device's account with the passphrase (P-02, P-03) */
  const unlockDevice = async (record: DeviceRecord, passphrase: string): Promise<PopupOutcome> => {
    const result = await signInAndUnlock(
      deps.apiFor(record),
      record.accountId,
      passphrase,
      record.secretKey,
      deps.derive,
    );
    if (!result.ok) return result;
    const { opened: value, stored } = result.value;
    const kept = await store.keep(record, value, stored, now());
    if (!kept) {
      value.accountKey.fill(0);
      await Promise.all([store.clearKeys(), timer.stop()]);
      return { ok: false, error: "storage-failed" };
    }
    setDevice(record);
    open(kept);
    return { ok: true };
  };

  return {
    phase,
    device,
    opened,
    /** The server's API of the connected device */
    api: () => api,
    lock,
    /** Any use pushes the automatic lock back */
    touch: () => movesLock && current && timer.touch(),
    /** When the popup opens: the device and, if still unlocked, the open account */
    restore: async () => {
      const record = await store.readDevice();
      setDevice(record);
      if (!record) return void setPhase("connect");
      const reopened = await store.reopen(record, deps.apiFor(record), now());
      if (reopened) return open(reopened);
      if (movesLock) return lock();
      setPhase("locked");
    },
    connect: async (input: ConnectInput): Promise<PopupOutcome> => {
      const record = deviceOf(input, deps.random ?? randomBytes);
      return record.ok ? unlockDevice(record.value, input.passphrase) : record;
    },
    unlock: async (passphrase: string): Promise<PopupOutcome> =>
      currentDevice
        ? unlockDevice(currentDevice, passphrase)
        : { ok: false, error: "invalid-account" },
    /** Another account: locked, and the device forgotten */
    forget: async () => {
      setDevice(undefined);
      await lock();
      await store.clearDevice();
    },
    /** The company policy's lock time (K-304); it counts from now on */
    setLockAfter: (ms: number) => movesLock && current && timer.start(ms),
    lockMinutes: timer.minutes,
    // What it writes is kept for the next popup, which merges it into what the server serves
    updateState: stateUpdater(() => current, setOpened, {
      keepState: (_accountId, kept) => store.keepState(kept),
    }),
  };
};

export type PopupAccount = ReturnType<typeof createPopupAccount>;
