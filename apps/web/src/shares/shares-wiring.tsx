/**
 * What the opened app does with shares (K-305 part 6b, P-10): the entries shared with this account
 * load with the vaults and show read-only under "Mit mir geteilt"; "Teilen" on an entry of a vault
 * this account may edit opens the share dialog.
 */
import { m } from "@kennwort/ui";
import { createSignal, Show } from "solid-js";
import { type ShownEntry, shown } from "../entries/entries.ts";
import type { Session } from "../session/session.ts";
import type { ShareApi } from "../session/shares-api.ts";
import type { StateDeps } from "../session/state-sync.ts";
import type { VaultStore } from "../vaults/vault-store.ts";
import type { Loaded } from "../vaults/vaults.ts";
import { ShareDialog } from "./share-dialog.tsx";
import { createSharedWithMe, type SharedEntry } from "./shared-with-me.ts";
import { type EntryKeys, mayShare } from "./shares.ts";

/** An entry shared with this account as list and detail show it: never editable */
export const shownShared = (entry: SharedEntry): ShownEntry => ({
  ...shown({ ...entry, role: "read" }),
  sharedBy: entry.sharedBy ?? m.share_unnamed(),
});

export const createSharing = (api: ShareApi & StateDeps, session: Session, keys: EntryKeys) => {
  const shared = createSharedWithMe(api, session);
  const [sharing, setSharing] = createSignal<ShownEntry>();
  const dialog = (props: { vaults: VaultStore }) => {
    /** The entry with its vault, if this account may share from it, and what the dialog checks with */
    const target = () => {
      const entry = sharing();
      const s = props.vaults.shown();
      if (!entry || s.state !== "ready") return undefined;
      const vault = s.vaults.find((v) => v.idText === entry.vault);
      return vault && mayShare(vault)
        ? { entry, vault, people: s.people, trust: s.trust }
        : undefined;
    };
    return (
      <Show when={target()} keyed>
        {(t) => (
          <ShareDialog
            {...t}
            api={api}
            session={session}
            keys={keys}
            onClose={() => setSharing(undefined)}
          />
        )}
      </Show>
    );
  };
  return {
    load: (loaded: Loaded) => shared.load(loaded.trust, loaded.people),
    entries: () => shared.entries().map(shownShared),
    start: (entry: ShownEntry) => setSharing(entry),
    dialog,
  };
};
