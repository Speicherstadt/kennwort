/**
 * What the opened app does with entries (K-306 parts 1, 2 and 5): the store loads them from every
 * vault the vault store opened, and the editor writes a new entry of any type into a vault this
 * account may edit in, or changes one; after saving, the app shows the entry. A star in the detail
 * marks an entry as a favorite.
 */

import { type LoginInput, type ShownEntry, shown } from "@kennwort/client/entries/entries.ts";
import {
  createEntryStore,
  type EntryCopy,
  type ServerFor,
} from "@kennwort/client/entries/entry-store.ts";
import { m } from "@kennwort/ui";
import { createSignal, Show } from "solid-js";
import type { Navigation } from "../navigation.ts";
import type { Session } from "../session/session.ts";
import type { VaultStore } from "../vaults/vault-store.ts";
import { EntryEditor } from "./entry-editor.tsx";
import { contentOf, type EntryInput, inputOf, loginInput, newInput } from "./entry-input.ts";

/** What the editor opened with: the form starts from it, a sync while editing leaves it be */
type Editing =
  | { kind: "new"; initial: EntryInput }
  | { kind: "change"; entry: ShownEntry; initial: EntryInput };

/** The vaults a new entry may go to: this account may write there, and no rotation is due (P-11) */
export const writableVaults = (vaults: VaultStore) => {
  const s = vaults.shown();
  return s.state === "ready"
    ? s.vaults
        .filter((v) => v.role !== "read" && !v.log.rotationDue)
        .map((v) => ({ idText: v.idText, name: v.name ?? m.vaults_unnamed() }))
    : [];
};

export const createEntries = (serverFor: ServerFor, session: Session, copy?: EntryCopy) => {
  const store = createEntryStore(serverFor, session, copy);
  const [editing, setEditing] = createSignal<Editing>();
  const entries = () => store.entries().map(shown);
  const storedOf = (id: string) => store.entries().find((e) => e.idText === id);
  const editor = (props: { nav: Navigation; vaults: VaultStore }) => {
    const close = (savedId?: string) => {
      setEditing(undefined);
      if (savedId) props.nav.go(`/entries/${savedId}`);
    };
    return (
      <Show when={editing()} keyed>
        {(what) => {
          const stored = () => (what.kind === "change" ? storedOf(what.entry.id) : undefined);
          return (
            <EntryEditor
              title={what.kind === "new" ? m.entry_new_title() : m.entry_change_title()}
              initial={what.initial}
              vaults={what.kind === "new" ? writableVaults(props.vaults) : undefined}
              onSave={(input, vaultIdText) => {
                const before = stored();
                const content = contentOf(input, before?.content, Math.floor(Date.now() / 1000));
                const vault = vaultIdText ?? before?.vaultIdText ?? "";
                return store.save(vault, content, before?.idText);
              }}
              onClose={close}
            />
          );
        }}
      </Show>
    );
  };
  return {
    load: store.load,
    entries,
    /** The entry keys, for sharing an entry and revoking a share (P-10) */
    keys: { keyOf: store.keyOf, refresh: store.refresh, rekey: store.rekey },
    /** After someone left: every entry written anew under the vault's new key (P-11) */
    rotate: store.rotate,
    behind: store.behind,
    /** Reducing someone to reading: their entries written anew under this device (demote.ts) */
    resave: store.resave,
    restore: store.restore,
    restorable: store.restorable,
    /** The vaults and entries as this device knows them, for the exit report */
    seen: store.seen,
    /** Every entry with its decrypted content, for the export (K-504) */
    stored: store.entries,
    editor,
    /** New entries and codes for logins from an import, a batch in one sync (K-501, K-503) */
    saveImport: store.saveImport,
    startNew: () => setEditing({ kind: "new", initial: newInput("login") }),
    /** A login to save from the mobile app's autofill (K-802): saved only from the editor */
    startNewLogin: (login: LoginInput) => setEditing({ kind: "new", initial: loginInput(login) }),
    /** The entry as stored when "Ändern" was pressed is what the form starts from */
    startChange: (entry: ShownEntry) => {
      const before = storedOf(entry.id);
      setEditing({
        kind: "change",
        entry,
        initial: before ? inputOf(before.content) : newInput("login"),
      });
    },
    /** Marks an entry as a favorite or no longer, saved and synced like any change */
    toggleFavorite: (entry: ShownEntry) => {
      const stored = storedOf(entry.id);
      if (!stored) return Promise.resolve({ ok: false, error: "unreachable" } as const);
      const content = { ...stored.content, favorite: !stored.content.favorite };
      return store.save(stored.vaultIdText, content, stored.idText);
    },
  };
};
