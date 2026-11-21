/**
 * What the save prompt shows (K-404), decided from the account and the loaded entries: nothing
 * (`close`) for a login Kennwort already knows or a site on the never list, "Entsperren und
 * speichern" while locked, an offer to save or update, or why it cannot: a vault this account may
 * only read, or one with a key rotation due after someone left (P-11), takes no write.
 */
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import type { Load } from "../account/load-entries.ts";
import type { Phase } from "../account/popup-account.ts";
import { offerFor } from "../save/compare.ts";
import type { Capture } from "../save/messages.ts";

export type VaultChoice = { idText: string; name: string | undefined };

export type PromptView =
  | { kind: "waiting" }
  | { kind: "locked" }
  | { kind: "close" }
  | { kind: "failed" }
  | { kind: "new"; vaults: VaultChoice[] }
  | { kind: "no-vault" }
  | { kind: "changed"; entry: ShownEntry }
  | { kind: "read-only" }
  | { kind: "rotation-due" };

export type ViewInput = {
  phase: Phase;
  load: Load;
  entries: readonly ShownEntry[];
  vaults: readonly Vault[];
  /** The account state's never list (AccountState.neverSave) */
  neverSave: readonly string[];
  capture: Capture;
};

const writable = (vault: Vault) => vault.role !== "read" && !vault.log.rotationDue;

export const promptView = (input: ViewInput): PromptView => {
  if (input.phase === "locked" || input.phase === "connect") return { kind: "locked" };
  if (input.phase !== "open" || input.load === "loading") return { kind: "waiting" };
  if (input.neverSave.includes(input.capture.host)) return { kind: "close" };
  if (input.load !== "ready") return { kind: "failed" };
  const offer = offerFor(input.entries, input.capture);
  if (offer.kind === "same") return { kind: "close" };
  if (offer.kind === "changed") {
    const vault = input.vaults.find((v) => v.idText === offer.entry.vault);
    if (!vault || vault.role === "read") return { kind: "read-only" };
    if (vault.log.rotationDue) return { kind: "rotation-due" };
    return { kind: "changed", entry: offer.entry };
  }
  const vaults = input.vaults
    .filter(writable)
    .map((vault) => ({ idText: vault.idText, name: vault.name }));
  return vaults.length > 0 ? { kind: "new", vaults } : { kind: "no-vault" };
};
