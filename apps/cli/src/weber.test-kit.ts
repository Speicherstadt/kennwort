/**
 * Weber Haustechnik on a real server, set up the way the web app sets up a company (K-606 tests):
 * Jonas creates the company and the vault "Büro" and saves three entries, all through
 * packages/client, with the real Argon2id, so the CLI unlocks his account exactly as it unlocks
 * any other.
 */
import { createEntryStore, httpServerFor } from "@kennwort/client/entries/entry-store.ts";
import { createApi } from "@kennwort/client/session/api.ts";
import {
  type OpenAccount,
  type Opened,
  stateUpdater,
} from "@kennwort/client/session/open-account.ts";
import { serverFetch } from "@kennwort/client/session/server-fetch.ts";
import { loadVaults, newVault } from "@kennwort/client/vaults/vaults.ts";
import { createCompany, type EntryContent } from "@kennwort/core";

// Test data of Weber Haustechnik, not interface texts
const VAULT_NAME = "Büro"; // i18n-ignore: test data
const WLAN_TITLE = "WLAN Büro"; // i18n-ignore: test data

export const JONAS_PASSPHRASE = "Heizung-Wasser-Licht-Kupfer";
export const DATEV_PASSWORD = "Kessel-Rohr-Ventil-42";
export const WLAN_PASSWORD = "Gas-Wasser-Heizung-7";
/** RFC 6238's test key in base32, as an authenticator app shows it */
export const DATEV_TOTP = "otpauth://totp/DATEV:jonas?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

const field = (id: string, kind: EntryContent["fields"][number]["kind"], value: string) => ({
  id,
  name: "",
  value,
  kind,
});
const content = (
  type: EntryContent["type"],
  title: string,
  fields: EntryContent["fields"],
): EntryContent => ({
  type,
  title,
  fields,
  tags: [],
  favorite: false,
  history: [],
});

export const WEBER_ENTRIES: EntryContent[] = [
  content("login", "DATEV Unternehmen online", [
    field("username", "text", "jonas@weber-haustechnik.de"),
    field("password", "secret", DATEV_PASSWORD),
    field("website", "url", "https://www.datev.de"),
    field("totp", "totp", DATEV_TOTP),
  ]),
  content("wifi", WLAN_TITLE, [
    field("ssid", "text", "Weber-Buero"),
    field("password", "secret", WLAN_PASSWORD),
    field("security", "text", "WPA3"),
  ]),
  content("login", "Lexware Office", [
    field("username", "text", "anna@weber-haustechnik.de"),
    field("password", "secret", "Thermostat-Pumpe-9"),
    field("website", "url", "https://app.lexware.de"),
  ]),
];

/** Jonas's company with the vault "Büro" and its entries; gives what his recovery kit shows */
export const setUpWeber = async (server: string, setupCode: string) => {
  const api = createApi(serverFetch(server, fetch), {
    id: "jonas-web-browser-0001",
    name: "Firefox · Linux",
  });
  const company = createCompany(JONAS_PASSPHRASE);
  const { owner } = company;
  const token = await api.setup(setupCode, company.companyId, owner.upload, company.rootPublicKey);
  if (!token.ok) throw new Error(`setup failed: ${token.error}`);
  if (!(await api.uploadKeys(token.value, owner.upload, company.certificate)))
    throw new Error("keys not uploaded");
  let current: Opened | undefined = { ...owner, accountId: owner.accountId, token: token.value };
  const account: OpenAccount = {
    opened: () => current,
    updateState: stateUpdater(
      () => current,
      (value) => {
        current = value;
      },
    ),
  };
  const vault = await newVault(api, account, VAULT_NAME);
  if (!vault.ok) throw new Error(`vault not made: ${vault.error}`);
  const loaded = await loadVaults(api, account);
  if (!loaded.ok) throw new Error(`vaults not loaded: ${loaded.error}`);
  const store = createEntryStore(httpServerFor(api.syncFetch), account);
  await store.load(loaded.value.vaults, loaded.value.trust);
  for (const entry of WEBER_ENTRIES) {
    const saved = await store.save(vault.value, entry);
    if (!saved.ok) throw new Error(`entry not saved: ${saved.error}`);
  }
  return { api, token: token.value, accountId: owner.accountId, secretKey: owner.secretKey };
};
