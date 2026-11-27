/**
 * Phone bottom sheet for adding people to a vault (K-608): search input, checkbox list with
 * unconfirmed people disabled, role cards, and primary submit button.
 */
import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import type { Certificate, MemberView, VaultRole } from "@kennwort/core";
import { Button, Checkbox, cn, Dialog, Icon, m } from "@kennwort/ui";
import { Search } from "@kennwort/ui/icons";
import { createSignal, For, Show } from "solid-js";
import { type AddCandidate, addCandidates, initialsOf } from "./vault-access.ts";
import { roleIcon, roleShort } from "./vault-aside.tsx";
import { roleText } from "./vault-text.ts";

const ROLES: readonly VaultRole[] = ["read", "edit", "manage"];

const SheetCandidateList = (props: {
  list: AddCandidate[];
  picked: string[];
  hasQuery: boolean;
  onToggle: (key: string, checked: boolean) => void;
}) => (
  <div class="max-h-60 divide-y divide-border overflow-auto rounded-xl border border-border">
    <Show
      when={props.list.length > 0}
      fallback={
        <p class="px-3 py-3 text-xs text-muted-foreground">
          {props.hasQuery ? m.vault_access_none_found() : m.vault_access_all_in()}
        </p>
      }
    >
      <For each={props.list}>
        {(candidate) => (
          <label
            class={cn(
              "flex min-h-14 items-center gap-3 px-3 py-2",
              candidate.unconfirmed ? "cursor-not-allowed opacity-55" : "cursor-pointer",
            )}
          >
            <Checkbox
              checked={props.picked.includes(candidate.key)}
              disabled={candidate.unconfirmed}
              onChange={(event) => props.onToggle(candidate.key, event.currentTarget.checked)}
            />
            <span
              aria-hidden="true"
              class="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold"
            >
              {initialsOf(candidate.name)}
            </span>
            <span class="flex min-w-0 flex-1 flex-col leading-snug">
              <span class="truncate text-[15px]">{candidate.name}</span>
              <Show when={candidate.unconfirmed}>
                <span class="text-xs text-muted-foreground">{m.vault_requests_unconfirmed()}</span>
              </Show>
            </span>
          </label>
        )}
      </For>
    </Show>
  </div>
);

const SheetRoleCards = (props: { role: VaultRole; onChange: (role: VaultRole) => void }) => (
  <div class="grid gap-2" role="radiogroup" aria-label={m.vault_members_new_role()}>
    <For each={ROLES}>
      {(item) => {
        const active = () => props.role === item;
        return (
          <label
            class={cn(
              "relative flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5",
              active() ? "border-foreground bg-accent" : "border-border",
            )}
          >
            <input
              type="radio"
              name="vault-add-sheet-role"
              value={item}
              checked={active()}
              class="sr-only"
              onChange={() => props.onChange(item)}
            />
            <span
              aria-hidden="true"
              class="grid size-7 shrink-0 place-items-center rounded-lg bg-accent"
            >
              <Icon icon={roleIcon(item)} size={14} />
            </span>
            <span class="flex flex-col leading-snug">
              <span class="text-[15px] font-medium">{roleText(item)}</span>
              <span class="text-xs text-muted-foreground">{roleShort(item)}</span>
            </span>
          </label>
        );
      }}
    </For>
  </div>
);

export const MobileAddSheet = (props: {
  open: boolean;
  vault: Vault;
  people: MemberView[];
  entryCount: number;
  busy: boolean;
  onClose: () => void;
  onAdd: (
    people: (AddCandidate & { certificate: Certificate })[],
    role: VaultRole,
  ) => Promise<string[]>;
}) => {
  const [query, setQuery] = createSignal("");
  const [picked, setPicked] = createSignal<string[]>([]);
  const [role, setRole] = createSignal<VaultRole>("read");
  const list = () => addCandidates(props.vault, props.people, query(), new Set());
  const toggle = (key: string, checked: boolean) =>
    setPicked((prev) => (checked ? [...prev, key] : prev.filter((k) => k !== key)));
  const resetAndClose = () => {
    setQuery("");
    setPicked([]);
    setRole("read");
    props.onClose();
  };
  const submit = async () => {
    const all = addCandidates(props.vault, props.people, "", new Set());
    const chosen = picked()
      .map((k) => all.find((c) => c.key === k))
      .filter((c): c is AddCandidate & { certificate: Certificate } => Boolean(c?.certificate));
    if (chosen.length === 0) return;
    const added = new Set(await props.onAdd(chosen, role()));
    if (added.size === chosen.length) {
      resetAndClose();
    } else if (added.size > 0) {
      setPicked((prev) => prev.filter((k) => !added.has(k)));
    }
  };
  return (
    <Dialog
      open={props.open}
      onClose={resetAndClose}
      size="sm"
      title={m.vault_access_add_mobile()}
      description={m.vault_access_sheet_desc({
        count: String(props.entryCount),
        vault: props.vault.name ?? m.vaults_unnamed(),
      })}
      footer={
        <>
          <span class="text-center text-xs text-muted-foreground md:mr-auto md:text-left">
            {picked().length > 0
              ? m.vault_access_sheet_selected({ count: String(picked().length) })
              : m.vault_access_sheet_none()}
          </span>
          <Button disabled={props.busy} onClick={resetAndClose}>
            {m.ui_cancel()}
          </Button>
          <Button variant="primary" disabled={props.busy || picked().length === 0} onClick={submit}>
            {picked().length > 1
              ? m.vault_access_add_button_many({ count: String(picked().length) })
              : m.vault_access_add_button()}
          </Button>
        </>
      }
    >
      <div class="relative">
        <Icon
          icon={Search}
          size={16}
          class="pointer-events-none absolute top-3.5 left-3 text-muted-foreground"
        />
        <input
          type="search"
          value={query()}
          placeholder={m.vault_access_sheet_search()}
          aria-label={m.vault_access_sheet_search_label()}
          class="h-11 w-full rounded-lg border border-border bg-background pr-3 pl-9 text-[15px]"
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
      </div>
      <SheetCandidateList
        list={list()}
        picked={picked()}
        hasQuery={Boolean(query())}
        onToggle={toggle}
      />
      <SheetRoleCards role={role()} onChange={setRole} />
    </Dialog>
  );
};
