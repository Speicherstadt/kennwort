/**
 * What the opened app does with entries (K-306 parts 1, 2 and 5): the store loads them from every
 * vault the vault store opened, and the editor writes a new entry of any type into a vault this
 * account may edit in, or changes one; after saving, the app shows the entry. A star in the detail
 * marks an entry as a favorite.
 */
import { m } from "@kennwort/ui";
import { createSignal, Show } from "solid-js";
import type { Navigation } from "../navigation.ts";
import type { Session } from "../session/session.ts";
import type { VaultStore } from "../vaults/vault-store.ts";
import { type ShownEntry, shown } from "./entries.ts";
import { EntryEditor } from "./entry-editor.tsx";
import { contentOf, type EntryInput, inputOf, newInput } from "./entry-input.ts";
import { createEntryStore, type ServerFor } from "./entry-store.ts";

/** What the editor opened with: the form starts from it, a sync while editing leaves it be */
type Editing =
  | { kind: "new"; initial: EntryInput }
  | { kind: "change"; entry: ShownEntry; initial: EntryInput };

export const createEntries = (serverFor: ServerFor, session: Session) => {
  const store = createEntryStore(serverFor, session);
  const [editing, setEditing] = createSignal<Editing>();
  const entries = () => store.entries().map(shown);
  const storedOf = (id: string) => store.entries().find((e) => e.idText === id);
  const editor = (props: { nav: Navigation; vaults: VaultStore }) => {
    const writable = () => {
      const s = props.vaults.shown();
      return s.state === "ready"
        ? s.vaults
            .filter((v) => v.role !== "read")
            .map((v) => ({ idText: v.idText, name: v.name ?? m.vaults_unnamed() }))
        : [];
    };
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
              vaults={what.kind === "new" ? writable() : undefined}
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
    editor,
    startNew: () => setEditing({ kind: "new", initial: newInput("login") }),
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
