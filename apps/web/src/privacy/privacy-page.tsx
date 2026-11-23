/**
 * Einstellungen → „Datenschutz“ (K-607): what the server keeps and what it never sees, the
 * download of the server's data about the account (Art. 15 and 20 GDPR) with the way to the
 * encrypted export of the entries (K-504), and deleting the account, confirmed with the
 * passphrase. The passphrase is read from the field when the form is sent and the form is reset at
 * once, like the export's (export-page.tsx).
 */
import { Button, Dialog, Icon, Input, m, pageClass } from "@kennwort/ui";
import { Download, Trash2 } from "@kennwort/ui/icons";
import type { JSX } from "@solidjs/web";
import { createSignal, For, Show } from "solid-js";
import type { DeleteError, DeleteOutcome } from "./deletion.ts";

export type PrivacyPageProps = {
  /** Downloads the server's data about the account; false when the server gave none */
  download: () => Promise<boolean>;
  /** The encrypted export of the entries (K-504), for owners and admins */
  onExport?: (() => void) | undefined;
  /** Whether the home account is on screen: only it deletes (K-605) */
  atHome: boolean;
  /** The further companies whose accounts go with it */
  linked: string[];
  remove: (passphrase: string) => Promise<DeleteOutcome>;
};

const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";

const ERRORS: Record<DeleteError, () => string> = {
  "wrong-passphrase": () => m.privacy_error_passphrase(),
  denied: () => m.privacy_error_passphrase(),
  locked: () => m.privacy_error_locked(),
  "last-owner": () => m.privacy_error_last_owner(),
  "sole-manager": () => m.privacy_error_sole_manager(),
  "linked-unreachable": () => m.privacy_error_linked(),
  "removal-refused": () => m.privacy_error_failed(),
  unreachable: () => m.privacy_error_failed(),
  unexpected: () => m.privacy_error_failed(),
};

/** Why it failed, with the company it failed in when it was a further one */
export const deleteErrorText = (outcome: Exclude<DeleteOutcome, { ok: true }>) => {
  const text = ERRORS[outcome.error]();
  return outcome.company ? m.privacy_error_in_company({ company: outcome.company, text }) : text;
};

const Section = (props: { title: string; children: JSX.Element }) => (
  <section class="grid max-w-prose gap-2">
    <h2 class="font-semibold">{props.title}</h2>
    {props.children}
  </section>
);

const List = (props: { label: string; items: string[] }) => (
  <ul aria-label={props.label} class="grid list-disc gap-1 pl-5 text-[13px]">
    <For each={props.items}>{(item) => <li>{item}</li>}</For>
  </ul>
);

const DeleteDialog = (props: {
  open: boolean;
  linked: string[];
  onClose: () => void;
  remove: PrivacyPageProps["remove"];
}) => {
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const passphrase = String(new FormData(form).get("passphrase") ?? "");
    form.reset();
    setBusy(true);
    setError(undefined);
    const done = await props.remove(passphrase);
    setBusy(false);
    if (!done.ok) setError(deleteErrorText(done));
  };
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title={m.privacy_delete_title()}
      description={m.privacy_delete_warning()}
    >
      <form class="grid gap-3" onSubmit={submit}>
        <Show when={props.linked.length > 0}>
          <p class="text-[13px]">{m.privacy_delete_linked()}</p>
          <List label={m.privacy_delete_linked()} items={props.linked} />
        </Show>
        <Input
          label={m.passphrase()}
          name="passphrase"
          type="password"
          autocomplete="current-password"
          required
        />
        <Show when={error()}>
          {(text) => (
            <p role="alert" class={alertClass}>
              {text()}
            </p>
          )}
        </Show>
        <Button type="submit" variant="danger" class="w-fit" disabled={busy()}>
          <Icon icon={Trash2} /> {busy() ? m.working() : m.privacy_delete_confirm()}
        </Button>
      </form>
    </Dialog>
  );
};

export const PrivacyPage = (props: PrivacyPageProps) => {
  const [open, setOpen] = createSignal(false);
  const [downloadFailed, setDownloadFailed] = createSignal(false);
  const download = async () => setDownloadFailed(!(await props.download()));
  return (
    <section aria-labelledby="page-title" class={pageClass()}>
      <h1 id="page-title" class="mb-4 text-[28px] font-semibold md:text-lg">
        {m.privacy_title()}
      </h1>
      <div class="grid gap-8">
        <Section title={m.privacy_stored_title()}>
          <p class="text-muted-foreground">{m.privacy_stored_intro()}</p>
          <List
            label={m.privacy_stored_title()}
            items={[
              m.privacy_stored_account(),
              m.privacy_stored_keys(),
              m.privacy_stored_vaults(),
              m.privacy_stored_devices(),
              m.privacy_stored_notifications(),
              m.privacy_stored_audit(),
            ]}
          />
          <h3 class="mt-2 text-[13px] font-semibold">{m.privacy_never_title()}</h3>
          <List
            label={m.privacy_never_title()}
            items={[
              m.privacy_never_passphrase(),
              m.privacy_never_content(),
              m.privacy_never_names(),
            ]}
          />
        </Section>
        <Section title={m.privacy_data_title()}>
          <p class="text-muted-foreground">{m.privacy_data_intro()}</p>
          <Button class="w-fit" onClick={() => void download()}>
            <Icon icon={Download} /> {m.privacy_download()}
          </Button>
          <Show when={downloadFailed()}>
            <p role="alert" class={alertClass}>
              {m.privacy_error_failed()}
            </p>
          </Show>
          <Show
            when={props.onExport}
            fallback={<p class="text-[13px] text-muted-foreground">{m.privacy_entries_admins()}</p>}
          >
            {(go) => (
              <p class="text-[13px]">
                {m.privacy_entries_export()}{" "}
                <Button size="sm" variant="ghost" class="underline" onClick={() => go()()}>
                  {m.settings_export()}
                </Button>
              </p>
            )}
          </Show>
        </Section>
        <Section title={m.privacy_delete_title()}>
          <p class="text-muted-foreground">{m.privacy_delete_intro()}</p>
          <Show
            when={props.atHome}
            fallback={<p class="text-[13px] text-muted-foreground">{m.privacy_delete_at_home()}</p>}
          >
            <Button variant="danger" class="w-fit" onClick={() => setOpen(true)}>
              <Icon icon={Trash2} /> {m.privacy_delete_button()}
            </Button>
          </Show>
        </Section>
      </div>
      <DeleteDialog
        open={open()}
        linked={props.linked}
        onClose={() => setOpen(false)}
        remove={props.remove}
      />
    </section>
  );
};
