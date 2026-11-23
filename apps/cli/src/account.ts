/**
 * The account for one command (K-606), opened exactly as the web app and the extension open it
 * (packages/client): sign in with the sign-in key and unlock with the passphrase (P-02, P-03), check
 * every vault log under the pinned root and open its key only as the log binds it (P-05, P-06),
 * check every record against its log, entry, vault and version (P-09). The account state this
 * machine kept is merged into the served one first and kept again after every change (state-file.ts,
 * E-07, E-13). No key is kept: the server session is signed out and the account key overwritten
 * before the command ends, so no unlocked key outlives the process (docs/plan.md, Entscheidungen:
 * "CLI entsperrt je Befehl").
 */
import { type ShownEntry, shown } from "@kennwort/client/entries/entries.ts";
import { createEntryStore, httpServerFor } from "@kennwort/client/entries/entry-store.ts";
import { type Api, createApi } from "@kennwort/client/session/api.ts";
import { withKeptState } from "@kennwort/client/session/kept-state.ts";
import {
  type OpenAccount,
  type Opened,
  stateUpdater,
} from "@kennwort/client/session/open-account.ts";
import { type Send, serverFetch } from "@kennwort/client/session/server-fetch.ts";
import { type SessionError, signInAndUnlock } from "@kennwort/client/session/unlock.ts";
import { loadVaults } from "@kennwort/client/vaults/vaults.ts";
import { type Derive, encodeBytes } from "@kennwort/core";
import type { Device } from "./device-file.ts";
import type { StateKeeper } from "./state-file.ts";

export type Connection = {
  send: Send;
  /** process.platform, for the name in the device list */
  platform: string;
  /** Where the account state this machine saw is kept between commands */
  kept: StateKeeper;
  /** Argon2id as F-05 fixes it; only tests pass a lighter one */
  derive?: Derive;
};

/** What a command sees of the account: the checked entries and the names of their vaults */
export type Loaded = {
  entries: ShownEntry[];
  vaultNames: ReadonlyMap<string, string | undefined>;
  /** Vaults whose log did not check out, and records refused against their log: never shown */
  refusedVaults: number;
  refusedEntries: number;
};

export type AccountError = SessionError | "untrusted";

const SYSTEMS: Record<string, string> = { linux: "Linux", darwin: "macOS", win32: "Windows" };

/** How the CLI names itself in the device list, e.g. "CLI · Linux" */
export const cliDeviceName = (platform: string) =>
  ["CLI", SYSTEMS[platform]].filter(Boolean).join(" · "); // i18n-ignore: a device name

export const apiFor = (device: Device, connection: Connection): Api =>
  createApi(serverFetch(device.server, connection.send), {
    id: encodeBytes(device.deviceId),
    name: cliDeviceName(connection.platform),
  });

/** Signs this session out on the server; a server that does not answer lets it run out */
const signOut = async (api: Api, token: string) => {
  const devices = await api.devices(token);
  const current = devices?.find((device) => device.current);
  if (current) await api.removeDevice(token, current.id);
};

const loadEntries = async (
  api: Api,
  account: OpenAccount,
): Promise<Loaded | "untrusted" | "unreachable"> => {
  const loaded = await loadVaults(api, account);
  if (!loaded.ok) return loaded.error;
  const store = createEntryStore(httpServerFor(api.syncFetch), account);
  await store.load(loaded.value.vaults, loaded.value.trust);
  return {
    entries: store.entries().map(shown),
    vaultNames: new Map(loaded.value.vaults.map((vault) => [vault.idText, vault.name])),
    refusedVaults: loaded.value.refused.length,
    refusedEntries: store.refused().length,
  };
};

/**
 * Opens the account with the passphrase, loads and checks its entries, then locks again: signed
 * out on the server, the account key overwritten. What the command needs it gets as plain data.
 */
export const withAccount = async (
  device: Device,
  passphrase: string,
  connection: Connection,
): Promise<{ ok: true; value: Loaded } | { ok: false; error: AccountError }> => {
  const api = apiFor(device, connection);
  const unlocked = await signInAndUnlock(
    api,
    device.accountId,
    passphrase,
    device.secretKey,
    connection.derive,
  );
  if (!unlocked.ok) return unlocked;
  const { opened, stored } = unlocked.value;
  const merged = withKeptState(opened, connection.kept.read(), stored.stateCounter);
  connection.kept.keep(merged.kept);
  let current: Opened | undefined = { ...opened, state: merged.state };
  const account: OpenAccount = {
    opened: () => current,
    updateState: stateUpdater(
      () => current,
      (value) => {
        current = value;
      },
      { keepState: async (_accountId, kept) => connection.kept.keep(kept) },
    ),
  };
  try {
    const loaded = await loadEntries(api, account);
    return typeof loaded === "string" ? { ok: false, error: loaded } : { ok: true, value: loaded };
  } finally {
    await signOut(api, current?.token ?? opened.token).catch(() => undefined);
    opened.accountKey.fill(0);
    current?.accountKey.fill(0);
    current = undefined;
  }
};
