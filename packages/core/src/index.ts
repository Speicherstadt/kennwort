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
export { KEY_BLOCK_PURPOSE, keyBlockFields, proveKeyBlock } from "./account/key-block-proof.ts";
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
  LeakCheckChoice,
  leakCheckOn,
  monthOf,
  nextChoice,
  reportDue,
} from "./account/security-prefs.ts";
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
export {
  OidcLinkWire,
  OidcProviderWire,
  type OidcStatus,
  OidcStatusWire,
  type OidcTicket,
  OidcTicketWire,
} from "./auth/oidc.ts";
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
export {
  addTotp,
  type CodeCandidate,
  type CodeState,
  codeCandidates,
  codeOf,
  type ImportedCode,
  type VaultLogin,
} from "./import/match-codes.ts";
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
  createLeakCheck,
  type FetchRange,
  LEAK_CONCURRENCY,
  type LeakCheck,
  type LeakCounts,
  type LeakError,
} from "./leaks/leak-check.ts";
export { isRangePrefix, parseRange } from "./leaks/range.ts";
export * from "./links/index.ts";
export * from "./membership/index.ts";
export * from "./notifications/index.ts";
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
