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

/** Any record of bytes and plain values as JSON for the wire; the schemas read it back */
export const toWire = (value: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(value).map(([name, field]) => [
      name,
      field instanceof Uint8Array ? encodeBytes(field) : field,
    ]),
  );
