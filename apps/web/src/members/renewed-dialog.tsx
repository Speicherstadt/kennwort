/**
 * Confirming a member's renewed keys (K-307 part e, P-12): the owner or admin compares the code of
 * the new bundle with the one the person sees on their own device and certifies it only then. The
 * old keys cannot vouch for the new ones: whoever has the kit has them too.
 */
import type { MemberView } from "@kennwort/core";
import { Button, Dialog, m } from "@kennwort/ui";
import { renewedCode } from "../account/renew.ts";

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
