/**
 * Per-member "⋯" action menu (K-608): Popover API on desktop/tablet, bottom sheet on phone.
 * Shows the member header, the three roles as menuitemradio, time-limit trigger, and remove.
 */
import type { VaultRole } from "@kennwort/core";
import { anchoredBelow, anchorName, cn, Icon, m } from "@kennwort/ui";
import { Check, Clock, Ellipsis } from "@kennwort/ui/icons";
import { createUniqueId, For } from "solid-js";
import { dateText } from "./day.ts";
import { displayName, initialsOf } from "./vault-access.ts";
import { roleIcon, roleShort } from "./vault-aside.tsx";
import type { VaultMember } from "./vault-members.ts";
import { roleText } from "./vault-text.ts";

/** Menu lists read → edit → manage, matching the prototype */
const MENU_ROLES: readonly VaultRole[] = ["read", "edit", "manage"];

export const VaultMemberMenu = (props: {
  member: VaultMember;
  vaultName: string;
  busy: boolean;
  onRole: (role: VaultRole) => void;
  onUntil: () => void;
  onRemove: () => void;
}) => {
  const id = createUniqueId();
  let menu: HTMLDivElement | undefined;
  let trigger: HTMLButtonElement | undefined;
  const name = () => displayName(props.member.name);
  const close = () => {
    menu?.hidePopover();
    trigger?.focus();
  };

  return (
    <>
      <button
        ref={(el) => {
          trigger = el;
        }}
        type="button"
        popovertarget={id}
        aria-haspopup="menu"
        aria-controls={id}
        aria-label={m.vault_access_member_menu({ name: name() })}
        disabled={props.busy}
        style={anchorName(id)}
        class="grid size-[34px] shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 @max-[600px]:size-11"
      >
        <Icon icon={Ellipsis} size={18} />
      </button>
      <div
        id={id}
        ref={(el) => {
          menu = el;
        }}
        popover="auto"
        role="menu"
        aria-label={name()}
        style={anchoredBelow(id)}
        class={cn(
          "w-[272px] rounded-xl border border-border bg-background p-1.5 text-foreground shadow-lg",
          "max-md:fixed! max-md:inset-x-0! max-md:top-auto! max-md:right-0! max-md:bottom-0! max-md:left-0! max-md:m-0! max-md:w-auto! max-md:rounded-t-[20px] max-md:rounded-b-none max-md:border-b-0 max-md:p-2 max-md:pb-4.5 max-md:[position-anchor:none]! max-md:backdrop:bg-black/50",
        )}
      >
        <div
          aria-hidden="true"
          class="mx-auto my-1 hidden h-1 w-9 rounded-full bg-border max-md:block"
        />
        <div class="flex items-center gap-2.5 px-2.5 pt-2 pb-1.5 text-[13px] font-medium">
          <span
            aria-hidden="true"
            class="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[9px] font-semibold"
          >
            {initialsOf(name())}
          </span>
          <span class="truncate">{name()}</span>
        </div>
        <For each={MENU_ROLES}>
          {(role) => {
            const active = () => props.member.role === role;
            return (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={active() ? "true" : "false"}
                disabled={props.busy}
                class="flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent focus:bg-accent focus:outline-none max-md:min-h-[54px] max-md:items-center"
                onClick={() => {
                  close();
                  if (!active()) props.onRole(role);
                }}
              >
                <span aria-hidden="true" class="mt-0.5 w-4 shrink-0 text-foreground">
                  {active() && <Icon icon={Check} size={15} />}
                </span>
                <span class="flex min-w-0 flex-1 flex-col leading-snug">
                  <span class="text-[13px] max-md:text-[15px]">{roleText(role)}</span>
                  <span class="text-xs text-muted-foreground">{roleShort(role)}</span>
                </span>
                <span aria-hidden="true" class="mt-0.5 shrink-0 text-muted-foreground">
                  <Icon icon={roleIcon(role)} size={13} />
                </span>
              </button>
            );
          }}
        </For>
        <hr class="my-1.5 border-border" />
        <button
          type="button"
          role="menuitem"
          disabled={props.busy}
          class="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-accent focus:bg-accent focus:outline-none max-md:min-h-[54px] max-md:text-[15px]"
          onClick={() => {
            close();
            props.onUntil();
          }}
        >
          <span aria-hidden="true" class="w-4 shrink-0 text-muted-foreground">
            <Icon icon={Clock} size={15} />
          </span>
          <span>
            {props.member.validUntil > 0
              ? m.vault_access_menu_limited({ date: dateText(props.member.validUntil) })
              : m.vault_access_menu_limit()}
          </span>
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={props.busy}
          class="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-danger transition-colors hover:bg-accent focus:bg-accent focus:outline-none max-md:min-h-[54px] max-md:text-[15px]"
          onClick={() => {
            close();
            props.onRemove();
          }}
        >
          <span aria-hidden="true" class="w-4 shrink-0" />
          <span>{m.vault_access_menu_remove({ vault: props.vaultName })}</span>
        </button>
      </div>
    </>
  );
};
