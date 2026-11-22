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
export {
  type BitwardenCipherText,
  type BitwardenKdf,
  type BitwardenKey,
  bitwardenDecrypt,
  bitwardenExportKey,
  bitwardenKdf,
  bitwardenStretch,
} from "./bitwarden.ts";
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
export {
  EXPORT_ARGON2_V1,
  EXPORT_SALT_LENGTH,
  EXPORT_V1,
  type ExportOpenError,
  openExport,
  openExportWith,
  sealExport,
  sealExportWith,
} from "./export-file.ts";
export {
  bundleFingerprint,
  comparisonCode,
  recoveryFingerprint,
  rootFingerprint,
} from "./fingerprint.ts";
export {
  INVITE_MAC_LENGTH,
  INVITE_SECRET_LENGTH,
  type InvitedBundle,
  inviteMac,
  verifyInviteMac,
} from "./invite.ts";
export {
  KDBX_HEADER_INDEX,
  type KdbxAesKdf,
  type KdbxArgon2,
  type KdbxCipher,
  type KdbxInnerStream,
  type KdbxKdf,
  kdbxBlockMac,
  kdbxCompositeKey,
  kdbxDecrypt,
  kdbxEncrypt,
  kdbxInnerKeystream,
  kdbxKeys,
  kdbxPasswordPart,
  kdbxTransformKey,
} from "./kdbx.ts";
export {
  LINK_ARGON2_V1,
  LINK_SALT_LENGTH,
  LINK_SECRET_LENGTH,
  LINK_V1,
  type LinkOpenError,
  type LinkSealInput,
  linkNeedsPassphrase,
  openLink,
  openLinkWith,
  sealLink,
  sealLinkWith,
} from "./one-time-link.ts";
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
  type ArgonParams,
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
export {
  isSignedRekey,
  REKEY_PURPOSE,
  type RekeyStatement,
  type RekeyVaultKey,
  rekeyMessage,
  signRekey,
} from "./rekey.ts";
export type { Result } from "./result.ts";
export {
  isSignedRootChange,
  ROOT_CHANGE_ACCEPT_PURPOSE,
  ROOT_CHANGE_PURPOSE,
  type RootChange,
  type RootChangeStatement,
  rootChangeMessage,
  signRootChange,
} from "./root-change.ts";
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
