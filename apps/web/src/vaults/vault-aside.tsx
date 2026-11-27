/**
 * Right column (and below-members section on tablet/phone) of Team → Vaults (K-608): verified
 * membership log history, role legend, and signed-log trust note.
 */
import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import type { MemberView, VaultRole } from "@kennwort/core";
import { cn, Icon, m } from "@kennwort/ui";
import {
  ArrowLeftRight,
  Eye,
  type IconNode,
  KeyRound,
  Minus,
  Pencil,
  Plus,
  Settings,
  ShieldCheck,
  Vault as VaultIcon,
} from "@kennwort/ui/icons";
import { createSignal, For, Show } from "solid-js";
import { type HistoryKind, historyItems, ROLE_ORDER } from "./vault-access.ts";
import { roleText } from "./vault-text.ts";

export const roleIcon = (role: VaultRole): IconNode =>
  role === "manage" ? Settings : role === "edit" ? Pencil : Eye;

export const roleDesc = (role: VaultRole): string =>
  role === "manage"
    ? m.vault_access_role_manage_desc()
    : role === "edit"
      ? m.vault_access_role_edit_desc()
      : m.vault_access_role_read_desc();

export const roleShort = (role: VaultRole): string =>
  role === "manage"
    ? m.vault_access_role_manage_short()
    : role === "edit"
      ? m.vault_access_role_edit_short()
      : m.vault_access_role_read_short();

const historyIcon = (kind: HistoryKind): { icon: IconNode; tone: string } => {
  switch (kind) {
    case "add":
      return { icon: Plus, tone: "bg-success-surface text-success" };
    case "remove":
      return { icon: Minus, tone: "bg-danger-surface text-danger" };
    case "rotate":
      return { icon: KeyRound, tone: "bg-warning-surface text-warning" };
    case "role":
      return { icon: ArrowLeftRight, tone: "bg-accent text-muted-foreground" };
    case "rekey":
      return { icon: KeyRound, tone: "bg-accent text-muted-foreground" };
    case "create":
      return { icon: VaultIcon, tone: "bg-accent text-muted-foreground" };
  }
};

export const VaultAside = (props: { vault: Vault; people: MemberView[] }) => {
  const [expanded, setExpanded] = createSignal(false);
  const all = () => historyItems(props.vault, props.people);
  const shown = () => (expanded() ? all() : all().slice(0, 5));

  return (
    <aside
      aria-label={m.vault_access_history_title()}
      class="flex flex-col gap-5 border-l border-border bg-background px-5 py-5.5 @max-[1020px]:grid @max-[1020px]:grid-cols-2 @max-[1020px]:gap-6 @max-[1020px]:border-t @max-[1020px]:border-l-0 @max-[1020px]:px-7 @max-[1020px]:py-5 @max-[600px]:grid-cols-1 @max-[600px]:px-4"
    >
      <div>
        <h3 class="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
          {m.vault_access_history_title()}
        </h3>
        <ol class="mt-3 flex flex-col">
          <For each={shown()}>
            {(item, index) => {
              const badge = historyIcon(item.kind);
              return (
                <li class="relative flex gap-2.5 pb-3.5 text-[12.5px] leading-snug last:pb-0">
                  <Show when={index() < shown().length - 1}>
                    <span
                      aria-hidden="true"
                      class="absolute top-6 bottom-0.5 left-[11px] w-px bg-border"
                    />
                  </Show>
                  <span
                    aria-hidden="true"
                    class={cn(
                      "grid size-[23px] shrink-0 place-items-center rounded-full",
                      badge.tone,
                    )}
                  >
                    <Icon icon={badge.icon} size={12} />
                  </span>
                  <span class="min-w-0 flex-1">
                    {item.text}
                    <Show when={item.role}>{(r) => <> · {r()}</>}</Show>
                    <span class="block text-[11.5px] text-muted-foreground tabular-nums">
                      {item.when}
                    </span>
                  </span>
                </li>
              );
            }}
          </For>
        </ol>
        <Show when={!expanded() && all().length > 5}>
          <button
            type="button"
            class="mt-2 cursor-pointer text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => setExpanded(true)}
          >
            {m.vault_access_history_show_all({ count: String(all().length) })}
          </button>
        </Show>
      </div>
      <div>
        <h3 class="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
          {m.vault_access_roles_title()}
        </h3>
        <div class="mt-3 flex flex-col gap-2">
          <For each={ROLE_ORDER}>
            {(role) => (
              <div class="flex gap-2.5 text-[12.5px] leading-snug">
                <span
                  aria-hidden="true"
                  class="grid size-[22px] shrink-0 place-items-center rounded-md bg-accent text-foreground"
                >
                  <Icon icon={roleIcon(role)} size={13} />
                </span>
                <span>
                  <b class="block font-semibold">{roleText(role)}</b>
                  <span class="text-muted-foreground">{roleDesc(role)}</span>
                </span>
              </div>
            )}
          </For>
        </div>
      </div>
      <div class="col-span-full flex items-start gap-2 border-t border-border pt-3.5 text-xs text-muted-foreground">
        <Icon icon={ShieldCheck} size={14} class="mt-0.5 shrink-0 text-success" />
        <span>{m.vault_access_trust_note()}</span>
      </div>
    </aside>
  );
};
