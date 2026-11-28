/**
 * Adding people to a vault (K-608):
 * - Desktop & tablet: combobox field with chips, inline suggestions inside the field (not floating),
 *   role popover menu (default "read"), primary "Add" button, entry-count hint and optional expiry.
 * - Phone (< 600px): full-width "Add people" button opening MobileAddSheet.
 */
import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import type { Certificate, MemberView, VaultRole } from "@kennwort/core";
import { Button, Icon, m } from "@kennwort/ui";
import { Plus, Search } from "@kennwort/ui/icons";
import { createEffect, createMemo, createSignal, createUniqueId, Show } from "solid-js";
import { endOfDay, today } from "./day.ts";
import { type AddCandidate, addCandidates } from "./vault-access.ts";
import {
  addHintText,
  CandidateListbox,
  ExpiryRow,
  PickedChips,
  RolePickerButton,
} from "./vault-add-parts.tsx";
import { MobileAddSheet } from "./vault-add-sheet.tsx";

type PickedPerson = AddCandidate & { certificate: Certificate };

const createAddBarState = (
  vault: () => Vault,
  people: () => MemberView[],
  onAdd: (chosen: PickedPerson[], role: VaultRole, validUntil: number) => Promise<string[]>,
) => {
  const [query, setQuery] = createSignal("");
  const [picked, setPicked] = createSignal<PickedPerson[]>([]);
  const [role, setRole] = createSignal<VaultRole>("read");
  const [open, setOpen] = createSignal(false);
  const [highlight, setHighlight] = createSignal(0);
  const [untilOn, setUntilOn] = createSignal(false);
  const [until, setUntil] = createSignal("");

  const vaultId = createMemo(() => vault().idText);
  createEffect(vaultId, () => {
    setQuery("");
    setPicked([]);
    setRole("read");
    setOpen(false);
    setHighlight(0);
    setUntilOn(false);
    setUntil("");
  });

  const candidates = () =>
    addCandidates(vault(), people(), query(), new Set(picked().map((p) => p.key)));
  const selectable = () => candidates().filter((c) => !c.unconfirmed);

  const pick = (candidate: AddCandidate, focus: () => void) => {
    const certificate = candidate.certificate;
    if (candidate.unconfirmed || !certificate) return;
    setPicked((prev) => [...prev, { ...candidate, certificate }]);
    setQuery("");
    setHighlight(0);
    focus();
  };

  const submit = async () => {
    const chosen = picked();
    if (chosen.length === 0) return;
    const added = new Set(await onAdd(chosen, role(), untilOn() ? endOfDay(until()) : 0));
    if (added.size === chosen.length) {
      setPicked([]);
      setQuery("");
      setOpen(false);
      setUntilOn(false);
      setUntil("");
    } else if (added.size > 0) {
      setPicked((prev) => prev.filter((p) => !added.has(p.key)));
    }
  };

  const onKeyDown = (event: KeyboardEvent, focus: () => void) => {
    const opts = selectable();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((i) => Math.max(0, Math.min(Math.max(0, opts.length - 1), i + step)));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = opts[highlight()];
      if (query().trim() && target) pick(target, focus);
      else if (picked().length > 0) void submit();
      else if (open() && target) pick(target, focus);
    } else if (event.key === "Backspace" && !query() && picked().length > 0) {
      setPicked((prev) => prev.slice(0, -1));
    } else if (event.key === "Escape" && open()) {
      event.preventDefault();
      setOpen(false);
    }
  };

  return {
    query,
    setQuery,
    picked,
    setPicked,
    role,
    setRole,
    open,
    setOpen,
    highlight,
    setHighlight,
    untilOn,
    setUntilOn,
    until,
    setUntil,
    candidates,
    selectable,
    pick,
    submit,
    onKeyDown,
  };
};

export const VaultAddBar = (props: {
  vault: Vault;
  people: MemberView[];
  entryCount: number;
  busy: boolean;
  onAdd: (people: PickedPerson[], role: VaultRole, validUntil: number) => Promise<string[]>;
}) => {
  const listboxId = createUniqueId();
  let inputEl: HTMLInputElement | undefined;
  let containerEl: HTMLDivElement | undefined;
  const [sheetOpen, setSheetOpen] = createSignal(false);
  const s = createAddBarState(
    () => props.vault,
    () => props.people,
    (chosen, role, validUntil) => props.onAdd(chosen, role, validUntil),
  );
  const focusInput = () => inputEl?.focus();

  return (
    <>
      <div
        ref={(el) => {
          containerEl = el;
        }}
        class="grid gap-2.5 @max-[600px]:hidden"
        onFocusOut={(event) => {
          const next = event.relatedTarget as Node | null;
          if (!next || !containerEl?.contains(next)) s.setOpen(false);
        }}
      >
        <div class="relative flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-background p-1.5 transition-colors focus-within:ring-2 focus-within:ring-accent">
          <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1 px-1.5">
            <Show when={s.picked().length === 0}>
              <Icon icon={Search} size={15} class="mr-0.5 shrink-0 text-muted-foreground" />
            </Show>
            <PickedChips
              picked={s.picked()}
              onUnpick={(key) => {
                s.setPicked((prev) => prev.filter((p) => p.key !== key));
                focusInput();
              }}
            />
            <input
              ref={(el) => {
                inputEl = el;
              }}
              type="text"
              autocomplete="off"
              role="combobox"
              aria-expanded={s.open() ? "true" : "false"}
              aria-controls={listboxId}
              aria-label={m.vault_access_add_label()}
              placeholder={
                s.picked().length > 0 ? m.vault_access_add_more() : m.vault_access_add_placeholder()
              }
              value={s.query()}
              class="h-8 min-w-28 flex-1 bg-transparent text-[13.5px] outline-none"
              onFocus={() => s.setOpen(true)}
              onInput={(event) => {
                s.setQuery(event.currentTarget.value);
                s.setOpen(true);
                s.setHighlight(0);
              }}
              onKeyDown={(event) => s.onKeyDown(event, focusInput)}
            />
          </div>
          <RolePickerButton role={s.role()} busy={props.busy} onChange={s.setRole} />
          <Button
            variant="primary"
            disabled={props.busy || s.picked().length === 0}
            onClick={s.submit}
          >
            {m.vault_access_add_button()}
          </Button>
          <Show when={s.open()}>
            <CandidateListbox
              id={listboxId}
              candidates={s.candidates()}
              highlightedKey={s.selectable()[s.highlight()]?.key}
              hasQuery={Boolean(s.query().trim())}
              onPick={(candidate) => s.pick(candidate, focusInput)}
            />
          </Show>
        </div>
        <ExpiryRow
          hint={addHintText(s.picked().length, props.entryCount, s.role())}
          untilOn={s.untilOn()}
          until={s.until()}
          onEnable={() => {
            s.setUntilOn(true);
            if (!s.until()) s.setUntil(today());
          }}
          onDisable={() => {
            s.setUntilOn(false);
            s.setUntil("");
          }}
          onChange={s.setUntil}
        />
      </div>
      <div class="hidden @max-[600px]:block">
        <Button
          variant="primary"
          class="h-11 w-full text-[15px]"
          disabled={props.busy}
          onClick={() => setSheetOpen(true)}
        >
          <Icon icon={Plus} size={16} />
          {m.vault_access_add_mobile()}
        </Button>
      </div>
      <MobileAddSheet
        open={sheetOpen()}
        vault={props.vault}
        people={props.people}
        entryCount={props.entryCount}
        busy={props.busy}
        onClose={() => setSheetOpen(false)}
        onAdd={(chosen, chosenRole) => props.onAdd(chosen, chosenRole, 0)}
      />
    </>
  );
};
