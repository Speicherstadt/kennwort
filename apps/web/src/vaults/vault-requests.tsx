/**
 * Open access requests for a vault (K-305 part 4, K-608): shown as a blue notice bar between the
 * add field and the member sections. Granting adds the person with "read"; their role can be
 * changed in their row afterwards.
 */
import { Button, m } from "@kennwort/ui";
import { For, Show } from "solid-js";
import { displayName, formatWhen, initialsOf } from "./vault-access.ts";
import type { Request } from "./vault-members.ts";

const RequestRow = (props: {
  request: Request;
  busy: boolean;
  onGrant: () => void;
  onDecline: () => void;
}) => {
  const name = () => displayName(props.request.name);
  const when = () => formatWhen(Math.floor(props.request.requestedAt / 1000));
  return (
    <div
      role="status"
      class="flex flex-wrap items-center gap-3 rounded-xl border border-info bg-info-surface px-3 py-2.5"
    >
      <span
        aria-hidden="true"
        class="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-foreground"
      >
        {initialsOf(name())}
      </span>
      <div class="min-w-40 flex-1 text-[13px] leading-snug">
        <p class="font-medium text-foreground">{m.vault_access_request_wants({ name: name() })}</p>
        <p class="text-xs text-foreground">{m.vault_access_request_via({ time: when() })}</p>
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        <Button variant="ghost" disabled={props.busy} onClick={() => props.onDecline()}>
          {m.vault_requests_decline()}
        </Button>
        <Show
          when={props.request.certificate}
          fallback={
            <span class="px-2 text-xs text-foreground">{m.vault_requests_unconfirmed()}</span>
          }
        >
          <Button disabled={props.busy} onClick={() => props.onGrant()}>
            {m.vault_requests_grant()}
          </Button>
        </Show>
      </div>
    </div>
  );
};

export const VaultRequests = (props: {
  requests: Request[];
  busy: boolean;
  onGrant: (request: Request) => void;
  onDecline: (request: Request) => void;
}) => (
  <Show when={props.requests.length > 0}>
    <section class="grid gap-2" aria-label={m.vault_requests_title()}>
      <For each={props.requests}>
        {(request) => (
          <RequestRow
            request={request}
            busy={props.busy}
            onGrant={() => props.onGrant(request)}
            onDecline={() => props.onDecline(request)}
          />
        )}
      </For>
    </section>
  </Show>
);
