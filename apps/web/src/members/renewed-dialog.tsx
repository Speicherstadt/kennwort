/**
 * Confirming a member's renewed keys (K-307 part e, P-12): the owner or admin compares the code of
 * the new bundle with the one the person sees on their own device and certifies it only then. The
 * old keys cannot vouch for the new ones: whoever has the kit has them too.
 */
import type { MemberView } from "@kennwort/core";
import { Button, Dialog, m } from "@kennwort/ui";
import { createSignal, Show } from "solid-js";
import { confirmRenewed, renewedCode } from "../account/renew.ts";
import type { Session } from "../session/session.ts";
import type { MemberExits } from "./member-exit.tsx";
import type { MembersDeps } from "./members.ts";

export const RenewedDialog = (props: {
  view: MemberView;
  name: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) => (
  <Dialog open onClose={props.onClose} title={m.members_renewed_of({ name: props.name })}>
    <div class="grid gap-4">
      <p class="text-[13px]">{m.members_renewed_text({ name: props.name })}</p>
      <p
        class="rounded-lg bg-muted px-3 py-2 font-mono text-[15px] tracking-wide"
        data-testid="renewed-code"
      >
        {renewedCode(props.view)}
      </p>
      <Button
        variant="primary"
        class="h-11 w-fit md:h-8"
        disabled={props.busy}
        onClick={() => props.onConfirm()}
      >
        {props.busy ? m.working() : m.members_renewed_confirm()}
      </Button>
    </div>
  </Dialog>
);

/**
 * Whose renewed keys the owner or admin compares now, and the confirmation: a change to the list
 * like any other (`act`), then the vaults load anew, so this client signs the rekey and rotation of
 * the vaults it manages
 */
export const createRenewedCheck = (
  deps: { api: MembersDeps; session: Session; exits?: MemberExits | undefined },
  act: (work: () => Promise<string | undefined>) => Promise<void>,
) => {
  const [checking, ask] = createSignal<MemberView>();
  const [busy, setBusy] = createSignal(false);
  const confirm = (view: MemberView, me: MemberView | undefined) =>
    act(async () => {
      setBusy(true);
      const done = await confirmRenewed(deps.api, deps.session, view, me?.certificate?.companyId);
      setBusy(false);
      ask(undefined);
      if (!done) return m.members_renewed_failed();
      await deps.exits?.onLeft();
      return undefined;
    });
  return { checking, ask, busy, confirm };
};

export const RenewedCheck = (props: {
  check: ReturnType<typeof createRenewedCheck>;
  me: MemberView | undefined;
}) => (
  <Show when={props.check.checking()}>
    {(view) => (
      <RenewedDialog
        view={view()}
        name={view().name ?? m.members_unnamed()}
        busy={props.check.busy()}
        onConfirm={() => void props.check.confirm(view(), props.me)}
        onClose={() => props.check.ask(undefined)}
      />
    )}
  </Show>
);
