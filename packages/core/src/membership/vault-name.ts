/**
 * The name of a vault (P-05): the server sees vault IDs, members and roles in the log, but the name
 * is sealed with the vault key of its epoch (F-01), bound to vault and epoch, so only members read
 * it and the server cannot move it to another vault.
 *
 *   sealed = F-01(VKₑ, name in UTF-8 NFC, purpose "vault-name", context = vault ID, epoch)
 */
import { open, seal } from "@kennwort/crypto";
import { err, ok, type Result } from "../result.ts";
import type { Keyring } from "./vault-ops.ts";

export const NAME_LENGTH = 100;

const where = (ring: Keyring) => ({ purpose: "vault-name", context: [ring.vaultId, ring.epoch] });

const cleaned = (name: string) => {
  const text = name.normalize("NFC").trim();
  return text.length > 0 && text.length <= NAME_LENGTH ? text : undefined;
};

export const sealVaultName = (ring: Keyring, name: string): Uint8Array => {
  const text = cleaned(name);
  if (text === undefined) throw new Error("bad-name");
  return seal(ring.vaultKey, new TextEncoder().encode(text), where(ring));
};

export const openVaultName = (
  ring: Keyring,
  sealed: Uint8Array,
): Result<string, "not-authentic" | "bad-name"> => {
  const opened = open(ring.vaultKey, sealed, where(ring));
  if (!opened.ok) return err("not-authentic");
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  try {
    const name = text.decode(opened.value);
    return cleaned(name) === name ? ok(name) : err("bad-name");
  } catch {
    return err("bad-name");
  }
};
