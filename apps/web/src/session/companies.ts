/**
 * Several companies in one account (K-605, docs/sicherheitsdesign.md P-27). Each company has its
 * own account on the server, with its own keys, root and logs; the home account, the one unlocked
 * with the passphrase, keeps the way into each further one in its sealed account state
 * (packages/core/src/account/linked.ts). Joining or setting up a further company makes its account
 * here like any other (P-01, P-08), with a passphrase the device makes up and never shows; switching
 * signs in to that account and opens it next to the home, which stays open in memory until the
 * lock. The server keeps the accounts apart as any two; nothing of one reaches the other.
 */
import type { ImportWrite } from "@kennwort/client/entries/entry-import.ts";
import type { AccountApi } from "@kennwort/client/session/api.ts";
import type { Opened, UpdateState } from "@kennwort/client/session/open-account.ts";
import type { StateDeps } from "@kennwort/client/session/state-sync.ts";
import {
  type Outcome,
  type SessionError,
  signInAndUnlock,
} from "@kennwort/client/session/unlock.ts";
import {
  activeLinks,
  bytes,
  createAccount,
  createCompany,
  type Derive,
  emptyState,
  encodeBytes,
  invitationMac,
  linkCompany,
  newLinkPassphrase,
  unlinkCompany,
} from "@kennwort/core";
import { createSignal } from "solid-js";

export type CompaniesDeps = {
  api: AccountApi;
  derive?: Derive | undefined;
  now?: (() => number) | undefined;
  /** The home's offline copy: it keeps nothing while another company is on screen */
  copy?: { suspend: (on: boolean) => void } | undefined;
};

/** What the lock offers this module (lock.ts) */
export type CompaniesLock = {
  opened: () => Opened | undefined;
  home: () => Opened | undefined;
  switchTo: (value: Opened) => void;
};

/** One company of the account as the switcher shows it; the home has no name of its own */
export type Company = { accountId: string; name: string | undefined; home: boolean };

/** An invitation as its link carries it (P-08): the ID in the path, the rest in the fragment */
export type Invitation = {
  id: string;
  token: string;
  rootFingerprint: Uint8Array;
  secret: Uint8Array;
};

export type LinkError = SessionError | "not-home" | "name";

const ownId = (value: Opened | undefined) => (value ? encodeBytes(value.accountId) : undefined);

/** A further company's account made, linked first and created on the server after */
const linkFirst = async (
  update: UpdateState,
  stateApi: StateDeps,
  link: { accountId: Uint8Array; secretKey: Uint8Array; passphrase: string; name: string },
  create: () => Promise<Outcome<true>>,
  now: () => number,
): Promise<Outcome<string> | { ok: false; error: LinkError }> => {
  const { accountId, secretKey, passphrase, name } = link;
  // The way in is kept before the account exists: an account the home could not reach again would
  // be lost for good, a link to an account that never came is only removed again
  const saved = await update(stateApi, (state) => {
    const linked = linkCompany(state.linked, accountId, name, { secretKey, passphrase }, now());
    return linked ? { ...state, linked } : undefined;
  });
  if (!saved.ok) return { ok: false, error: saved.error === "refused" ? "name" : "unexpected" };
  const created = await create();
  const id = encodeBytes(accountId);
  if (!created.ok) {
    await update(stateApi, (state) => {
      const linked = unlinkCompany(state.linked, id);
      return linked ? { ...state, linked } : undefined;
    });
    return created;
  }
  return { ok: true, value: id };
};

/**
 * A vault on its way to another company of the account (K-605, Übergabe): its name and the
 * entries' contents, decrypted, in memory only until the target company wrote them or the lock
 */
export type Handover = {
  target: string;
  vaultName: string;
  writes: ImportWrite[];
};

/** Signs in to another company of the account and puts it on screen; the home needs no sign-in */
const switcher =
  (deps: CompaniesDeps, lock: CompaniesLock) =>
  async (accountId: string): Promise<Outcome<true>> => {
    const home = lock.home();
    if (!home) return { ok: false, error: "unexpected" };
    if (ownId(home) === accountId) {
      deps.copy?.suspend(false);
      lock.switchTo(home);
      return { ok: true, value: true };
    }
    const link = activeLinks(home.state.linked).find((l) => l.accountId === accountId);
    const id = bytes(16).safeParse(accountId);
    if (!link || !id.success) return { ok: false, error: "unexpected" };
    const opened = await signInAndUnlock(
      deps.api,
      id.data,
      link.passphrase,
      link.secretKey,
      deps.derive,
    );
    // Locked meanwhile: the account just opened goes nowhere and is wiped
    if (!opened.ok || lock.home() === undefined) {
      if (opened.ok) opened.value.opened.accountKey.fill(0);
      return opened.ok ? { ok: false, error: "unexpected" } : opened;
    }
    // Before it is on screen: its first reads must not go into the home's copy
    deps.copy?.suspend(true);
    lock.switchTo(opened.value.opened);
    return { ok: true, value: true };
  };

const keysUploaded = (uploaded: boolean): Outcome<true> =>
  uploaded ? { ok: true, value: true } : { ok: false, error: "unexpected" };

/** Joining and setting up further companies, only from the home account */
const linkers = (deps: CompaniesDeps, update: UpdateState, atHome: () => Opened | undefined) => {
  const now = deps.now ?? Date.now;
  const options = deps.derive ? { derive: deps.derive } : {};
  const notHome = { ok: false as const, error: "not-home" as const };
  return {
    /**
     * Joins a further company with an invitation (P-08): the new account pins the root the link
     * names, and the MAC binds its bundle to the link's secret, so the inviting admin certifies
     * this bundle and no other, exactly as for a new person
     */
    join: async (stateApi: StateDeps, name: string, invitation: Invitation) => {
      if (!atHome()) return notHome;
      const id = bytes(16).safeParse(invitation.id);
      if (!id.success) return { ok: false as const, error: "invalid-invitation" as const };
      const passphrase = newLinkPassphrase();
      const account = createAccount(passphrase, emptyState(invitation.rootFingerprint), options);
      const { accountId, xwingPublicKey, edPublicKey } = account.upload;
      const mac = invitationMac(invitation.secret, id.data, {
        accountId,
        xwingPublicKey,
        edPublicKey,
      });
      const create = async (): Promise<Outcome<true>> => {
        const token = await deps.api.accept(invitation.id, invitation.token, account.upload);
        if (!token.ok) return token;
        return keysUploaded(await deps.api.uploadKeys(token.value, account.upload, undefined, mac));
      };
      const link = { accountId, secretKey: account.secretKey, passphrase, name };
      return linkFirst(update, stateApi, link, create, now);
    },
    /** Sets up a further company with the operator's setup code: its owner is this account */
    setUp: async (stateApi: StateDeps, name: string, code: string) => {
      if (!atHome()) return notHome;
      const passphrase = newLinkPassphrase();
      const company = createCompany(passphrase, options);
      const { owner, companyId, rootPublicKey, certificate } = company;
      const create = async (): Promise<Outcome<true>> => {
        const token = await deps.api.setup(code, companyId, owner.upload, rootPublicKey);
        if (!token.ok) return token;
        return keysUploaded(await deps.api.uploadKeys(token.value, owner.upload, certificate));
      };
      const link = { accountId: owner.accountId, secretKey: owner.secretKey, passphrase, name };
      return linkFirst(update, stateApi, link, create, now);
    },
  };
};

export const createCompanies = (deps: CompaniesDeps, lock: CompaniesLock, update: UpdateState) => {
  const [handover, setHandover] = createSignal<Handover>();
  /** Linking and removing only from the home account: only its state holds the ways in */
  const atHome = () => {
    const home = lock.home();
    return home && ownId(home) === ownId(lock.opened()) ? home : undefined;
  };
  const companies = (): Company[] => {
    const home = lock.home();
    if (!home) return [];
    return [
      { accountId: encodeBytes(home.accountId), name: undefined, home: true },
      ...activeLinks(home.state.linked).map((link) => ({
        accountId: link.accountId,
        name: link.name,
        home: false,
      })),
    ];
  };
  return {
    companies,
    /** The vault on its way to another company, if one is */
    handover,
    startHandover: (value: Handover) => setHandover(value),
    /** Done, given up or locked: the decrypted contents are dropped */
    endHandover: () => setHandover(undefined),
    /** After the lock: no vault on its way, and the copy is the home's again */
    reset: () => {
      setHandover(undefined);
      deps.copy?.suspend(false);
    },
    /** The account ID of the company on screen */
    activeId: () => ownId(lock.opened()),
    /** Whether the company on screen is the home's */
    atHome: () => atHome() !== undefined,
    switchTo: switcher(deps, lock),
    ...linkers(deps, update, atHome),
    /**
     * Removes a company from the account: the way in is gone from the home's state, a tombstone
     * keeps another device from bringing it back. The company's account itself stays; its owner
     * removes it from the company (P-11)
     */
    unlink: async (stateApi: StateDeps, accountId: string) => {
      if (!atHome()) return false;
      const saved = await update(stateApi, (state) => {
        const linked = unlinkCompany(state.linked, accountId);
        return linked ? { ...state, linked } : undefined;
      });
      return saved.ok;
    },
  };
};

export type Companies = ReturnType<typeof createCompanies>;
