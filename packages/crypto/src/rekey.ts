/**
 * F-11 of docs/sicherheitsdesign.md: the account's new keys after a recovery kit fell into foreign
 * hands (P-12, K-307 part e). The client makes a new AK, Secret Key, key pairs and Recovery Key;
 * the server replaces the old ones only with a signature by the account's previous Ed25519 key over
 * every new value, so a session alone (a stolen token) replaces nothing.
 *
 *   statement = enc("kennwort/rekey/v1", account, salt, loginPk, recoveryLoginPk, xwingPk, edPk,
 *                   keyBlock, state, counter, akUnderPassphrase, akUnderRecovery,
 *                   enc(enc(vault, epoch, wrapped)…))
 *   proof     = F-03(previous edSk, "account-rekey", statement)
 *
 * Like 1Password's "regenerate Secret Key" and Bitwarden's account key rotation (both re-encrypt
 * everything under fresh keys and sign the devices out), with one difference: the old key only
 * authorises the replacement on the server; the new bundle counts for others only with a new
 * certificate of the company root (P-07), since the old key is taken as known to someone else.
 */
import { encode } from "./encoding.ts";
import { sign, verify } from "./sign.ts";

export const REKEY_PURPOSE = "account-rekey";

/** A vault key the account held, wrapped anew to its new bundle (F-02) */
export type RekeyVaultKey = { vaultId: Uint8Array; epoch: number; wrapped: Uint8Array };

export type RekeyStatement = {
  accountId: Uint8Array;
  accountSalt: Uint8Array;
  loginPublicKey: Uint8Array;
  recoveryLoginPublicKey: Uint8Array;
  xwingPublicKey: Uint8Array;
  edPublicKey: Uint8Array;
  keyBlock: Uint8Array;
  state: Uint8Array;
  stateCounter: number;
  unlock: { passphrase: Uint8Array; recovery: Uint8Array };
  vaultKeys: readonly RekeyVaultKey[];
};

/** The statement's bytes; the vault keys in the order given, each as its own encoded part */
export const rekeyMessage = (s: RekeyStatement) =>
  encode(
    "kennwort/rekey/v1",
    s.accountId,
    s.accountSalt,
    s.loginPublicKey,
    s.recoveryLoginPublicKey,
    s.xwingPublicKey,
    s.edPublicKey,
    s.keyBlock,
    s.state,
    s.stateCounter,
    s.unlock.passphrase,
    s.unlock.recovery,
    encode(...s.vaultKeys.map((key) => encode(key.vaultId, key.epoch, key.wrapped))),
  );

/** The proof by the previous Ed25519 key */
export const signRekey = (previousEdSecretKey: Uint8Array, statement: RekeyStatement) =>
  sign(previousEdSecretKey, REKEY_PURPOSE, rekeyMessage(statement));

/** True only if the previous Ed25519 key signed exactly this statement */
export const isSignedRekey = (
  previousEdPublicKey: Uint8Array,
  proof: Uint8Array,
  statement: RekeyStatement,
) => verify(previousEdPublicKey, proof, REKEY_PURPOSE, rekeyMessage(statement));
