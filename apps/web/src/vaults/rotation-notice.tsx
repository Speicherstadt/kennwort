/**
 * The warning that a vault waits for its key rotation (K-307 part b, P-11): someone was removed,
 * and until a manager's client writes the new key nobody writes in that vault, since whoever left
 * still holds the current one. So after someone renewed her keys (P-12): the old ones hold it. A manager's client catches up by itself after unlock; every other
 * client only warns. At the top, so it covers neither the tab bar nor the offline notice, and it
 * lets clicks through.
 */
import { Icon, m } from "@kennwort/ui";
import { TriangleExclamationPoint } from "@kennwort/ui/icons";
import { For, Show } from "solid-js";

type Shown = {
  name: string | undefined;
  log: { rotationDue: boolean; superseded?: readonly string[] };
};

/** Why the vault waits: someone left, or someone renewed her keys (P-12) and the log names the old */
const reason = (vault: Shown) => {
  const name = vault.name ?? m.vaults_unnamed();
  return vault.log.superseded?.length ? m.rotation_due_renewed({ name }) : m.rotation_due({ name });
};

export const RotationNotice = (props: { vaults: readonly Shown[] | undefined }) => {
  const due = () => (props.vaults ?? []).filter((vault) => vault.log.rotationDue);
  return (
    <div role="status" aria-live="polite">
      <Show when={due().length > 0}>
        <ul class="pointer-events-none fixed top-2 right-4 left-4 z-50 grid gap-2 md:right-auto md:left-1/2 md:w-[28rem] md:-translate-x-1/2">
          <For each={due()}>
            {(vault) => (
              <li class="flex items-start gap-3 rounded-xl border border-warning bg-background p-3 text-[13px] shadow-lg">
                <span class="text-warning">
                  <Icon icon={TriangleExclamationPoint} size={18} />
                </span>
                <p class="flex-1 text-foreground">{reason(vault)}</p>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
};
