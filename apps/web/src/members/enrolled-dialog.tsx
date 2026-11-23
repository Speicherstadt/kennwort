/**
 * Comparing codes with someone who enrolled through the identity provider (K-604, P-25): the
 * person's bundle code and the company's code, side by side on both devices. The owner or admin
 * confirms only after both match; the person sees the same dialog without the confirmation.
 */
import type { MemberView } from "@kennwort/core";
import { Button, Dialog, DialogFooter, m } from "@kennwort/ui";
import { Show } from "solid-js";
import type { Session } from "../session/session.ts";
import { companyCode, enrolledCode, ownCodes } from "./enrolled.ts";

const codeClass = "rounded-lg bg-muted px-3 py-2 font-mono text-[15px] tracking-wide";

export const EnrolledDialog = (props: {
  view: MemberView;
  name: string;
  /** The person's own row: their codes, nothing to confirm */
  mine: boolean;
  session: Session;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) => (
  <Dialog
    open
    onClose={props.onClose}
    title={props.mine ? m.oidc_waiting_title() : m.members_enrolled_of({ name: props.name })}
  >
    <div class="grid gap-4">
      <p class="text-[13px]">
        {props.mine ? m.oidc_waiting_text() : m.members_enrolled_text({ name: props.name })}
      </p>
      <p class={codeClass} data-testid="enrolled-code">
        {props.mine ? ownCodes(props.session)?.own : enrolledCode(props.view)}
      </p>
      <p class="text-[13px]">
        {props.mine ? m.oidc_waiting_company() : m.members_enrolled_company({ name: props.name })}
      </p>
      <p class={codeClass} data-testid="company-code">
        {companyCode(props.session)}
      </p>
      <Show when={!props.mine}>
        <DialogFooter>
          <Button onClick={() => props.onClose()}>{m.ui_cancel()}</Button>
          <Button variant="primary" disabled={props.busy} onClick={() => props.onConfirm()}>
            {props.busy ? m.working() : m.members_renewed_confirm()}
          </Button>
        </DialogFooter>
      </Show>
    </div>
  </Dialog>
);
