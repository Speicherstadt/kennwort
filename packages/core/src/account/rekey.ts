/**
 * New account keys after a recovery kit fell into foreign hands (P-12, K-307 part e). Whoever holds
 * the kit's Secret Key and Recovery Key and a recovery box opens AK and with it the key block, so a
 * new AK alone helps nothing: the device makes a new AK, a new Secret Key, new X-Wing and Ed25519
 * keys and a new Recovery Key, seals key block, account state and every unlock way under the new
 * AK, and wraps every vault key it holds to the new bundle, so it keeps reading until each vault
 * rotates. The previous Ed25519 key signs all of it (F-11): the server replaces nothing for a
 * session alone. As in 1Password's Secret Key regeneration and Bitwarden's key rotation, the
 * passphrase stays and is derived anew with the new Secret Key (F-05).
 */
import {
  ACCOUNT_SALT_LENGTH,
  ed25519KeyPair,
  type KeyBlock,
  kdf,
  keyBlockFingerprint,
  newAccountKey,
  newKeyBlock,
  newRecoveryKey,
  passphraseKeys,
  type RekeyStatement,
  randomBytes,
  recoveryLoginSeed,
  SECRET_KEY_LENGTH,
  sealAccountKey,
  sealKeyBlock,
  signRekey,
  wrapVaultKey,
} from "@kennwort/crypto";
import type { Keyring } from "../membership/vault-ops.ts";
import { encodeBytes } from "../sync/bytes.ts";
import { toWire } from "../sync/wire.ts";
import { type AccountState, sealState } from "./state.ts";

export type RekeyUpload = RekeyStatement & {
  /** Signature of the previous Ed25519 key over everything above (F-11) */
  proof: Uint8Array;
};

/** The account as it is open now; the counter is the one the server holds for its state */
export type Current = {
  accountId: Uint8Array;
  accountKey: Uint8Array;
  keyBlock: KeyBlock;
  state: AccountState;
  stateCounter: number;
};

export type Rekeyed = {
  accountKey: Uint8Array;
  secretKey: Uint8Array;
  recoveryKey: Uint8Array;
  keyBlock: KeyBlock;
  state: AccountState;
  upload: RekeyUpload;
};

export type RekeyDeps = {
  derive?: typeof passphraseKeys;
  random?: (length: number) => Uint8Array;
};

/**
 * The personal vault's ID as derived from an AK (P-05), the first 16 bytes of
 * kdf(AK, empty, "kennwort/personal-vault/v1", account)
 */
export const derivedPersonalVault = (accountKey: Uint8Array, accountId: Uint8Array) =>
  kdf(accountKey, new Uint8Array(), "kennwort/personal-vault/v1", accountId).slice(0, 16);

/** The vault keys this device holds, each wrapped anew to the new bundle (F-02) */
const rewrapped = (accountId: Uint8Array, block: KeyBlock, rings: readonly Keyring[]) =>
  rings.map((ring) => ({
    vaultId: ring.vaultId,
    epoch: ring.epoch,
    wrapped: wrapVaultKey(
      { publicKey: block.xwing.publicKey, fingerprint: keyBlockFingerprint(block) },
      accountId,
      ring.vaultKey,
      { vaultId: ring.vaultId, epoch: ring.epoch },
    ),
  }));

export const rekeyAccount = (
  current: Current,
  passphrase: string,
  rings: readonly Keyring[],
  deps: RekeyDeps = {},
): Rekeyed => {
  const random = deps.random ?? randomBytes;
  const { accountId } = current;
  const accountKey = newAccountKey();
  const secretKey = random(SECRET_KEY_LENGTH);
  const accountSalt = random(ACCOUNT_SALT_LENGTH);
  const recoveryKey = newRecoveryKey();
  const keyBlock = newKeyBlock(current.keyBlock.rootFingerprint);
  const derived = (deps.derive ?? passphraseKeys)(passphrase, accountSalt, secretKey, accountId);
  // The personal vault keeps its ID, which the old AK gave it
  const state = {
    ...current.state,
    personalVault:
      current.state.personalVault ??
      encodeBytes(derivedPersonalVault(current.accountKey, accountId)),
  };
  const stateCounter = current.stateCounter + 1;
  const statement: RekeyStatement = {
    accountId,
    accountSalt,
    loginPublicKey: ed25519KeyPair(derived.login).publicKey,
    recoveryLoginPublicKey: ed25519KeyPair(recoveryLoginSeed(recoveryKey, accountId)).publicKey,
    xwingPublicKey: keyBlock.xwing.publicKey,
    edPublicKey: keyBlock.ed.publicKey,
    keyBlock: sealKeyBlock(accountKey, accountId, keyBlock),
    state: sealState(accountKey, accountId, stateCounter, state),
    stateCounter,
    unlock: {
      passphrase: sealAccountKey(derived.unlock, accountKey, accountId, { kind: "passphrase" }),
      recovery: sealAccountKey(recoveryKey, accountKey, accountId, { kind: "recovery" }),
    },
    vaultKeys: rewrapped(accountId, keyBlock, rings),
  };
  const proof = signRekey(current.keyBlock.ed.secretKey, statement);
  return { accountKey, secretKey, recoveryKey, keyBlock, state, upload: { ...statement, proof } };
};

/** PUT /api/account/rekey's body; the account is the session's, so its ID stays out */
export const rekeyToWire = ({ accountId: _, unlock, vaultKeys, ...upload }: RekeyUpload) => ({
  ...toWire(upload),
  unlock: toWire(unlock),
  vaultKeys: vaultKeys.map((key) => toWire(key)),
});
