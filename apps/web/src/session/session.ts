/**
 * The unlocked account, in memory only (CLAUDE.md, P-03): created on setup, invitation or unlock,
 * dropped on lock and after a while without use. Locking overwrites the account key's bytes, so
 * nothing usable lingers once the references are gone.
 */
import {
  bytes,
  createAccount,
  createCompany,
  type Derive,
  emptyState,
  encodeBytes,
  type Unlocked,
  unlockWithPassphrase,
} from "@kennwort/core";
import { createSignal } from "solid-js";
import type { Api } from "./api.ts";
import { type DeviceAccount, readDevice, rememberDevice } from "./device.ts";
import { recoverAccount } from "./recover.ts";

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
  api: Api;
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
  api: Api,
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

export const createSession = (deps: SessionDeps) => {
  const [opened, setOpened] = createSignal<Opened>();
  const [device, setDevice] = createSignal<DeviceAccount | undefined>(readDevice(deps.storage));
  const schedule = deps.schedule ?? ((run, ms) => setTimeout(run, ms));
  const cancel = deps.cancel ?? ((timer) => clearTimeout(timer as number));
  let timer: unknown;
  const lock = () => {
    cancel(timer);
    opened()?.accountKey.fill(0);
    setOpened(undefined);
  };
  /** Any use of the app pushes the automatic lock back */
  const touch = () => {
    if (!opened()) return;
    cancel(timer);
    timer = schedule(lock, deps.lockAfterMs ?? LOCK_AFTER_MS);
  };
  // Another account opened while one is unlocked (setup or invitation) drops the first one properly
  const open = (value: Opened) => {
    lock();
    setOpened(value);
    touch();
  };
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
    /** The first owner: company, root key and account, all made on this device */
    setUp: async (code: string, passphrase: string) => {
      const company = createCompany(passphrase, deps.derive ? { derive: deps.derive } : {});
      const token = await deps.api.setup(code, company.companyId, company.owner.upload);
      return enrolled(company.owner, token, (t) =>
        deps.api.uploadKeys(t, company.owner.upload, company.certificate),
      );
    },
    /** An invited member; the root fingerprint comes from the link's fragment, never from the server */
    accept: async (
      invitationId: string,
      inviteToken: string,
      rootFingerprint: Uint8Array,
      passphrase: string,
    ) => {
      const account = createAccount(
        passphrase,
        emptyState(rootFingerprint),
        deps.derive ? { derive: deps.derive } : {},
      );
      const token = await deps.api.accept(invitationId, inviteToken, account.upload);
      return enrolled(account, token, (t) => deps.api.uploadKeys(t, account.upload));
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
    accountIdText: () => {
      const value = opened();
      return value ? encodeBytes(value.accountId) : device()?.accountId;
    },
  };
};

export type Session = ReturnType<typeof createSession>;
