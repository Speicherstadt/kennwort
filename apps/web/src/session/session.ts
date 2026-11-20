/**
 * The unlocked account, in memory only (CLAUDE.md, P-03): created on setup, invitation or unlock,
 * dropped on lock and after a while without use. Locking overwrites the account key's bytes, so
 * nothing usable lingers once the references are gone.
 */
import {
  bytes,
  createAccount,
  createCompany,
  emptyState,
  encodeBytes,
  type Unlocked,
  unlockWithPassphrase,
} from "@kennwort/core";
import { createSignal } from "solid-js";
import type { Api } from "./api.ts";
import { type DeviceAccount, readDevice, rememberDevice } from "./device.ts";

export const LOCK_AFTER_MS = 10 * 60 * 1000;

export type Opened = Unlocked & { accountId: Uint8Array; token: string };
export type NewKeys = { secretKey: Uint8Array; recoveryKey: Uint8Array };
export type SessionError =
  | "wrong-code"
  | "invalid-invitation"
  | "too-many-requests"
  | "wrong-passphrase"
  | "unexpected";
type Outcome<T> = { ok: true; value: T } | { ok: false; error: SessionError };

export type SessionDeps = {
  api: Api;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined;
  lockAfterMs?: number;
  schedule?: (run: () => void, ms: number) => unknown;
  cancel?: (timer: unknown) => void;
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
  const open = (value: Opened) => {
    setOpened(value);
    touch();
  };
  const remember = (accountId: Uint8Array, secretKey: Uint8Array) => {
    rememberDevice(deps.storage, accountId, secretKey);
    setDevice(readDevice(deps.storage));
  };
  const enrolled = async (
    account: ReturnType<typeof createAccount>,
    token: Outcome<string> | { ok: false; error: SessionError },
    upload: (token: string) => Promise<boolean>,
  ): Promise<Outcome<NewKeys>> => {
    if (!token.ok) return token;
    if (!(await upload(token.value))) return { ok: false, error: "unexpected" };
    remember(account.accountId, account.secretKey);
    open({ ...account, accountId: account.accountId, token: token.value });
    return { ok: true, value: { secretKey: account.secretKey, recoveryKey: account.recoveryKey } };
  };

  return {
    opened,
    device,
    lock,
    touch,
    /** The first owner: company, root key and account, all made on this device */
    setUp: async (code: string, passphrase: string) => {
      const company = createCompany(passphrase);
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
      const account = createAccount(passphrase, emptyState(rootFingerprint));
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
      const signedIn = await deps.api.signIn(id.data, passphrase, key);
      if (!signedIn.ok)
        return {
          ok: false,
          error:
            signedIn.error === "denied"
              ? "wrong-passphrase"
              : signedIn.error === "too-many-requests"
                ? "too-many-requests"
                : "unexpected",
        };
      const stored = await deps.api.keys(signedIn.token);
      if (!stored) return { ok: false, error: "unexpected" };
      const unlocked = unlockWithPassphrase(stored, passphrase, key);
      if (!unlocked.ok)
        return {
          ok: false,
          error: unlocked.error === "wrong-key" ? "wrong-passphrase" : "unexpected",
        };
      remember(id.data, key);
      open({ ...unlocked.value, accountId: id.data, token: signedIn.token });
      return { ok: true, value: true };
    },
    accountIdText: () => {
      const value = opened();
      return value ? encodeBytes(value.accountId) : device()?.accountId;
    },
  };
};

export type Session = ReturnType<typeof createSession>;
