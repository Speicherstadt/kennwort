/**
 * The unlocked account, in memory only (CLAUDE.md, P-03): created on setup, invitation or unlock,
 * dropped on lock and after a while without use. Locking overwrites the account key's bytes, so
 * nothing usable lingers once the references are gone.
 */
import {
  type AccountState,
  bytes,
  createAccount,
  createCompany,
  type Derive,
  emptyState,
  encodeBytes,
  invitationMac,
  type Unlocked,
  unlockWithPassphrase,
} from "@kennwort/core";
import { createSignal } from "solid-js";
import type { AccountApi } from "./api.ts";
import { type DeviceAccount, forgetDevice, readDevice, rememberDevice } from "./device.ts";
import { recoverAccount } from "./recover.ts";
import { type StateDeps, saveState } from "./state-sync.ts";

export const LOCK_AFTER_MS = 10 * 60 * 1000;

export type Opened = Unlocked & { accountId: Uint8Array; token: string };
/** What the recovery kit shows: the account ID is needed to unlock on a device that does not know it */
export type NewKeys = { accountId: Uint8Array; secretKey: Uint8Array; recoveryKey: Uint8Array };
export type SessionError =
  | "wrong-code"
  | "invalid-invitation"
  | "too-many-requests"
  | "wrong-passphrase"
  | "wrong-recovery-key"
  | "unexpected";
export type Outcome<T> = { ok: true; value: T } | { ok: false; error: SessionError };

export type SessionDeps = {
  api: AccountApi;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined;
  lockAfterMs?: number;
  schedule?: (run: () => void, ms: number) => unknown;
  /** Argon2id as F-05 fixes it; only tests pass a lighter one */
  derive?: Derive;
  /** Random bytes for a new Secret Key; only tests pass fixed ones */
  random?: (length: number) => Uint8Array;
  cancel?: (timer: unknown) => void;
};

export const signInError = (error: string): SessionError =>
  error === "denied"
    ? "wrong-passphrase"
    : error === "too-many-requests" || error === "locked"
      ? "too-many-requests"
      : "unexpected";

/** Signs in with the sign-in key (P-02), loads the ciphertexts and opens them (P-03) */
const signInAndUnlock = async (
  api: AccountApi,
  accountId: Uint8Array,
  passphrase: string,
  secretKey: Uint8Array,
  derive?: Derive,
): Promise<Outcome<Opened>> => {
  const signedIn = await api.signIn(accountId, passphrase, secretKey, derive);
  if (!signedIn.ok) return { ok: false, error: signInError(signedIn.error) };
  const stored = await api.keys(signedIn.token);
  if (!stored) return { ok: false, error: "unexpected" };
  const unlocked = unlockWithPassphrase(stored, passphrase, secretKey, derive);
  if (!unlocked.ok)
    return { ok: false, error: unlocked.error === "wrong-key" ? "wrong-passphrase" : "unexpected" };
  return { ok: true, value: { ...unlocked.value, accountId, token: signedIn.token } };
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

/** The open account in memory and the automatic lock (P-03) */
const createLock = (deps: SessionDeps) => {
  const [opened, setOpened] = createSignal<Opened>();
  const schedule = deps.schedule ?? ((run, ms) => setTimeout(run, ms));
  const cancel = deps.cancel ?? ((timer) => clearTimeout(timer as number));
  let timer: unknown;
  let lockAfter = deps.lockAfterMs ?? LOCK_AFTER_MS;
  const lock = () => {
    cancel(timer);
    opened()?.accountKey.fill(0);
    setOpened(undefined);
  };
  /** Any use of the app pushes the automatic lock back */
  const touch = () => {
    if (!opened()) return;
    cancel(timer);
    timer = schedule(lock, lockAfter);
  };
  /** The company policy's lock time (K-304); it counts from the next use on */
  const setLockAfter = (ms: number) => {
    lockAfter = ms;
    touch();
  };
  // Another account opened while one is unlocked (setup or invitation) drops the first one properly
  const open = (value: Opened) => {
    lock();
    setOpened(value);
    touch();
  };
  return { opened, setOpened, lock, touch, open, setLockAfter };
};

/** The account state changed and written back; the open account sees the new one (state-sync.ts) */
const stateUpdater =
  (opened: () => Opened | undefined, setOpened: (value: Opened) => void) =>
  async (api: StateDeps, change: (state: AccountState) => AccountState | undefined) => {
    const current = opened();
    if (!current) return { ok: false as const, error: "unreachable" as const };
    const saved = await saveState(api, current, change);
    if (saved.ok && opened() === current) setOpened({ ...current, state: saved.value });
    return saved;
  };

export const createSession = (deps: SessionDeps) => {
  const { opened, setOpened, lock, touch, open, setLockAfter } = createLock(deps);
  const [device, setDevice] = createSignal<DeviceAccount | undefined>(readDevice(deps.storage));
  const remember = (accountId: Uint8Array, secretKey: Uint8Array) => {
    rememberDevice(deps.storage, accountId, secretKey);
    setDevice(readDevice(deps.storage));
  };
  const enrolled = (
    account: ReturnType<typeof createAccount>,
    token: Outcome<string> | { ok: false; error: SessionError },
    upload: (token: string) => Promise<boolean>,
  ) => finishEnrolment(account, token, upload, remember, open);

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
    unlock: async (
      passphrase: string,
      secretKey?: Uint8Array,
      accountIdText?: string,
    ): Promise<Outcome<true>> => {
      const known = device();
      const key = secretKey ?? known?.secretKey;
      const id = bytes(16).safeParse(accountIdText ?? known?.accountId);
      if (!key || !id.success) return { ok: false, error: "wrong-passphrase" };
      const result = await signInAndUnlock(deps.api, id.data, passphrase, key, deps.derive);
      if (!result.ok) return result;
      remember(id.data, key);
      open(result.value);
      return { ok: true, value: true };
    },
    /** The passphrase is forgotten: the Recovery Key opens the account and is renewed (recover.ts) */
    recover: async (
      recoveryKey: Uint8Array,
      passphrase: string,
      accountIdText?: string,
    ): Promise<Outcome<NewKeys>> => {
      const result = await recoverAccount(deps, device(), recoveryKey, passphrase, accountIdText);
      if (!result.ok) return result;
      remember(result.value.keys.accountId, result.value.keys.secretKey);
      open(result.value.opened);
      return { ok: true, value: result.value.keys };
    },
    /** A device joined by pairing (P-04): remember it and open the account it was given */
    adopt: (value: Opened, secretKey: Uint8Array) => {
      remember(value.accountId, secretKey);
      open(value);
    },
    /** Changes the account state and writes it back merged with the server's (state-sync.ts) */
    updateState: stateUpdater(opened, setOpened),
    /** This device signed out (K-303, device list): locked, and it no longer knows the account */
    forget: () => {
      lock();
      forgetDevice(deps.storage);
      setDevice(undefined);
    },
    accountIdText: () => {
      const value = opened();
      return value ? encodeBytes(value.accountId) : device()?.accountId;
    },
  };
};

export type Session = ReturnType<typeof createSession>;
