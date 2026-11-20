/**
 * Creating an account (P-01) and, for the first owner, the company with its root key (P-07). All
 * keys come into being on the device; `upload` is everything the server gets: IDs, salt, public
 * keys and ciphertexts. Passphrase, Secret Key, Recovery Key and AK stay with the caller.
 */
import {
  ACCOUNT_SALT_LENGTH,
  ed25519KeyPair,
  type KeyBlock,
  newAccountKey,
  newKeyBlock,
  newRecoveryKey,
  passphraseKeys,
  randomBytes,
  recoveryLoginSeed,
  rootFingerprint,
  SECRET_KEY_LENGTH,
  sealAccountKey,
  sealKeyBlock,
} from "@kennwort/crypto";
import { type Certificate, certify } from "../membership/certificate.ts";
import { type AccountState, emptyState, sealState } from "./state.ts";

export type CreateDeps = {
  derive?: typeof passphraseKeys;
  random?: (length: number) => Uint8Array;
  now?: () => number;
};

export type AccountUpload = {
  accountId: Uint8Array;
  accountSalt: Uint8Array;
  loginPublicKey: Uint8Array;
  /** The sign-in key of the Recovery Key (P-12), for who forgot the passphrase */
  recoveryLoginPublicKey: Uint8Array;
  xwingPublicKey: Uint8Array;
  edPublicKey: Uint8Array;
  keyBlock: Uint8Array;
  state: Uint8Array;
  stateCounter: number;
  unlock: { passphrase: Uint8Array; recovery: Uint8Array };
};

export type NewAccount = {
  accountId: Uint8Array;
  accountKey: Uint8Array;
  secretKey: Uint8Array;
  recoveryKey: Uint8Array;
  keyBlock: KeyBlock;
  state: AccountState;
  upload: AccountUpload;
};

export const createAccount = (
  passphrase: string,
  state: AccountState,
  deps: CreateDeps = {},
): NewAccount => {
  const random = deps.random ?? randomBytes;
  const derive = deps.derive ?? passphraseKeys;
  const accountId = random(16);
  const accountSalt = random(ACCOUNT_SALT_LENGTH);
  const secretKey = random(SECRET_KEY_LENGTH);
  const accountKey = newAccountKey();
  const recoveryKey = newRecoveryKey();
  const keyBlock = newKeyBlock(state.rootFingerprint);
  const derived = derive(passphrase, accountSalt, secretKey, accountId);
  return {
    accountId,
    accountKey,
    secretKey,
    recoveryKey,
    keyBlock,
    state,
    upload: {
      accountId,
      accountSalt,
      loginPublicKey: ed25519KeyPair(derived.login).publicKey,
      recoveryLoginPublicKey: ed25519KeyPair(recoveryLoginSeed(recoveryKey, accountId)).publicKey,
      xwingPublicKey: keyBlock.xwing.publicKey,
      edPublicKey: keyBlock.ed.publicKey,
      keyBlock: sealKeyBlock(accountKey, accountId, keyBlock),
      state: sealState(accountKey, accountId, 0, state),
      stateCounter: 0,
      unlock: {
        passphrase: sealAccountKey(derived.unlock, accountKey, accountId, { kind: "passphrase" }),
        recovery: sealAccountKey(recoveryKey, accountKey, accountId, { kind: "recovery" }),
      },
    },
  };
};

export type NewCompany = {
  companyId: Uint8Array;
  owner: NewAccount;
  certificate: Certificate;
  rootPublicKey: Uint8Array;
};

/** The first owner: a company ID, the root key, the owner's account and its certificate */
export const createCompany = (passphrase: string, deps: CreateDeps = {}): NewCompany => {
  const random = deps.random ?? randomBytes;
  const root = ed25519KeyPair(random(32));
  const companyId = random(16);
  const owner = createAccount(
    passphrase,
    emptyState(rootFingerprint(root.publicKey), root.secretKey),
    deps,
  );
  const certificate = certify(root.secretKey, {
    accountId: owner.accountId,
    xwingPublicKey: owner.keyBlock.xwing.publicKey,
    edPublicKey: owner.keyBlock.ed.publicKey,
    companyId,
    role: "owner",
    issuedAt: Math.floor((deps.now ?? Date.now)() / 1000),
  });
  return { companyId, owner, certificate, rootPublicKey: root.publicKey };
};
