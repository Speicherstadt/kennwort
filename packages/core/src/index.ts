// Schemas, sync, the membership log and the import parsers, shared by every client and the server.

export {
  type AccountUpload,
  type CreateDeps,
  createAccount,
  createCompany,
  type NewAccount,
  type NewCompany,
} from "./account/create.ts";
export {
  EmergencySeen,
  isReplayed,
  mergeEmergency,
  noteGrant,
  noteObjection,
  noteRevocation,
} from "./account/emergency-seen.ts";
export {
  type DevicePackage,
  openDevicePackage,
  openRecoveryPackage,
  PAIRING_SECRET_LENGTH,
  RECOVERY_PACKAGE_LENGTH,
  type RecoveryPackage,
  sealDevicePackage,
  sealRecoveryPackage,
  stateHash,
  unlockWithDevicePackage,
} from "./account/pairing.ts";
export {
  type Current,
  derivedPersonalVault,
  type RekeyDeps,
  type Rekeyed,
  type RekeyUpload,
  rekeyAccount,
  rekeyToWire,
} from "./account/rekey.ts";
export {
  ACCOUNT_RENEWAL_PURPOSE,
  RENEWAL_PURPOSE,
  type RenewDeps,
  renewalFields,
  renewUnlock,
  renewUnlockWithAccountKey,
  type UnlockUpload,
} from "./account/renew.ts";
export {
  AccountState,
  emptyState,
  type MergeError,
  mergeStates,
  openState,
  type StateError,
  sealState,
} from "./account/state.ts";
export {
  type Stored,
  type UnlockError,
  type Unlocked,
  unlockWithAccountKey,
  unlockWithPassphrase,
  unlockWithRecoveryKey,
} from "./account/unlock.ts";
export {
  AnnouncedWire,
  type DeviceEntry,
  DevicesWire,
  InvitedWire,
  PairingKeyWire,
  type PollAnswer,
  PollWire,
  RootGrantWire,
  SessionWire,
  StaleWire,
  StoredWire,
} from "./account/wire.ts";
export {
  AUDIT_GENESIS,
  AuditAction,
  AuditEvent,
  AuditExport,
  type AuditFailure,
  type AuditFields,
  type AuditHead,
  type AuditProblem,
  AuditText,
  auditHash,
  CLIENT_ACTIONS,
  type ClientAction,
  chainAudit,
  isCanonical,
  isClientAction,
  signAudit,
  verifyAudit,
} from "./audit/chain.ts";
export {
  answerChallenge,
  answerRecoveryChallenge,
  type Derive,
  loginKeyPair,
  type Post,
  recoveryLoginKeyPair,
  type SignInResult,
  signInWithLoginKey,
  signInWithPassphrase,
  signInWithRecoveryKey,
} from "./auth/sign-in.ts";
export * from "./export/index.ts";
export {
  DIGITS,
  LOWER,
  PASSPHRASE_WORDS,
  PASSWORD_LENGTH,
  type PassphraseOptions,
  type PasswordOptions,
  passphrase,
  passphraseBits,
  password,
  passwordBits,
  type RandomBelow,
  randomBelow,
  type Strength,
  SYMBOLS,
  strengthOf,
  UPPER,
} from "./generator/generator.ts";
export { IMPORT_FORMATS, type ImportFormat } from "./import/formats.ts";
export { migrationBatch } from "./import/google-migration.ts";
export { type Columns, csvColumns, parseTableCsv } from "./import/table.ts";
export type {
  FileParser,
  ImportError,
  ImportedEntry,
  ImportResult,
  Parser,
  ZipParser,
} from "./import/types.ts";
export {
  type Certificate,
  type CompanyRole,
  certificateFingerprint,
  certify,
  isCertified,
} from "./membership/certificate.ts";
export {
  checkGrant,
  type GrantError,
  type GrantKeys,
  isBehind,
  isSignedGrant,
  isSignedStatement,
  isSignedStatementOf,
  makeGrant,
  partiesOf,
  signStatement,
} from "./membership/emergency.ts";
export {
  checkRelease,
  type EmergencyAccountError,
  type EmergencyVaultError,
  openEmergencyAccount,
  openEmergencyVault,
  type ReleaseError,
} from "./membership/emergency-open.ts";
export {
  EMERGENCY_PACKAGE_LENGTH,
  EmergencyGrant,
  type EmergencyList,
  EmergencyListWire,
  EmergencyPackages,
  type EmergencyVaults,
  EmergencyVaultsWire,
  GrantUpload,
  grantToWire,
  ListedGrant,
  MAX_WAIT_SECONDS,
  MIN_WAIT_SECONDS,
  packagesToWire,
  type Release,
  ReleaseWire,
  Statement,
  statementToWire,
} from "./membership/emergency-wire.ts";
export {
  type Exposure as VaultExposure,
  exitReport,
  exposureOf,
  pastExposures,
  type ReportEntry,
  type ReportVault,
  type SeenEntry,
  type SeenVault,
} from "./membership/exit-report.ts";
export {
  type Certifier,
  type CertifyError,
  certifyInvited,
  invitationMac,
  type NewInvitation,
  newInvitation,
  type PendingMember,
} from "./membership/invitation.ts";
export {
  type Action,
  entryBytes,
  entryHash,
  GENESIS_HASH,
  type LogEntry,
  type LogFields,
  signEntry,
  type VaultRole,
} from "./membership/log-entry.ts";
export {
  CompanyWire,
  certifyRenewed,
  checkMembers,
  type MemberStatus,
  MembersWire,
  type MemberView,
  newerCertificates,
  type RenewedBundle,
  trustedRoot,
} from "./membership/members.ts";
export {
  checkPolicy,
  isSignedPolicy,
  LOCK_MINUTES,
  type Policy,
  type PolicyError,
  PolicyWire,
  policyToWire,
  signPolicy,
  standardPolicy,
  type UnsignedPolicy,
} from "./membership/policy.ts";
export {
  type ApproveError,
  type ApproveInput,
  approveRecovery,
  checkRecovered,
  type DepositDecision,
  type Depositor,
  depositFor,
  type RecoveredError,
  type RecoveryBundle,
} from "./membership/recovery-deposit.ts";
export {
  type CompanyRecoveryKey,
  grantRecoveryKey,
  newCompanyRecoveryKey,
  openRecoveryGrant,
  RECOVERY_GRANT_LENGTH,
  type RecoveryGrantError,
  recoveryPolicy,
} from "./membership/recovery-key.ts";
export {
  DEPOSIT_PACKAGE_LENGTH,
  DepositWire,
  depositToWire,
  HeldDepositWire,
  RecoveryBundleWire,
  RecoveryGrantWire,
  RecoveryKeyUpload,
  recoveryKeyToWire,
} from "./membership/recovery-wire.ts";
export { dueRekeys, rekeyMember } from "./membership/renewal.ts";
export {
  acceptRootChange,
  followRoot,
  type RetiredRoot,
  RootChangeWire,
  type RootError,
  type RootView,
  rootOf,
  type ServedRoot,
  successorOf,
} from "./membership/root-change.ts";
export {
  changeRole,
  grantRoot,
  openRootGrant,
  ROOT_GRANT_LENGTH,
  type RootGrantError,
} from "./membership/root-grant.ts";
export {
  type RootGrantFor,
  type RootRotation,
  RootRotationWire,
  type RotationInput,
  rootRotationToWire,
  rotateRoot,
} from "./membership/root-rotation.ts";
export {
  dueExits,
  type Exit,
  openRings,
  type Rings,
  type RingsError,
  type RotateError,
  type Rotation,
  removeAndRotate,
  rotateVaultKey,
  type WrappedKey,
} from "./membership/rotation.ts";
export { NAME_LENGTH, openVaultName, sealVaultName } from "./membership/vault-name.ts";
export {
  type Access,
  addMember,
  changeAccess,
  createVault,
  type Keyring,
  type NewVault,
  type OpenKeyError,
  openVaultKey,
  removeMember,
  type Signer,
} from "./membership/vault-ops.ts";
export {
  CLOCK_SKEW_SECONDS,
  certificateFor,
  certificateOf,
  fromIdKey,
  idKey,
  isMember,
  isSuperseded,
  type LogError,
  type LogState,
  type Member,
  type Remembered,
  remember,
  type Trust,
  verifyLog,
} from "./membership/verify-log.ts";
export { bytes, encodeBytes } from "./sync/bytes.ts";
export {
  ChangeMark,
  markForChange,
  marksOf,
  mergeMarks,
  secretFieldIds,
  settleMarks,
  withMarks,
} from "./sync/change-marks.ts";
export {
  EntryContent,
  EntryType,
  Field,
  FieldKind,
  HistoryItem,
  mergeContent,
} from "./sync/content.ts";
export {
  type Device,
  type Exposure,
  edit,
  emptyDevice,
  inVersionOrder,
  type Known,
  type Pending,
  type Pulled,
  pull,
  type Refused,
  rekey,
  rotateEntries,
  type SyncContext,
  sync,
} from "./sync/device.ts";
export { type Connection, httpServer, type LiveEvent, watchVault } from "./sync/http.ts";
export { memoryServer, type PushResult, type SyncServer } from "./sync/memory-server.ts";
export {
  type AcceptError,
  type Author,
  type EntryKey,
  EntryRecord,
  entryKeyFor,
  type Opened,
  openRecord,
  openRecordWithKey,
  recordToWire,
  sealRecord,
  type VaultKeyring,
} from "./sync/record.ts";
export {
  genuineShares,
  makeShare,
  openShared,
  reshare,
  Share,
  type SharedError,
  type ShareReader,
  SharesWire,
  shareToWire,
  WRAPPED_ENTRY_KEY_LENGTH,
} from "./sync/share.ts";
export { parseSse, type SseEvent } from "./sync/sse.ts";
export {
  CertificateWire,
  GroupsWire,
  LogEntryWire,
  toWire,
  VaultGroupsWire,
  VaultKeysWire,
  VaultListWire,
  VaultLogWire,
  VaultRequestsWire,
} from "./sync/wire.ts";
export {
  base32Decode,
  base32Encode,
  parseTotp,
  type TotpError,
  type TotpKey,
  totpCode,
  totpLink,
} from "./totp/otpauth.ts";
