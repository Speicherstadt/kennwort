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
import {
  Badge,
  Button,
  Icon,
  Input,
  introClass,
  m,
  pageClass,
  panelClass,
  panelTitleClass,
  TextArea,
} from "@kennwort/ui";
import { Link2 } from "@kennwort/ui/icons";
import { createSignal, For, onSettled, Show } from "solid-js";
import { alertClass, EmptyState } from "../blocks/empty-state.tsx";
import { dateTime, LinkOptionsForm, MadeLinkView, makeErrorText } from "./link-form.tsx";
import { type LinkOptions, type MadeLink, type MakeError, makeLink } from "./links.ts";

export type LinksPageDeps = {
  api: Pick<LinkApi, "createLink" | "myLinks" | "revokeLink">;
  token: string;
  origin: string;
};

const LinkRow = (props: { link: LinkSummary; busy: boolean; onRevoke: () => void }) => (
  <li class="flex flex-wrap items-center gap-3 px-4 py-3">
    <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-muted-foreground">
      <Icon icon={Link2} />
    </span>
    <span class="grid min-w-0 flex-1 gap-1">
      <span class="text-[13px] font-medium">
        {m.links_created({ date: dateTime(props.link.createdAt) })}
      </span>
      <span class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge>
          {m.links_left({ remaining: props.link.remaining, max: props.link.maxFetches })}
        </Badge>
        {m.links_until({ date: dateTime(props.link.expiresAt) })}
      </span>
    </span>
    <Button
      variant="ghost"
      class="text-danger"
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
    <section aria-labelledby="page-title" class={pageClass("wide")}>
      <h1 id="page-title" class="mb-1 text-[28px] font-semibold md:text-lg">
        {m.links_title()}
      </h1>
      <p class={introClass}>{m.links_intro()}</p>
      <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <section class={panelClass} aria-labelledby="links-new-title">
          <h2 id="links-new-title" class={panelTitleClass}>
            {m.links_new_title()}
          </h2>
          <TextLinkForm deps={props.deps} onMade={() => void reload()} />
        </section>
        <section class="grid gap-3" aria-labelledby="links-active-title">
          <h2 id="links-active-title" class={panelTitleClass}>
            {m.links_active()}
          </h2>
          <Show when={failed()}>
            <p role="alert" class={alertClass}>
              {m.links_failed()}
            </p>
          </Show>
          <Show
            when={(links() ?? []).length > 0}
            fallback={<EmptyState icon={Link2} text={m.links_none()} />}
          >
            <ul
              aria-label={m.links_active()}
              class="divide-y divide-border overflow-hidden rounded-xl border border-border"
            >
              <For each={links()}>
                {(link) => (
                  <LinkRow link={link} busy={busy()} onRevoke={() => void revoke(link.id)} />
                )}
              </For>
            </ul>
          </Show>
        </section>
      </div>
    </section>
  );
};
