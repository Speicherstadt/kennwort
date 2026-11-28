/**
 * Detail view of one vault in Team → Vaults (K-608): header with verified-log chip, add bar,
 * open requests, members grouped by role, empty/read-only hints, and the aside with history and
 * roles. Personal vaults show only the privacy note.
 */
import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import { type Certificate, idKey, type MemberView, type VaultRole } from "@kennwort/core";
import { Badge, cn, Icon, Menu, m } from "@kennwort/ui";
import {
  ChevronLeft,
  Ellipsis,
  Handshake,
  Lock,
  ShieldCheck,
  Vault as VaultIcon,
} from "@kennwort/ui/icons";
import { For, Show } from "solid-js";
import { dateText } from "./day.ts";
import type { ExitError } from "./exit.ts";
import {
  type AddCandidate,
  displayName,
  groupByRole,
  initialsOf,
  managerNameOf,
  memberOrigin,
} from "./vault-access.ts";
import { VaultAddBar } from "./vault-add-bar.tsx";
import { roleDesc, roleIcon, VaultAside } from "./vault-aside.tsx";
import { VaultMemberMenu } from "./vault-member-menu.tsx";
import {
  hasExpired,
  mayManage,
  type Request,
  type VaultMember,
  vaultMembers,
} from "./vault-members.ts";
import { VaultRequests } from "./vault-requests.tsx";
import { roleText } from "./vault-text.ts";

const errorText = (error: ExitError) => {
  if (error === "stale") return m.vault_members_stale();
  if (error === "past") return m.vault_members_past();
  if (error === "uncertified-member") return m.vault_members_uncertified();
  if (error === "not-saved" || error === "rotation-due") return m.vault_members_rewrite_failed();
  return m.vault_members_failed();
};

const MemberRow = (props: {
  member: VaultMember;
  vault: Vault;
  people: MemberView[];
  canManage: boolean;
  busy: boolean;
  justAdded: boolean;
  flashed: boolean;
  onRole: (role: VaultRole) => void;
  onUntil: () => void;
  onRemove: () => void;
}) => {
  const name = () => displayName(props.member.name);
  const origin = () => memberOrigin(props.vault.entries, props.member.accountId, props.people);
  const vaultName = () => props.vault.name ?? m.vaults_unnamed();
  const expired = () => hasExpired(props.member);

  const originText = () => {
    if (props.justAdded) return m.vault_access_just_added();
    const o = origin();
    if (!o) return "";
    if (o.kind === "created") return m.vault_access_created_vault();
    return m.vault_access_since_by({ date: dateText(o.time), name: o.by });
  };

  return (
    <div
      class={cn(
        "flex min-h-14 items-center gap-3 px-3 py-2.5 pr-2 transition-colors hover:bg-muted @max-[600px]:min-h-16 @max-[600px]:pr-1.5",
        props.flashed ? "bg-success-surface" : "bg-background",
      )}
    >
      <span
        aria-hidden="true"
        class="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-foreground"
      >
        {initialsOf(name())}
      </span>
      <div class="flex min-w-0 flex-1 flex-col leading-snug">
        <div class="flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium @max-[600px]:text-[15.5px]">
          <span class="truncate">{name()}</span>
          <Show when={props.member.me}>
            <span class="rounded border border-border px-1.5 text-[11px] font-medium text-muted-foreground">
              {m.vault_access_you_badge()}
            </span>
          </Show>
        </div>
        <div
          class={cn(
            "flex flex-wrap items-center gap-1.5 text-xs",
            props.flashed ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <Show when={props.member.validUntil > 0}>
            <span class="rounded bg-warning-surface px-1.5 py-0.5 font-mono text-[11px] text-warning">
              {expired()
                ? m.vault_members_expired()
                : m.vault_members_until({ date: dateText(props.member.validUntil) })}
            </span>
          </Show>
          <Show when={originText()}>{(text) => <span>{text()}</span>}</Show>
        </div>
      </div>
      <Show when={props.canManage && !props.member.me}>
        <VaultMemberMenu
          member={props.member}
          vaultName={vaultName()}
          busy={props.busy}
          onRole={props.onRole}
          onUntil={props.onUntil}
          onRemove={props.onRemove}
        />
      </Show>
    </div>
  );
};

export const PersonalVaultDetail = (props: { name: string; onBack: () => void }) => (
  <div class="flex flex-col gap-5 px-7 py-5.5 @max-[600px]:px-4 @max-[600px]:py-2">
    <div class="flex items-start gap-3.5 @max-[600px]:flex-wrap @max-[600px]:gap-2.5">
      <button
        type="button"
        aria-label={m.vault_access_back()}
        class="-mt-1 -ml-2 hidden size-10 cursor-pointer place-items-center rounded-lg text-foreground hover:bg-accent @max-[600px]:grid"
        onClick={() => props.onBack()}
      >
        <Icon icon={ChevronLeft} size={22} />
      </button>
      <span class="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground @max-[600px]:hidden">
        <Icon icon={Lock} size={22} />
      </span>
      <div class="flex min-w-0 flex-1 flex-col gap-1.5 @max-[600px]:basis-full">
        <h2 class="text-[22px] leading-tight font-semibold @max-[600px]:text-[28px] @max-[600px]:font-bold">
          {props.name}
        </h2>
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="inline-flex items-center gap-1.5 rounded-md bg-accent px-2 py-0.5 text-xs text-foreground">
            <Icon icon={Lock} size={12} />
            {m.vault_access_personal_label()}
          </span>
        </div>
      </div>
    </div>
    <p class="rounded-xl border border-dashed border-border px-3.5 py-3 text-[12.5px] text-muted-foreground">
      {m.vault_access_personal_hint()}
    </p>
  </div>
);

export const VaultDetail = (props: {
  vault: Vault;
  people: MemberView[];
  me: Uint8Array;
  entryCount: number;
  requests: Request[];
  busy: boolean;
  error: ExitError | undefined;
  flashedKeys: ReadonlySet<string>;
  justAddedKeys: ReadonlySet<string>;
  onBack: () => void;
  onAdd: (
    people: (AddCandidate & { certificate: Certificate })[],
    role: VaultRole,
    validUntil: number,
  ) => Promise<string[]>;
  onRole: (member: VaultMember, role: VaultRole) => void;
  onUntil: (member: VaultMember) => void;
  onRemove: (member: VaultMember) => void;
  onGrant: (request: Request) => void;
  onDecline: (request: Request) => void;
  onHandOver?: (() => void) | undefined;
}) => {
  const vaultName = () => props.vault.name ?? m.vaults_unnamed();
  const canManage = () => mayManage(props.vault);
  const members = () => vaultMembers(props.vault, props.people, props.me);
  const sections = () => groupByRole(members());
  const managerName = () => managerNameOf(props.vault, props.people);

  return (
    <div class="grid min-h-full grid-cols-[minmax(0,1fr)_300px] @max-[1020px]:grid-cols-1">
      <div class="flex min-w-0 flex-col gap-5 px-7 pt-5.5 pb-8 @max-[600px]:gap-4 @max-[600px]:px-4 @max-[600px]:pt-2">
        <div class="relative flex items-start gap-3.5 @max-[600px]:flex-wrap @max-[600px]:gap-2.5">
          <button
            type="button"
            aria-label={m.vault_access_back()}
            class="-mt-1 -ml-2 hidden size-11 cursor-pointer place-items-center rounded-lg text-foreground hover:bg-accent @max-[600px]:grid"
            onClick={() => props.onBack()}
          >
            <Icon icon={ChevronLeft} size={22} />
          </button>
          <span class="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground @max-[600px]:hidden">
            <Icon icon={VaultIcon} size={24} />
          </span>
          <div class="flex min-w-0 flex-1 flex-col gap-1.5 @max-[600px]:basis-full">
            <h2 class="truncate text-[22px] leading-tight font-semibold @max-[600px]:text-[28px] @max-[600px]:font-bold">
              {vaultName()}
            </h2>
            <div class="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary">
                {members().length === 1
                  ? m.vault_access_people_one()
                  : m.vault_access_people_many({ count: String(members().length) })}
              </Badge>
              <Badge variant="secondary">
                {props.entryCount === 1
                  ? m.vault_access_entries_one()
                  : m.vault_access_entries_many({ count: String(props.entryCount) })}
              </Badge>
              <Badge variant="success">
                <Icon icon={ShieldCheck} size={13} />
                {m.vault_access_log_verified()}
              </Badge>
              <Show when={!canManage() && managerName()}>
                {(name) => (
                  <Badge variant="secondary">
                    <Icon icon={Lock} size={12} />
                    {m.vault_access_managed_by({ name: name() })}
                  </Badge>
                )}
              </Show>
            </div>
          </div>
          <Show when={canManage() && props.onHandOver}>
            {(handOver) => (
              <div class="@max-[600px]:absolute @max-[600px]:top-0 @max-[600px]:right-0">
                <Menu
                  label={m.vault_access_vault_menu({ vault: vaultName() })}
                  trigger={<Icon icon={Ellipsis} size={18} />}
                  triggerClass="grid size-[34px] cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground @max-[600px]:size-11"
                  items={[
                    {
                      label: m.handover_button(),
                      icon: Handshake,
                      onSelect: () => handOver()(),
                    },
                  ]}
                />
              </div>
            )}
          </Show>
        </div>

        <Show when={props.error}>
          {(err) => (
            <p
              class="rounded-lg border border-danger px-3 py-2 text-[13px] text-danger"
              role="alert"
            >
              {errorText(err())}
            </p>
          )}
        </Show>

        <Show when={canManage()}>
          <VaultAddBar
            vault={props.vault}
            people={props.people}
            entryCount={props.entryCount}
            busy={props.busy}
            onAdd={props.onAdd}
          />
          <VaultRequests
            requests={props.requests}
            busy={props.busy}
            onGrant={props.onGrant}
            onDecline={props.onDecline}
          />
        </Show>

        <section class="flex flex-col gap-4.5" aria-label={m.vault_members_list()}>
          <For each={sections()}>
            {(section) => (
              <section aria-label={roleText(section.role)}>
                <div class="mb-2 flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    class="grid size-[22px] shrink-0 place-items-center rounded-md bg-accent text-foreground"
                  >
                    <Icon icon={roleIcon(section.role)} size={13} />
                  </span>
                  <b class="text-[13px] font-semibold">{roleText(section.role)}</b>
                  <span class="text-xs text-muted-foreground tabular-nums">
                    {section.members.length}
                  </span>
                  <span class="ml-auto text-xs text-muted-foreground @max-[600px]:hidden">
                    {roleDesc(section.role)}
                  </span>
                </div>
                <div class="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  <For each={section.members}>
                    {(member) => {
                      const key = idKey(member.accountId);
                      return (
                        <MemberRow
                          member={member}
                          vault={props.vault}
                          people={props.people}
                          canManage={canManage()}
                          busy={props.busy}
                          justAdded={props.justAddedKeys.has(key)}
                          flashed={props.flashedKeys.has(key)}
                          onRole={(role) => props.onRole(member, role)}
                          onUntil={() => props.onUntil(member)}
                          onRemove={() => props.onRemove(member)}
                        />
                      );
                    }}
                  </For>
                </div>
              </section>
            )}
          </For>
          <Show when={members().length === 1 && canManage()}>
            <p class="rounded-xl border border-dashed border-border px-3.5 py-3 text-[12.5px] text-muted-foreground">
              {m.vault_access_alone_hint({ vault: vaultName() })}
            </p>
          </Show>
          <Show when={!canManage()}>
            <p class="rounded-xl border border-dashed border-border px-3.5 py-3 text-[12.5px] text-muted-foreground">
              {(() => {
                const name = managerName();
                return name
                  ? m.vault_access_readonly_hint({ name })
                  : m.vault_access_readonly_hint_generic();
              })()}
            </p>
          </Show>
        </section>
      </div>
      <VaultAside vault={props.vault} people={props.people} />
    </div>
  );
};
