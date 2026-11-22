// The cryptography of Kennwort, built only on @noble/*, as docs/sicherheitsdesign.md describes it.

export {
  ACCOUNT_KEY_LENGTH,
  type KeyBlock,
  type KeyBlockError,
  keyBlockFingerprint,
  newAccountKey,
  newKeyBlock,
  newRecoveryKey,
  openAccountKey,
  openKeyBlock,
  passkeyUnlockKey,
  recoveryLoginSeed,
  sealAccountKey,
  sealKeyBlock,
  type UnlockPath,
} from "./account.ts";
export { BOX_V1, type BoxContext, KEY_LENGTH, type OpenError, open, seal } from "./box.ts";
export { constantTimeEqual, keyCommitment } from "./commitment.ts";
export {
  type Certified,
  DEPOSIT_PURPOSE,
  type Deposit,
  type DepositPlace,
  depositAccountKey,
  depositCommitment,
  depositMessage,
  holdsAccountKey,
  isSignedDeposit,
  type RecoverError,
  type RecoverInput,
  recoverAccountKey,
} from "./company-recovery.ts";
export { DERIVED_LENGTH, kdf } from "./derive.ts";
export { deviceCode, deviceFingerprint } from "./device.ts";
export { DIGEST_LENGTH, digest, sha256 } from "./digest.ts";
export {
  EMERGENCY_PURPOSE,
  EMERGENCY_STATEMENTS,
  type EmergencyGrantRef,
  type EmergencyItem,
  type EmergencyKeyError,
  type EmergencyParties,
  type EmergencyReader,
  type EmergencyScope,
  type EmergencyStatement,
  type EmergencyTerms,
  type EmergencyVaultPlace,
  emergencyAccountCommitment,
  emergencyGrantDigest,
  emergencyGrantMessage,
  emergencyStatementMessage,
  type TakeOverError,
  type TakeOverInput,
  unwrapEmergencyAccountKey,
  unwrapEmergencyVaultKey,
  wrapEmergencyAccountKey,
  wrapEmergencyVaultKey,
} from "./emergency.ts";
export { decode, encode, type Part } from "./encoding.ts";
export { bundleFingerprint, recoveryFingerprint, rootFingerprint } from "./fingerprint.ts";
export {
  INVITE_MAC_LENGTH,
  INVITE_SECRET_LENGTH,
  type InvitedBundle,
  inviteMac,
  verifyInviteMac,
} from "./invite.ts";
export { hotp, OTP_ALGORITHMS, type OtpAlgorithm, type TotpOptions, totp } from "./otp.ts";
export {
  ES256,
  newPasskeyKey,
  PASSKEY_KEY_LENGTH,
  PASSKEY_KEY_V1,
  type PasskeyKeyError,
  passkeyPublicKey,
  passkeySign,
} from "./passkey.ts";
export {
  ACCOUNT_SALT_LENGTH,
  PASSPHRASE_V1,
  type PassphraseKeys,
  passphraseKeys,
  passphraseKeysWith,
  SECRET_KEY_LENGTH,
} from "./passphrase.ts";
export {
  ALERT_HOST_TAG_LENGTH,
  ALERT_SALT_LENGTH,
  ALERT_TAG_LENGTH,
  alertHostTag,
  alertTag,
  PASSWORD_ALERT_V1,
} from "./password-alert.ts";
export { randomBytes } from "./random.ts";
export type { Result } from "./result.ts";
export {
  formatRecoveryKey,
  formatSecretKey,
  type KeyTextError,
  parseRecoveryKey,
  parseSecretKey,
  type SecretKeyError,
} from "./secret-key.ts";
export {
  type ShareKeyError,
  type SharePlace,
  shareKeyCommitment,
  unwrapShareKey,
  wrapShareKey,
} from "./share.ts";
export { ed25519KeyPair, SIGNATURE_V1, sign, verify } from "./sign.ts";
export {
  type EntryPlace,
  newEntryKey,
  newVaultKey,
  openEntry,
  openEntryKey,
  sealEntry,
  sealEntryKey,
  unwrapVaultKey,
  type VaultKeyError,
  type VaultPlace,
  vaultKeyCommitment,
  wrapVaultKey,
} from "./vault.ts";
export { type Recipient, type UnwrapError, unwrap, WRAP_V1, wrap, xwingKeyPair } from "./wrap.ts";
