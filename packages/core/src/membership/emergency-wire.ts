/**
 * Emergency access on the wire (K-307 part d, P-14): what client and server exchange, parsed by Zod
 * at both ends. The server keeps it, checks what it can and holds the packages back until the
 * waiting time is over; the clients check the signatures and every key.
 */
import { z } from "zod";
import { bytes, encodeBytes } from "../sync/bytes.ts";
import { EntryRecord } from "../sync/record.ts";
import { LogEntryWire, toWire } from "../sync/wire.ts";

/** One day to 30 days, in seconds (P-14) */
export const MIN_WAIT_SECONDS = 86_400;
export const MAX_WAIT_SECONDS = 30 * 86_400;
/** Version, X-Wing ciphertext and the box around a 32-byte key (F-02) */
export const EMERGENCY_PACKAGE_LENGTH = 1 + 1120 + 1 + 24 + 32 + 16;
/** As many vaults as one grant may name; a company has far fewer */
const MAX_VAULTS = 500;

const count = z.number().int().nonnegative();
const EmergencyItemWire = z.object({ vaultId: bytes(16), epoch: count, commitment: bytes(32) });

const distinctVaults = (items: { vaultId: Uint8Array }[]) =>
  new Set(items.map((item) => encodeBytes(item.vaultId))).size === items.length;

export const EmergencyGrant = z
  .object({
    companyId: bytes(16),
    grantor: bytes(16),
    grantee: bytes(16),
    granteeFingerprint: bytes(32),
    scope: z.enum(["view", "full"]),
    waitSeconds: z.number().int().min(MIN_WAIT_SECONDS).max(MAX_WAIT_SECONDS),
    time: count,
    /** Full access: the commitment to the grantor's AK */
    accountCommitment: bytes(32).optional(),
    /** View access: each vault key's vault, epoch and commitment, each vault once */
    items: z.array(EmergencyItemWire).max(MAX_VAULTS),
    signature: bytes(65),
  })
  .refine((g) =>
    g.scope === "full"
      ? g.accountCommitment !== undefined && g.items.length === 0
      : g.accountCommitment === undefined && g.items.length > 0 && distinctVaults(g.items),
  );
export type EmergencyGrant = z.infer<typeof EmergencyGrant>;

export const grantToWire = (grant: EmergencyGrant) => ({
  ...toWire(grant),
  items: grant.items.map((item) => toWire(item)),
});

/** The wrapped keys of a grant: the server keeps them back until the waiting time is over */
export const EmergencyPackages = z.object({
  vaults: z
    .array(z.object({ vaultId: bytes(16), epoch: count, wrapped: bytes(EMERGENCY_PACKAGE_LENGTH) }))
    .max(MAX_VAULTS),
  account: bytes(EMERGENCY_PACKAGE_LENGTH).optional(),
});
export type EmergencyPackages = z.infer<typeof EmergencyPackages>;

export const packagesToWire = (packages: EmergencyPackages) => ({
  vaults: packages.vaults.map((p) => toWire(p)),
  ...(packages.account ? { account: encodeBytes(packages.account) } : {}),
});

/** A request, objection, approval or revocation, signed under its own purpose (F-09) */
export const Statement = z.object({
  grantor: bytes(16),
  grantee: bytes(16),
  at: count,
  signature: bytes(65),
});
export type Statement = z.infer<typeof Statement>;
export const statementToWire = (statement: Statement) => toWire(statement);

/** PUT /api/emergency/:grantee: the grant and its packages */
export const GrantUpload = z.object({ grant: EmergencyGrant, packages: EmergencyPackages });

/**
 * A grant as GET /api/emergency lists it, without its packages: the request running for it, the
 * grantor's objection or approval of that request, and when the server lets the packages out
 */
export const ListedGrant = z.object({
  grant: EmergencyGrant,
  request: Statement.nullable(),
  objection: Statement.nullable(),
  approval: Statement.nullable(),
  /** Seconds; null without a request */
  releaseAt: count.nullable(),
});
export type ListedGrant = z.infer<typeof ListedGrant>;

/** GET /api/emergency: grants this account gave, grants it holds and revocations of those */
export const EmergencyListWire = z.object({
  given: z.array(ListedGrant),
  received: z.array(ListedGrant),
  revocations: z.array(Statement),
});
export type EmergencyList = z.infer<typeof EmergencyListWire>;

/** GET /api/emergency/:grantor/release: the packages and, for full access, the sealed key block */
export const ReleaseWire = z.object({
  packages: EmergencyPackages,
  request: Statement,
  approval: Statement.nullable(),
  keyBlock: bytes().nullable(),
});
export type Release = z.infer<typeof ReleaseWire>;

/** GET /api/emergency/:grantor/vaults: what the grantee reads with the released keys */
export const EmergencyVaultsWire = z.object({
  vaults: z.array(
    z.object({
      id: bytes(16),
      name: bytes().nullable(),
      nameEpoch: z.number().int().nullable(),
      log: z.array(LogEntryWire),
      /** The grantor's wrapped vault keys, for full access only */
      keys: z.array(z.object({ epoch: count, wrapped: bytes() })),
      records: z.array(EntryRecord),
    }),
  ),
});
export type EmergencyVaults = z.infer<typeof EmergencyVaultsWire>;
