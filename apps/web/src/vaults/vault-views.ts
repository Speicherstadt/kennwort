/**
 * What the frame shows of the vaults as loaded (K-305, K-307): the company's people, the vaults'
 * names, whether a new entry has a vault to go to, and whose change marks name whom
 */
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import { encodeBytes, type MemberView } from "@kennwort/core";
import { m } from "@kennwort/ui";
import type { VaultStore } from "./vault-store.ts";

/** The company's people as the vaults' load checked them; none before it */
export const peopleOf = (store: VaultStore) => {
  const shown = store.shown();
  return shown.state === "ready" ? shown.people : [];
};

/** What the frame shows of the vaults: their names, and whether a new entry has a vault to go to */
export const vaultViews = (store: VaultStore) => {
  /** A new entry needs a vault this account may write in, loaded, with no rotation due (P-11) */
  const canWrite = () => {
    const shown = store.shown();
    return (
      shown.state === "ready" && shown.vaults.some((v) => v.role !== "read" && !v.log.rotationDue)
    );
  };
  const vaultName = (id: string) => {
    const shown = store.shown();
    const vault = shown.state === "ready" ? shown.vaults.find((v) => v.idText === id) : undefined;
    return vault?.name ?? m.vaults_unnamed();
  };
  const shownVaults = () => {
    const shown = store.shown();
    return shown.state === "ready" ? shown.vaults : undefined;
  };
  return { canWrite, vaultName, shownVaults };
};

/** The names of whom the change marks name, from the company's members list (K-307) */
export const namedMarks = (entries: ShownEntry[], people: MemberView[]) =>
  entries.map((entry) =>
    entry.marks?.length
      ? {
          ...entry,
          marks: entry.marks.map((mark) => ({
            ...mark,
            name: people.find((p) => encodeBytes(p.accountId) === mark.account)?.name ?? null,
          })),
        }
      : entry,
  );
