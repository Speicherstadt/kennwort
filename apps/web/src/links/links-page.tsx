/**
 * Einstellungen → „Einmal-Links“ (K-601, P-18): a link for a free text, and the account's links
 * that still last, each with what is left of it and a button to revoke it. The address of a link
 * is not listed: its secret was only ever on screen once, when it was made.
 */
import type { LinkApi } from "@kennwort/client/session/links-api.ts";
import {
  LINK_TITLE_MAX,
  LINK_VALUE_MAX,
  type LinkSummary,
  linkContentOfText,
} from "@kennwort/core";
import { Button, Input, m, TextArea } from "@kennwort/ui";
import { createSignal, For, onSettled, Show } from "solid-js";
import { dateTime, LinkOptionsForm, MadeLinkView, makeErrorText } from "./link-form.tsx";
import { type LinkOptions, type MadeLink, type MakeError, makeLink } from "./links.ts";

export type LinksPageDeps = {
  api: Pick<LinkApi, "createLink" | "myLinks" | "revokeLink">;
  token: string;
  origin: string;
};

const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";

const LinkRow = (props: { link: LinkSummary; busy: boolean; onRevoke: () => void }) => (
  <li class="flex flex-wrap items-center gap-2 px-3 py-2">
    <span class="grid flex-1 gap-0.5">
      <span>{m.links_created({ date: dateTime(props.link.createdAt) })}</span>
      <span class="text-xs text-muted-foreground">
        {m.links_left({ remaining: props.link.remaining, max: props.link.maxFetches })} ·{" "}
        {m.links_until({ date: dateTime(props.link.expiresAt) })}
      </span>
    </span>
    <Button
      aria-label={m.links_revoke_of({ date: dateTime(props.link.createdAt) })}
      disabled={props.busy}
      onClick={props.onRevoke}
    >
      {m.links_revoke()}
    </Button>
  </li>
);

/** A free text with an optional title; made anew after each link */
const TextLinkForm = (props: { deps: LinksPageDeps; onMade: () => void }) => {
  const [title, setTitle] = createSignal("");
  const [text, setText] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<MakeError>();
  const [made, setMade] = createSignal<MadeLink>();
  const submit = async (options: LinkOptions) => {
    setBusy(true);
    const content = linkContentOfText(title().trim(), m.links_text_label(), text());
    const result = await makeLink(props.deps, content, options);
    setBusy(false);
    setError(result.ok ? undefined : result.error);
    if (result.ok) {
      setMade(result.value);
      props.onMade();
    }
  };
  const done = () => {
    setMade(undefined);
    setTitle("");
    setText("");
  };
  return (
    <Show
      when={made()}
      fallback={
        <LinkOptionsForm busy={busy()} onSubmit={(options) => void submit(options)}>
          <Input
            label={m.links_text_title()}
            maxlength={LINK_TITLE_MAX}
            value={title()}
            onInput={(event) => setTitle(event.currentTarget.value)}
          />
          <TextArea
            label={m.links_text_label()}
            required
            maxlength={LINK_VALUE_MAX}
            value={text()}
            onInput={(event) => setText(event.currentTarget.value)}
          />
          <Show when={error()}>
            {(e) => (
              <p role="alert" class={alertClass}>
                {makeErrorText(e())}
              </p>
            )}
          </Show>
        </LinkOptionsForm>
      }
    >
      {(link) => <MadeLinkView made={link()} onDone={done} />}
    </Show>
  );
};

export const LinksPage = (props: { deps: LinksPageDeps }) => {
  const [links, setLinks] = createSignal<LinkSummary[]>();
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const reload = async () => {
    const loaded = await props.deps.api.myLinks(props.deps.token);
    setFailed(loaded === undefined);
    setLinks(loaded ?? []);
  };
  onSettled(() => void reload());
  const revoke = async (id: string) => {
    setBusy(true);
    const revoked = await props.deps.api.revokeLink(props.deps.token, id);
    setFailed(!revoked);
    await reload();
    setBusy(false);
  };
  return (
    <section aria-labelledby="page-title" class="min-h-0 flex-1 overflow-auto p-4 md:p-6">
      <h1 id="page-title" class="mb-2 text-[28px] font-semibold md:text-lg">
        {m.links_title()}
      </h1>
      <p class="mb-4 max-w-md text-[13px] text-muted-foreground">{m.links_intro()}</p>
      <div class="grid max-w-md gap-6">
        <TextLinkForm deps={props.deps} onMade={() => void reload()} />
        <div class="grid gap-2">
          <h2 class="text-sm font-semibold">{m.links_active()}</h2>
          <Show when={failed()}>
            <p role="alert" class={alertClass}>
              {m.links_failed()}
            </p>
          </Show>
          <Show
            when={(links() ?? []).length > 0}
            fallback={<p class="text-[13px] text-muted-foreground">{m.links_none()}</p>}
          >
            <ul
              aria-label={m.links_active()}
              class="divide-y divide-border rounded-xl border border-border"
            >
              <For each={links()}>
                {(link) => (
                  <LinkRow link={link} busy={busy()} onRevoke={() => void revoke(link.id)} />
                )}
              </For>
            </ul>
          </Show>
        </div>
      </div>
    </section>
  );
};
