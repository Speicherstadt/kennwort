/**
 * Groups linked to a vault, shown read-only in its members dialog: groups and their vault links
 * are managed in one place (Team → Gruppen), while this dialog focuses on who has access here.
 */
import { m } from "@kennwort/ui";
import { For, Show } from "solid-js";
import type { Group, Link } from "../groups/groups.ts";
import { roleText } from "./vault-text.ts";

export const VaultGroups = (props: { groups: Group[]; links: Link[] }) => {
  const nameOf = (groupId: string) =>
    props.groups.find((g) => g.id === groupId)?.name ?? m.vault_groups_unknown();
  return (
    <Show when={props.links.length > 0}>
      <h3 class="mb-1 text-sm font-semibold">{m.vault_groups_title()}</h3>
      <ul
        class="mb-2 divide-y divide-border rounded-xl border border-border"
        aria-label={m.vault_groups_title()}
      >
        <For each={props.links}>
          {(link) => (
            <li class="flex flex-wrap items-center gap-2 px-3 py-2">
              <span class="flex-1 truncate">{nameOf(link.groupId)}</span>
              <span class="text-xs text-muted-foreground">{roleText(link.role)}</span>
            </li>
          )}
        </For>
      </ul>
      <p class="mt-1 mb-4 text-xs text-muted-foreground">{m.vault_groups_hint()}</p>
    </Show>
  );
};
