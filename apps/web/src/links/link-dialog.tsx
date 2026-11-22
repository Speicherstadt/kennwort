/**
 * „Einmal-Link“ on an entry (K-601, P-18): the entry's fields with a value (no TOTP seed), sealed
 * on this device, the address shown once. What goes out is listed before anything is made.
 */
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import { linkContentOfEntry } from "@kennwort/core";
import { Dialog, m } from "@kennwort/ui";
import { createSignal, Show } from "solid-js";
import { LinkOptionsForm, MadeLinkView, makeErrorText } from "./link-form.tsx";
import {
  type LinkOptions,
  type MadeLink,
  type MakeDeps,
  type MakeError,
  makeLink,
} from "./links.ts";

export const LinkDialog = (props: { entry: ShownEntry; deps: MakeDeps; onClose: () => void }) => {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<MakeError>();
  const [made, setMade] = createSignal<MadeLink>();
  const content = () => linkContentOfEntry(props.entry);
  const submit = async (options: LinkOptions) => {
    setBusy(true);
    const result = await makeLink(props.deps, content(), options);
    setBusy(false);
    if (result.ok) setMade(result.value);
    else setError(result.error);
  };
  return (
    <Dialog
      open
      onClose={props.onClose}
      title={m.link_title({ title: props.entry.title })}
      description={m.link_intro()}
    >
      <Show
        when={made()}
        fallback={
          <Show
            when={content().fields.length > 0}
            fallback={<p class="text-[13px] text-muted-foreground">{m.link_nothing()}</p>}
          >
            <LinkOptionsForm busy={busy()} onSubmit={(options) => void submit(options)}>
              <p class="text-[13px]">
                {m.link_fields({
                  fields: content()
                    .fields.map((f) => f.label)
                    .join(", "),
                })}
              </p>
              <Show when={error()}>
                {(e) => (
                  <p
                    role="alert"
                    class="rounded-lg border border-danger px-3 py-2 text-[13px] text-danger"
                  >
                    {makeErrorText(e())}
                  </p>
                )}
              </Show>
            </LinkOptionsForm>
          </Show>
        }
      >
        {(link) => <MadeLinkView made={link()} onDone={props.onClose} />}
      </Show>
    </Dialog>
  );
};
