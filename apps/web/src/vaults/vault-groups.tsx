/**
 * Compact footer bar in VaultMembersDialog showing which groups are linked to this vault, with a
 * direct link to Team → Gruppen where groups and their vault toggles live.
 */
import { m } from "@kennwort/ui";
import { Show } from "solid-js";
import type { Group, Link } from "../groups/groups.ts";

export const VaultGroups = (props: {
  groups: Group[];
  links: Link[];
  onManage?: (() => void) | undefined;
}) => {
  const names = () =>
    props.links
      .map(
        (link) => props.groups.find((g) => g.id === link.groupId)?.name ?? m.vault_groups_unknown(),
      )
      .join(", ");
  return (
    <Show when={props.links.length > 0}>
      <div class="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs">
        <span class="text-muted-foreground">{m.vault_groups_linked({ groups: names() })}</span>
        <Show when={props.onManage}>
          {(go) => (
            <button
              type="button"
              class="font-medium text-foreground underline-offset-4 hover:underline"
              onClick={() => go()()}
            >
              {m.vault_groups_edit()}
            </button>
          )}
        </Show>
      </div>
    </Show>
  );
};
