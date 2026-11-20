/**
 * Zod schemas for everything else that crosses between client and server: membership log entries
 * and certificates. The client parses every response against them before it checks signatures.
 */
import { z } from "zod";
import { bytes, encodeBytes } from "./bytes.ts";

export const LogEntryWire = z.object({
  vaultId: bytes(16),
  seq: z.number().int().nonnegative(),
  prevHash: bytes(32),
  epoch: z.number().int().nonnegative(),
  action: z.enum(["create", "add", "remove", "role", "rotate"]),
  accountId: bytes(16),
  fingerprint: bytes(),
  role: z.enum(["read", "edit", "manage", ""]),
  validUntil: z.number().int().nonnegative(),
  vkCommitment: bytes(),
  time: z.number().int().nonnegative(),
  signerId: bytes(16),
  lastSeen: bytes(),
  signature: bytes(65),
});

export const CertificateWire = z.object({
  accountId: bytes(16),
  xwingPublicKey: bytes(1216),
  edPublicKey: bytes(32),
  companyId: bytes(16),
  role: z.enum(["owner", "admin", "member"]),
  issuedAt: z.number().int().nonnegative(),
  signature: bytes(65),
});

/** GET /api/vaults: the vaults this account is a member of, with their sealed names (K-305) */
export const VaultListWire = z.object({
  vaults: z.array(
    z.object({ id: bytes(16), name: bytes().nullable(), nameEpoch: z.number().int().nullable() }),
  ),
});
export const VaultLogWire = z.object({ entries: z.array(LogEntryWire) });
export const VaultKeysWire = z.object({
  keys: z.array(z.object({ epoch: z.number().int().nonnegative(), wrapped: bytes() })),
});

/** GET /api/vaults/:id/requests: who asked for access, for the vault's managers (K-305) */
export const VaultRequestsWire = z.object({
  requests: z.array(
    z.object({
      accountId: bytes(16),
      requestedAt: z.number().int().nonnegative(),
      /** The highest role a linked group asks this person in with; none without such a group */
      role: z.enum(["read", "edit", "manage"]).nullable().default(null),
    }),
  ),
});

/** GET /api/groups: the company's groups with their members (K-305 part 5) */
export const GroupsWire = z.object({
  groups: z.array(
    z.object({ id: z.string().min(1), name: z.string().min(1), members: z.array(bytes(16)) }),
  ),
});
/** GET /api/vaults/:id/groups: the groups linked to a vault, with the role they ask for */
export const VaultGroupsWire = z.object({
  groups: z.array(
    z.object({ groupId: z.string().min(1), role: z.enum(["read", "edit", "manage"]) }),
  ),
});

/** Any record of bytes and plain values as JSON for the wire; the schemas read it back */
export const toWire = (value: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(value).map(([name, field]) => [
      name,
      field instanceof Uint8Array ? encodeBytes(field) : field,
    ]),
  );
