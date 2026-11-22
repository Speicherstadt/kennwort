/**
 * What the passkey prompt shows (K-406), decided from the account, the loaded entries and the
 * ceremony the service worker checked: the browser's own WebAuthn (`fallback`) while Kennwort is
 * locked, when the entries do not load or when no stored passkey fits a sign-in; otherwise the
 * offer to save a new passkey into a vault this account may write, or the passkeys to sign in with.
 * A sign-in offers only passkeys for exactly the ceremony's rpId, and of those only the ones the
 * page allows (allowCredentials), as an authenticator does (WebAuthn Level 3, §6.3.3 step 3).
 */
import type { StoredEntry } from "@kennwort/client/entries/entries.ts";
import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import { encodeBytes } from "@kennwort/core";
import { passkeyOf } from "@kennwort/core/webauthn";
import type { Load } from "../account/load-entries.ts";
import type { Phase } from "../account/popup-account.ts";
import type { Ceremony } from "../passkey/messages.ts";
import type { VaultChoice } from "./prompt-view.ts";

/** A stored passkey the user may sign in with */
export type PasskeyChoice = { entryId: string; name: string };

export type PasskeyView =
  | { kind: "waiting" }
  | { kind: "fallback" }
  | { kind: "create"; vaults: VaultChoice[] }
  | { kind: "excluded" }
  | { kind: "no-vault" }
  | { kind: "get"; choices: PasskeyChoice[] };

export type PasskeyViewInput = {
  phase: Phase;
  load: Load;
  entries: readonly StoredEntry[];
  vaults: readonly Vault[];
  ceremony: Ceremony;
};

const writable = (vault: Vault) => vault.role !== "read" && !vault.log.rotationDue;

/** The stored passkeys for exactly this rpId, with their credential IDs as base64url */
const passkeysFor = (entries: readonly StoredEntry[], rpId: string) =>
  entries.flatMap((entry) => {
    const passkey = passkeyOf(entry.content);
    if (!passkey || passkey.rpId !== rpId) return [];
    return [{ entry, passkey, credentialId: encodeBytes(passkey.credentialId) }];
  });

const createView = (input: PasskeyViewInput, exclude: readonly string[]): PasskeyView => {
  const known = passkeysFor(input.entries, input.ceremony.rpId);
  if (known.some((p) => exclude.includes(p.credentialId))) return { kind: "excluded" };
  const vaults = input.vaults
    .filter(writable)
    .map((vault) => ({ idText: vault.idText, name: vault.name }));
  return vaults.length > 0 ? { kind: "create", vaults } : { kind: "no-vault" };
};

const getView = (input: PasskeyViewInput, allow: readonly string[]): PasskeyView => {
  const choices = passkeysFor(input.entries, input.ceremony.rpId)
    .filter((p) => allow.length === 0 || allow.includes(p.credentialId))
    .map(({ entry, passkey }) => ({
      entryId: entry.idText,
      name: passkey.username || passkey.displayName || entry.content.title,
    }));
  return choices.length > 0 ? { kind: "get", choices } : { kind: "fallback" };
};

export const passkeyView = (input: PasskeyViewInput): PasskeyView => {
  if (input.phase === "locked" || input.phase === "connect") return { kind: "fallback" };
  if (input.phase !== "open" || input.load === "loading") return { kind: "waiting" };
  if (input.load !== "ready") return { kind: "fallback" };
  return input.ceremony.kind === "create"
    ? createView(input, input.ceremony.exclude)
    : getView(input, input.ceremony.allow);
};
