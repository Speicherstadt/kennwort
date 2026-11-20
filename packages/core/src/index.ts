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
  type DevicePackage,
  openDevicePackage,
  PAIRING_SECRET_LENGTH,
  sealDevicePackage,
  stateHash,
  unlockWithDevicePackage,
} from "./account/pairing.ts";
export {
  RENEWAL_PURPOSE,
  type RenewDeps,
  renewalFields,
  renewUnlock,
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
  signInWithPassphrase,
  signInWithRecoveryKey,
} from "./auth/sign-in.ts";
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
export {
  type Certificate,
  type CompanyRole,
  certificateFingerprint,
  certify,
  isCertified,
} from "./membership/certificate.ts";
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
  checkMembers,
  type MemberStatus,
  MembersWire,
  type MemberView,
  newerCertificates,
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
  changeRole,
  grantRoot,
  openRootGrant,
  ROOT_GRANT_LENGTH,
  type RootGrantError,
} from "./membership/root-grant.ts";
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
