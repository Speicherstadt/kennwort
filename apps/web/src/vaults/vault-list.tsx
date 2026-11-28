/**
 * Left column of Team → Vaults (K-608): shared vaults with member count and open-request badge,
 * "New vault" button, and the personal vault section ("Just for you").
 */
import type { Refused, Vault } from "@kennwort/client/vaults/vaults.ts";
import { cn, Icon, m } from "@kennwort/ui";
import {
  ChevronRight,
  Lock,
  Plus,
  TriangleExclamationPoint,
  Vault as VaultIcon,
} from "@kennwort/ui/icons";
import { For, Show } from "solid-js";
import { mayManage } from "./vault-members.ts";

const countLabel = (count: number) =>
  count <= 1 ? m.vault_access_only_you() : m.vault_access_people_many({ count: String(count) });

export const VaultList = (props: {
  shared: Vault[];
  personal: Vault | undefined;
  refused: Refused[];
  selectedId: string | undefined;
  requestCount: (vaultId: string) => number;
  onSelect: (id: string) => void;
  onCreate: () => void;
  hiddenOnPhone: boolean;
}) => (
  <nav
    aria-label={m.vaults_title()}
    class={cn(
      "flex flex-col gap-0.5 overflow-auto border-r border-border bg-muted px-2.5 py-3",
      "@max-[600px]:border-r-0 @max-[600px]:bg-background @max-[600px]:px-2 @max-[600px]:py-1",
      props.hiddenOnPhone && "@max-[600px]:hidden",
    )}
  >
    <div
      aria-hidden="true"
      class="hidden px-2.5 pt-2 pb-1 text-[28px] font-bold tracking-tight @max-[600px]:block"
    >
      {m.vaults_title()}
    </div>
    <div class="px-2.5 pt-2 pb-1.5 text-[11px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
      {m.vault_access_shared_label()}
    </div>
    <For each={props.shared}>
      {(vault) => {
        const current = () => props.selectedId === vault.idText;
        const requests = () => (mayManage(vault) ? props.requestCount(vault.idText) : 0);
        return (
          <button
            type="button"
            aria-current={current() ? "true" : undefined}
            class={cn(
              "flex min-h-[54px] w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors @max-[600px]:min-h-16 @max-[600px]:rounded-none @max-[600px]:border-b @max-[600px]:border-border",
              current()
                ? "bg-background ring-1 ring-border @max-[600px]:bg-transparent @max-[600px]:ring-0"
                : "hover:bg-accent",
            )}
            onClick={() => props.onSelect(vault.idText)}
          >
            <span
              class={cn(
                "grid size-8 shrink-0 place-items-center rounded-lg",
                current()
                  ? "bg-primary text-primary-foreground @max-[600px]:bg-accent @max-[600px]:text-foreground"
                  : "bg-accent text-foreground",
              )}
            >
              <Icon icon={VaultIcon} size={18} />
            </span>
            <span class="flex min-w-0 flex-1 flex-col leading-tight">
              <span class="truncate text-[13px] font-medium @max-[600px]:text-base">
                {vault.name ?? m.vaults_unnamed()}
              </span>
              <span class="text-xs text-muted-foreground @max-[600px]:text-[13px]">
                {countLabel(vault.log.members.size)}
              </span>
            </span>
            <Show when={requests() > 0}>
              <span
                class="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-info px-1.5 text-[11px] font-semibold text-background"
                title={m.vault_access_request_badge()}
              >
                {requests()}
              </span>
            </Show>
            <Icon
              icon={ChevronRight}
              size={18}
              class="hidden shrink-0 text-muted-foreground @max-[600px]:block"
            />
          </button>
        );
      }}
    </For>
    <For each={props.refused}>
      {() => (
        <div class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-danger">
          <Icon icon={TriangleExclamationPoint} size={16} />
          <span class="flex-1">{m.vaults_refused()}</span>
        </div>
      )}
    </For>
    <button
      type="button"
      class="mt-0.5 flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground @max-[600px]:min-h-12"
      onClick={() => props.onCreate()}
    >
      <Icon icon={Plus} size={16} />
      <span>{m.vaults_create_title()}</span>
    </button>
    <Show when={props.personal}>
      {(personal) => {
        const current = () => props.selectedId === personal().idText;
        return (
          <>
            <div class="mt-2.5 px-2.5 pt-2 pb-1.5 text-[11px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
              {m.vault_access_personal_label()}
            </div>
            <button
              type="button"
              aria-current={current() ? "true" : undefined}
              class={cn(
                "flex min-h-[54px] w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors @max-[600px]:min-h-16",
                current()
                  ? "bg-background ring-1 ring-border @max-[600px]:bg-transparent @max-[600px]:ring-0"
                  : "hover:bg-accent",
              )}
              onClick={() => props.onSelect(personal().idText)}
            >
              <span
                class={cn(
                  "grid size-8 shrink-0 place-items-center rounded-lg",
                  current()
                    ? "bg-primary text-primary-foreground @max-[600px]:bg-accent @max-[600px]:text-foreground"
                    : "bg-accent text-foreground",
                )}
              >
                <Icon icon={Lock} size={16} />
              </span>
              <span class="flex min-w-0 flex-1 flex-col leading-tight">
                <span class="truncate text-[13px] font-medium @max-[600px]:text-base">
                  {personal().name ?? m.vaults_personal_name()}
                </span>
                <span class="text-xs text-muted-foreground @max-[600px]:text-[13px]">
                  {m.vault_access_personal_sub()}
                </span>
              </span>
              <Icon
                icon={ChevronRight}
                size={18}
                class="hidden shrink-0 text-muted-foreground @max-[600px]:block"
              />
            </button>
          </>
        );
      }}
    </Show>
  </nav>
);
