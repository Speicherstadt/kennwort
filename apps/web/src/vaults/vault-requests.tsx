/**
 * Open access requests in a vault's members dialog (K-305 part 4, P-05 step 4): a manager grants
 * one by adding the person with a role, which only works for confirmed keys, or declines it
 */
import type { VaultRole } from "@kennwort/core";
import { Button, m } from "@kennwort/ui";
import { createSignal, For, Show } from "solid-js";
import { RoleSelect } from "./role-select.tsx";
import type { Request } from "./vault-members.ts";

const RequestRow = (props: {
  request: Request;
  busy: boolean;
  onGrant: (role: VaultRole) => void;
  onDecline: () => void;
}) => {
  const [role, setRole] = createSignal<VaultRole>("read");
  const name = () => props.request.name ?? m.vault_members_unnamed();
  return (
    <li class="flex flex-wrap items-center gap-2 px-3 py-2">
      <span class="flex-1 truncate">{name()}</span>
      <Show
        when={props.request.certificate}
        fallback={
          <span class="text-xs text-muted-foreground">{m.vault_requests_unconfirmed()}</span>
        }
      >
        <RoleSelect
          label={m.vault_requests_role_for({ name: name() })}
          value={role()}
          disabled={props.busy}
          onChange={setRole}
        />
        <Button disabled={props.busy} onClick={() => props.onGrant(role())}>
          {m.vault_requests_grant()}
        </Button>
      </Show>
      <Button disabled={props.busy} onClick={props.onDecline}>
        {m.vault_requests_decline()}
      </Button>
    </li>
  );
};

export const VaultRequests = (props: {
  requests: Request[];
  busy: boolean;
  onGrant: (request: Request, role: VaultRole) => void;
  onDecline: (request: Request) => void;
}) => (
  <Show when={props.requests.length > 0}>
    <h3 class="mb-1 text-sm font-semibold">{m.vault_requests_title()}</h3>
    <ul
      class="mb-4 divide-y divide-border rounded-xl border border-border"
      aria-label={m.vault_requests_title()}
    >
      <For each={props.requests}>
        {(request) => (
          <RequestRow
            request={request}
            busy={props.busy}
            onGrant={(role) => props.onGrant(request, role)}
            onDecline={() => props.onDecline(request)}
          />
        )}
      </For>
    </ul>
  </Show>
);
