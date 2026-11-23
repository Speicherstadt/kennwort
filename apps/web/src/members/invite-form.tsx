/** The form on the members page that invites someone and shows the link to copy (K-304) */
import { Button, Icon, Input, m, panelClass, panelTitleClass } from "@kennwort/ui";
import { Copy } from "@kennwort/ui/icons";
import { createSignal, Show } from "solid-js";

const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";

export const InviteForm = (props: { onInvite: (label: string) => Promise<string | undefined> }) => {
  const [label, setLabel] = createSignal("");
  const [link, setLink] = createSignal<string>();
  const [failed, setFailed] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!label().trim()) return;
    setBusy(true);
    const made = await props.onInvite(label().trim());
    setBusy(false);
    setFailed(!made);
    setLink(made);
    setCopied(false);
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // No clipboard: the link stays in the field to copy by hand
    }
  };
  return (
    <section aria-labelledby="invite-title" class={panelClass}>
      <h2 id="invite-title" class={panelTitleClass}>
        {m.members_invite_title()}
      </h2>
      <form class="flex flex-wrap items-end gap-2" onSubmit={submit}>
        <div class="min-w-48 flex-1">
          <Input
            label={m.members_invite_name()}
            value={label()}
            maxlength={64}
            required
            onInput={(event) => setLabel(event.currentTarget.value)}
          />
        </div>
        <Button type="submit" variant="primary" class="h-11 md:h-8" disabled={busy()}>
          {busy() ? m.working() : m.members_invite_submit()}
        </Button>
      </form>
      <Show when={failed()}>
        <p role="alert" class={alertClass}>
          {m.members_invite_failed()}
        </p>
      </Show>
      <Show when={link()}>
        {(made) => (
          <div class="grid gap-2">
            <Input
              label={m.members_invite_link()}
              value={made()}
              readonly
              hint={m.members_invite_hint()}
              data-testid="invitation-link"
            />
            <Button class="h-11 w-fit md:h-8" onClick={() => copy(made())}>
              <Icon icon={Copy} /> {copied() ? m.copied() : m.copy()}
            </Button>
          </div>
        )}
      </Show>
    </section>
  );
};
