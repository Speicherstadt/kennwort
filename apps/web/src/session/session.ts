/**
 * The unlocked account, in memory only (CLAUDE.md, P-03): created on setup, invitation or unlock,
 * dropped on lock and after a while without use. Locking overwrites the account key's bytes, so
 * nothing usable lingers once the references are gone.
 */
import type { Renewed } from "@kennwort/client/account/renewal.ts";
import type { AccountApi } from "@kennwort/client/session/api.ts";
import { type Opened, stateUpdater } from "@kennwort/client/session/open-account.ts";
import {
  LOCK_AFTER_MS,
  type Outcome,
  type SessionError,
  signInAndUnlock as signInAndUnlockOnline,
} from "@kennwort/client/session/unlock.ts";
import {
  bytes,
  createAccount,
  createCompany,
  type Derive,
  emptyState,
  encodeBytes,
  invitationMac,
  type Stored,
} from "@kennwort/core";
import { rootFingerprint } from "@kennwort/crypto";
import { createSignal } from "solid-js";
import { createCompanies } from "./companies.ts";
import { type DeviceAccount, forgetDevice, readDevice, rememberDevice } from "./device.ts";
import { createLock } from "./lock.ts";
import {
  type AccountCopy,
  keepAccount,
  keepFromServer,
  unlockFromCopy,
  withKeptState,
  withServedState,
} from "./offline-unlock.ts";
import { recoverAccount } from "./recover.ts";

export { signInError } from "@kennwort/client/session/unlock.ts";
// Shared with the extension (packages/client); named here as well for the app's own modules
export type { Opened, Outcome, SessionError };
export { LOCK_AFTER_MS };

/** What the recovery kit shows: the account ID is needed to unlock on a device that does not know it */
export type NewKeys = { accountId: Uint8Array; secretKey: Uint8Array; recoveryKey: Uint8Array };

export type SessionDeps = {
  api: AccountApi;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined;
  lockAfterMs?: number;
  schedule?: (run: () => void, ms: number) => unknown;
  /** The clock the lock time counts on; only tests pass their own */
  now?: () => number;
  /** Argon2id as F-05 fixes it; only tests pass a lighter one */
  derive?: Derive;
  /** Random bytes for a new Secret Key; only tests pass fixed ones */
  random?: (length: number) => Uint8Array;
  cancel?: (timer: unknown) => void;
  /** The device's offline copy (K-308 part b); without it the app needs the server to unlock */
  copy?: AccountCopy;
};

type Unlock = { opened: Opened; stored?: Stored };

/**
 * Signs in with the sign-in key (P-02), loads the ciphertexts and opens them (P-03), with the state
 * this device kept merged in. A server that does not answer at all leaves the offline copy.
 */
const signInAndUnlock = async (
  deps: SessionDeps,
  accountId: Uint8Array,
  passphrase: string,
  secretKey: Uint8Array,
): Promise<Outcome<Unlock>> => {
  const { api, copy, derive } = deps;
  // The same sign-in and unlock as the extension's (packages/client/src/session/unlock.ts)
  const online = await signInAndUnlockOnline(api, accountId, passphrase, secretKey, derive);
  if (!online.ok && online.error === "unreachable") {
    if (!copy) return { ok: false, error: "unexpected" };
    const opened = await unlockFromCopy(copy, accountId, passphrase, secretKey, derive);
    return opened.ok ? { ok: true, value: { opened: opened.value } } : opened;
  }
  if (!online.ok) return online;
  const { opened, stored } = online.value;
  const value = await withKeptState(copy, accountId, opened);
  return { ok: true, value: { opened: { ...opened, ...value }, stored } };
};

/** After setup or invitation: the keys uploaded, the device remembered, the account open */
const finishEnrolment = async (
  account: ReturnType<typeof createAccount>,
  token: Outcome<string> | { ok: false; error: SessionError },
  upload: (token: string) => Promise<boolean>,
  remember: (accountId: Uint8Array, secretKey: Uint8Array) => void,
  open: (value: Opened) => void,
): Promise<Outcome<NewKeys>> => {
  if (!token.ok) return token;
  if (!(await upload(token.value))) return { ok: false, error: "unexpected" };
  remember(account.accountId, account.secretKey);
  open({ ...account, accountId: account.accountId, token: token.value });
  const { accountId, secretKey, recoveryKey } = account;
  return { ok: true, value: { accountId, secretKey, recoveryKey } };
};

/** An invitee's new account and its MAC over the bundle (P-08); undefined for a malformed ID */
const invitedAccount = (
  deps: SessionDeps,
  invitationId: string,
  rootFingerprint: Uint8Array,
  secret: Uint8Array,
  passphrase: string,
) => {
  const id = bytes(16).safeParse(invitationId);
  if (!id.success) return undefined;
  const account = createAccount(
    passphrase,
    emptyState(rootFingerprint),
    deps.derive ? { derive: deps.derive } : {},
  );
  const { accountId, xwingPublicKey, edPublicKey } = account.upload;
  return {
    account,
    mac: invitationMac(secret, id.data, { accountId, xwingPublicKey, edPublicKey }),
  };
};

const reconnect = async (
  deps: SessionDeps,
  opened: () => Opened | undefined,
  setOpened: (value: Opened) => void,
): Promise<boolean> => {
  const current = opened();
  if (!current?.loginKey) return Boolean(current?.token);
  const signedIn = await deps.api.signInWithLoginKey(current.accountId, current.loginKey);
  if (!signedIn.ok && signedIn.error === "denied" && opened() === current) {
    // The passphrase changed elsewhere: trying again every half minute would lock the account on
    // the server after five denials (LOCKOUT), for every device. Offline until unlocked anew.
    const { loginKey, ...rest } = current;
    setOpened(rest);
    loginKey.fill(0);
  }
  if (!signedIn.ok) return false;
  const stored = await deps.api.keys(signedIn.token);
  // Locked or opened anew meanwhile: that account is not this one any more
  if (opened() !== current) return false;
  const { loginKey, ...rest } = current;
  const next: Opened = {
    ...rest,
    token: signedIn.token,
    state: stored ? withServedState(current, stored) : current.state,
  };
  setOpened(next);
  loginKey.fill(0);
  if (stored) await keepAccount(deps.copy, stored, next);
  return true;
};

/**
 * The account under its renewed keys (P-12), with the same session: the offline copy, whose boxes
 * the old keys open, emptied and written anew, the new Secret Key remembered on the device
 */
const openRenewed =
  (
    copy: AccountCopy | undefined,
    remember: (accountId: Uint8Array, secretKey: Uint8Array) => void,
    open: (value: Opened) => void,
  ) =>
  async ({ opened: next, stored, secretKey }: Renewed) => {
    await copy?.forget();
    remember(next.accountId, secretKey);
    open(next);
    await keepAccount(copy, stored, next);
  };

/** What the device remembers of its account (device.ts); the copy of another account goes first */
const deviceMemory = (deps: SessionDeps) => {
  const [device, setDevice] = createSignal<DeviceAccount | undefined>(readDevice(deps.storage));
  const remember = (accountId: Uint8Array, secretKey: Uint8Array) => {
    rememberDevice(deps.storage, accountId, secretKey);
    setDevice(readDevice(deps.storage));
    void deps.copy?.useAccount(encodeBytes(accountId));
  };
  return { device, setDevice, remember };
};

/**
 * Unlocks with the passphrase and the Secret Key this device remembers, or the account ID and
 * Secret Key typed on a new device; the device then remembers them
 */
const unlockWith =
  (
    deps: SessionDeps,
    device: () => DeviceAccount | undefined,
    remember: (accountId: Uint8Array, secretKey: Uint8Array) => void,
    open: (value: Opened) => void,
  ) =>
  async (
    passphrase: string,
    secretKey?: Uint8Array,
    accountIdText?: string,
  ): Promise<Outcome<true>> => {
    const known = device();
    const key = secretKey ?? known?.secretKey;
    const id = bytes(16).safeParse(accountIdText ?? known?.accountId);
    if (!key || !id.success) return { ok: false, error: "wrong-passphrase" };
    const result = await signInAndUnlock(deps, id.data, passphrase, key);
    if (!result.ok) return result;
    remember(id.data, key);
    open(result.value.opened);
    if (result.value.stored) void keepAccount(deps.copy, result.value.stored, result.value.opened);
    return { ok: true, value: true };
  };

/**
 * The lock with the home account and the further companies of the account (K-605), dropped
 * together: with every lock goes a vault on its way to another company, which holds decrypted
 * contents, and the offline copy is the home's again
 */
const accountsInMemory = (deps: SessionDeps) => {
  let reset = () => {};
  const lock = createLock(deps, () => reset());
  const updateState = stateUpdater(lock.opened, lock.setOpened, deps.copy);
  const companies = createCompanies(deps, lock, updateState);
  reset = companies.reset;
  return { ...lock, updateState, companies };
};

/** The identity provider's answer as a sign-up's: an unknown ticket is a broken invitation */
const oidcOutcome = (
  token: Awaited<ReturnType<AccountApi["enrolOidc"]>>,
): Outcome<string> | { ok: false; error: SessionError } =>
  token.ok
    ? token
    : { ok: false, error: token.error === "invalid-ticket" ? "invalid-invitation" : token.error };

export const createSession = (deps: SessionDeps) => {
  const { opened, setOpened, lock, touch, open, setLockAfter, updateState, companies } =
    accountsInMemory(deps);
  const { device, setDevice, remember } = deviceMemory(deps);
  /** Opened with a token from the server: its ciphertexts are kept for unlocking offline */
  const openAndKeep = (value: Opened) => {
    open(value);
    void keepFromServer(deps.api, deps.copy, value);
  };
  const enrolled = (
    account: ReturnType<typeof createAccount>,
    token: Outcome<string> | { ok: false; error: SessionError },
    upload: (token: string) => Promise<boolean>,
  ) => finishEnrolment(account, token, upload, remember, openAndKeep);

  return {
    opened,
    device,
    lock,
    touch,
    setLockAfter,
    /** The first owner: company, root key and account, all made on this device */
    setUp: async (code: string, passphrase: string) => {
      const company = createCompany(passphrase, deps.derive ? { derive: deps.derive } : {});
      const token = await deps.api.setup(
        code,
        company.companyId,
        company.owner.upload,
        company.rootPublicKey,
      );
      return enrolled(company.owner, token, (t) =>
        deps.api.uploadKeys(t, company.owner.upload, company.certificate),
      );
    },
    /**
     * An invited member; root fingerprint and invitation secret come from the link's fragment,
     * never from the server. The MAC binds the new bundle to the secret, so the inviting admin's
     * client certifies this bundle and no other (P-08)
     */
    accept: async (
      invitationId: string,
      inviteToken: string,
      rootFingerprint: Uint8Array,
      secret: Uint8Array,
      passphrase: string,
    ) => {
      const invited = invitedAccount(deps, invitationId, rootFingerprint, secret, passphrase);
      if (!invited) return { ok: false as const, error: "invalid-invitation" as const };
      const { account, mac } = invited;
      const token = await deps.api.accept(invitationId, inviteToken, account.upload);
      return enrolled(account, token, (t) =>
        deps.api.uploadKeys(t, account.upload, undefined, mac),
      );
    },
    /**
     * Someone the identity provider signed in, without an account yet (K-604, P-25): the account
     * is made here like an invitee's, under the root the ticket named, pinned on first use; an
     * owner or admin compares the codes of both before certifying the new bundle (P-07)
     */
    enrolOidc: async (ticket: string, rootPublicKey: Uint8Array, passphrase: string) => {
      const account = createAccount(
        passphrase,
        emptyState(rootFingerprint(rootPublicKey)),
        deps.derive ? { derive: deps.derive } : {},
      );
      const token = oidcOutcome(await deps.api.enrolOidc(ticket, account.upload));
      return enrolled(account, token, (t) => deps.api.uploadKeys(t, account.upload));
    },
    unlock: unlockWith(deps, device, remember, open),
    /** The passphrase is forgotten: the Recovery Key opens the account and is renewed (recover.ts) */
    recover: async (
      recoveryKey: Uint8Array,
      passphrase: string,
      accountIdText?: string,
    ): Promise<Outcome<NewKeys>> => {
      const result = await recoverAccount(deps, device(), recoveryKey, passphrase, accountIdText);
      if (!result.ok) return result;
      const { keys, opened: served } = result.value;
      remember(keys.accountId, keys.secretKey);
      // The server's state, like at every unlock, with what this device kept merged in (E-07)
      openAndKeep({ ...served, ...(await withKeptState(deps.copy, keys.accountId, served)) });
      return { ok: true, value: keys };
    },
    renewed: openRenewed(deps.copy, remember, open),
    /** A device joined by pairing (P-04): remember it and open the account it was given */
    adopt: (value: Opened, secretKey: Uint8Array) => {
      remember(value.accountId, secretKey);
      openAndKeep(value);
    },
    /**
     * Opened from the offline copy: signs in with the kept sign-in key once the server answers and
     * merges its account state in. True once the account has a token; false while it has none.
     */
    reconnect: () => reconnect(deps, opened, setOpened),
    /** Changes the account state and writes it back merged with the server's (state-sync.ts) */
    updateState,
    /** Several companies in one account (K-605): the home's, the further ones and the switch */
    companies,
    /**
     * This device signed out (K-303, device list): locked, it no longer knows the account, and its
     * offline copy is gone (K-308 part b)
     */
    forget: () => {
      lock();
      forgetDevice(deps.storage);
      setDevice(undefined);
      void deps.copy?.forget();
    },
    accountIdText: () => {
      const value = opened();
      return value ? encodeBytes(value.accountId) : device()?.accountId;
    },
  };
};

export type Session = ReturnType<typeof createSession>;
