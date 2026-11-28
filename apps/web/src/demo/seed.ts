/**
 * The demo's company (K-706): Weber Haustechnik with Jonas, Anna, Sandra and Max, its vaults and
 * logins (DESIGN.md, Testdaten), made with the same code a real owner's device runs: Jonas sets
 * up the company through the session, creates the vaults, adds the others with signed log entries
 * and writes the entries as sealed records. Everything lands in the stand-in's memory.
 *
 * Only Jonas can unlock. Anna, Sandra and Max are certified members with real key bundles, but
 * their passphrase keys are random bytes nobody knows: the demo never signs them in, and so their
 * accounts cost no Argon2id at all instead of a weakened one (F-05 stays fixed in v1).
 */

import { createEntryStore, httpServerFor } from "@kennwort/client/entries/entry-store.ts";
import { createApi } from "@kennwort/client/session/api.ts";
import { loadVaults, newVault, type Vault } from "@kennwort/client/vaults/vaults.ts";
import {
  addMember,
  bytes,
  type Certificate,
  type CompanyRole,
  certify,
  createAccount,
  type Derive,
  type EntryContent,
  emptyState,
  encodeBytes,
  toWire,
  type VaultRole,
} from "@kennwort/core";
import { randomBytes } from "@kennwort/crypto";
import { m } from "@kennwort/ui";
import data from "../demo.json";
import { createSession } from "../session/session.ts";
import { demoFetch } from "./demo-fetch.ts";
import { type DemoStore, emptyStore } from "./demo-store.ts";

/** Shown on the demo page: weak on purpose, it guards nothing but made-up data */
export const DEMO_PASSPHRASE = "weber-haustechnik";

type Person = {
  name: string;
  role: CompanyRole;
  vaults: Record<string, VaultRole>;
  unconfirmed?: boolean;
};

/** Who works where besides Jonas, who made every vault and manages it */
export const PEOPLE: readonly Person[] = [
  { name: "Anna", role: "admin", vaults: { office: "manage", accounting: "manage" } },
  { name: "Sandra", role: "member", vaults: { office: "edit", customers: "edit" } },
  { name: "Max", role: "member", vaults: { office: "read", tablets: "edit" } },
  { name: "Tim Kaya", role: "member", vaults: {} },
  { name: "Lea Hoffmann", role: "member", vaults: {}, unconfirmed: true },
];

const seconds = () => Math.floor(Date.now() / 1000);

/** Passphrase keys nobody can derive: a member the demo never signs in (see above) */
const unknowable: Derive = () => ({ unlock: randomBytes(32), login: randomBytes(32) });

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
};

/** A colleague's account and certificate (unless unconfirmed), put on the stand-in */
const enrolColleague = (
  store: DemoStore,
  person: Person,
  root: { fingerprint: Uint8Array; secretKey: Uint8Array; companyId: Uint8Array },
): { id: string; certificate: Certificate | undefined } => {
  const account = createAccount("", emptyState(root.fingerprint), { derive: unknowable });
  const { upload } = account;
  const certificate = person.unconfirmed
    ? undefined
    : certify(root.secretKey, {
        accountId: upload.accountId,
        xwingPublicKey: upload.xwingPublicKey,
        edPublicKey: upload.edPublicKey,
        companyId: root.companyId,
        role: person.role,
        issuedAt: seconds(),
      });
  const id = encodeBytes(upload.accountId);
  store.accounts.set(id, {
    id,
    role: person.role,
    name: person.name,
    accountSalt: encodeBytes(upload.accountSalt),
    loginPublicKey: encodeBytes(upload.loginPublicKey),
    recoveryPublicKey: encodeBytes(upload.recoveryLoginPublicKey),
    keys: {
      xwingPublicKey: encodeBytes(upload.xwingPublicKey),
      edPublicKey: encodeBytes(upload.edPublicKey),
      keyBlock: encodeBytes(upload.keyBlock),
      unlock: {
        passphrase: encodeBytes(upload.unlock.passphrase),
        recovery: encodeBytes(upload.unlock.recovery),
      },
      state: encodeBytes(upload.state),
      stateCounter: 0,
      certificate: certificate ? toWire(certificate) : null,
    },
  });
  return { id, certificate };
};

/** A login of demo.json as the content the editor would write */
export const contentOf = (entry: (typeof data.entries)[number]): EntryContent => ({
  type: "login",
  title: entry.title,
  fields: [
    { id: "username", name: m.field_username(), value: entry.username, kind: "text" },
    { id: "password", name: m.field_password(), value: entry.password, kind: "secret" },
    { id: "website", name: m.field_website(), value: entry.website, kind: "url" },
  ],
  tags: [],
  favorite: entry.favorite,
  history: [],
});

export type Seeded = { store: DemoStore; accountId: Uint8Array; secretKey: Uint8Array };

type SeedOptions = { derive?: Derive; passphrase?: string };

const fail = (step: string): never => {
  throw new Error(`demo seed: ${step}`); // i18n-ignore: a broken build, never shown to a user
};

export const seedDemo = async (options: SeedOptions = {}): Promise<Seeded> => {
  const store = emptyStore();
  const api = createApi(demoFetch(store));
  const session = createSession({
    api,
    storage: memoryStorage(),
    ...(options.derive ? { derive: options.derive } : {}),
  });
  const made = await session.setUp("demo", options.passphrase ?? DEMO_PASSPHRASE);
  if (!made.ok) return fail("setup");
  const owner = session.opened() ?? fail("open");
  const jonas = store.accounts.get(encodeBytes(owner.accountId));
  if (jonas) jonas.name = data.company.user;
  const root = {
    fingerprint: owner.state.rootFingerprint,
    secretKey: owner.state.rootSecretKey ?? fail("root"),
    companyId: bytes(16).parse(store.company?.id),
  };
  const colleagues = PEOPLE.map((person) => ({
    person,
    ...enrolColleague(store, person, root),
  }));

  const ids = new Map<string, string>();
  for (const vault of data.vaults) {
    const personal = vault.id === "personal";
    const name = personal ? m.vaults_personal_name() : vault.name;
    const created = await newVault(api, session, name, personal);
    if (!created.ok) return fail(`vault ${vault.id}`);
    ids.set(vault.id, created.value);
  }

  const vaultsNow = async () => {
    const loaded = await loadVaults(api, session);
    return loaded.ok ? loaded.value : fail("load");
  };
  const signer = { accountId: owner.accountId, edSecretKey: owner.keyBlock.ed.secretKey };
  for (const { person, certificate } of colleagues) {
    if (!certificate) continue;
    for (const [vaultName, role] of Object.entries(person.vaults)) {
      const vault = (await vaultsNow()).vaults.find((v: Vault) => v.idText === ids.get(vaultName));
      if (!vault) return fail(`no vault ${vaultName}`);
      const added = addMember(
        signer,
        vault.log,
        vault.ring,
        certificate,
        { role, validUntil: 0 },
        seconds(),
      );
      if ((await api.appendLog(owner.token, added.entry, added.wrappedKey)) !== "ok")
        return fail(`add ${person.name}`);
    }
  }

  // Tim Kaya has an open access request for Baustellen-Tablets
  const tim = colleagues.find((c) => c.person.name === "Tim Kaya");
  const tabletsId = ids.get("tablets");
  if (tim && tabletsId) {
    store.requests.set(tabletsId, new Map([[tim.id, { requestedAt: Date.now() - 3_600_000 }]]));
  }

  const loaded = await vaultsNow();
  const entries = createEntryStore(httpServerFor(api.syncFetch), session);
  await entries.load(loaded.vaults, loaded.trust);
  for (const entry of data.entries) {
    const saved = await entries.save(ids.get(entry.vault) ?? "", contentOf(entry));
    if (!saved.ok) return fail(`entry ${entry.id}`);
  }
  session.lock();
  return { store, accountId: made.value.accountId, secretKey: made.value.secretKey };
};
