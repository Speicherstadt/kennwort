/**
 * Confirmation dialog when removing a member from a group that has linked vaults managed by this
 * device: lets the manager confirm which vaults to also remove the person from (with key rotation).
 */

import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import { Button, Dialog, m } from "@kennwort/ui";
import { createSignal, For } from "solid-js";

export type PendingLeave = {
  groupId: string;
  groupName: string;
  accountId: Uint8Array;
  personName: string;
  removable: Vault[];
};

export const LeaveGroupDialog = (props: {
  pending: PendingLeave;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (removeFrom: Vault[]) => void;
}) => {
  // All removable vaults start selected; a user can uncheck any they want to keep
  const [unchecked, setUnchecked] = createSignal<Set<string>>(new Set());
  const toggle = (idText: string) => {
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (next.has(idText)) next.delete(idText);
      else next.add(idText);
      return next;
    });
  };
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const skipped = unchecked();
    props.onConfirm(props.pending.removable.filter((v) => !skipped.has(v.idText)));
  };
  return (
    <Dialog
      open
      onClose={props.onCancel}
      title={m.groups_leave_title({
        name: props.pending.personName,
        group: props.pending.groupName,
      })}
    >
      <form class="grid gap-4" onSubmit={submit}>
        <p class="text-[13px] text-muted-foreground">
          {m.groups_leave_hint({ name: props.pending.personName })}
        </p>
        <ul class="divide-y divide-border rounded-xl border border-border">
          <For each={props.pending.removable}>
            {(vault) => (
              <li class="px-3 py-2">
                <label class="flex cursor-pointer items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={!unchecked().has(vault.idText)}
                    onChange={() => toggle(vault.idText)}
                  />
                  <span class="flex-1 truncate">{vault.name ?? m.vaults_unnamed()}</span>
                </label>
              </li>
            )}
          </For>
        </ul>
        <div class="flex justify-end gap-2">
          <Button type="button" disabled={props.busy} onClick={props.onCancel}>
            {m.groups_leave_cancel()}
          </Button>
          <Button type="submit" variant="primary" disabled={props.busy}>
            {m.groups_remove_member()}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
