/**
 * A new login or a change to one (K-306 part 1), in a dialog: title, username, password and
 * website, and for a new entry the vault it goes into (only vaults this account may edit in)
 */
import { Button, Dialog, Input, m } from "@kennwort/ui";
import { createSignal, For, Show } from "solid-js";
import { selectClass } from "../vaults/role-select.tsx";
import type { LoginInput } from "./entries.ts";
import type { SaveError } from "./entry-store.ts";

export type EditorVault = { idText: string; name: string };
type Saved = { ok: true; value: string } | { ok: false; error: SaveError };

const errorText = (error: SaveError) =>
  error === "read-only" ? m.entry_editor_read_only() : m.entry_editor_failed();

export const EntryEditor = (props: {
  title: string;
  initial: LoginInput;
  /** The vaults to choose from for a new entry; none for a change */
  vaults?: EditorVault[] | undefined;
  onSave: (input: LoginInput, vaultIdText: string | undefined) => Promise<Saved>;
  onClose: (savedId?: string) => void;
}) => {
  const [input, setInput] = createSignal(props.initial);
  const [vault, setVault] = createSignal(props.vaults?.[0]?.idText ?? "");
  const [error, setError] = createSignal<SaveError>();
  const [busy, setBusy] = createSignal(false);
  const set = (key: keyof LoginInput) => (event: { currentTarget: HTMLInputElement }) =>
    setInput({ ...input(), [key]: event.currentTarget.value });
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!input().title.trim()) return;
    setBusy(true);
    const saved = await props.onSave(input(), props.vaults ? vault() : undefined);
    setBusy(false);
    if (saved.ok) props.onClose(saved.value);
    else setError(saved.error);
  };
  return (
    <Dialog open onClose={() => props.onClose()} title={props.title}>
      <form class="grid gap-3 p-4 pt-2" onSubmit={submit}>
        <Show when={props.vaults}>
          {(vaults) => (
            <label class="grid gap-1 text-xs font-medium">
              {m.entry_editor_vault()}
              <select
                class={selectClass}
                value={vault()}
                onChange={(event) => setVault(event.currentTarget.value)}
              >
                <For each={vaults()}>{(v) => <option value={v.idText}>{v.name}</option>}</For>
              </select>
            </label>
          )}
        </Show>
        <Input
          label={m.entry_editor_title()}
          value={input().title}
          required
          onInput={set("title")}
        />
        <Input label={m.field_username()} value={input().username} onInput={set("username")} />
        <Input
          label={m.field_password()}
          type="password"
          autocomplete="new-password"
          value={input().password}
          onInput={set("password")}
        />
        <Input
          label={m.field_website()}
          type="url"
          value={input().website}
          onInput={set("website")}
        />
        <Show when={error()}>
          {(e) => (
            <p
              class="rounded-lg border border-danger px-3 py-2 text-[13px] text-danger"
              role="alert"
            >
              {errorText(e())}
            </p>
          )}
        </Show>
        <Button type="submit" variant="primary" disabled={busy()}>
          {m.entry_editor_save()}
        </Button>
      </form>
    </Dialog>
  );
};
