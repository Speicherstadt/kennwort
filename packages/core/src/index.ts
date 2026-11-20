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
  unlockWithPassphrase,
  unlockWithRecoveryKey,
} from "./account/unlock.ts";
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
  type Derive,
  loginKeyPair,
  type Post,
  type SignInResult,
  signInWithPassphrase,
} from "./auth/sign-in.ts";
export {
  type Certificate,
  type CompanyRole,
  certificateFingerprint,
  certify,
  isCertified,
} from "./membership/certificate.ts";
export {
  type Action,
  entryHash,
  GENESIS_HASH,
  type LogEntry,
  type LogFields,
  signEntry,
  type VaultRole,
} from "./membership/log-entry.ts";
export {
  idKey,
  isMember,
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
  EntryContent,
  EntryType,
  Field,
  FieldKind,
  HistoryItem,
  mergeContent,
} from "./sync/content.ts";
export {
  type Device,
  edit,
  emptyDevice,
  type Known,
  type Pending,
  type Pulled,
  pull,
  type Refused,
  type SyncContext,
  sync,
} from "./sync/device.ts";
export { type Connection, httpServer, type LiveEvent, watchVault } from "./sync/http.ts";
export { memoryServer, type PushResult, type SyncServer } from "./sync/memory-server.ts";
export {
  type AcceptError,
  type Author,
  EntryRecord,
  openRecord,
  recordToWire,
  sealRecord,
  type VaultKeyring,
} from "./sync/record.ts";
export { parseSse, type SseEvent } from "./sync/sse.ts";
export { CertificateWire, LogEntryWire, toWire } from "./sync/wire.ts";
