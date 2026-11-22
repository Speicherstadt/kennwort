/**
 * The page a one-time link opens (K-601, P-18), without an account: `/s/<fetch-ID>#<secret>`. The
 * app took the fragment from the address before this page rendered (takeStartFragment). Two
 * steps: the page loads and fetches nothing, so a link preview or a mail scanner that loads it
 * burns no fetch; only „Anzeigen“ fetches, once, and the content opens on this device.
 */
import type { LinkApi } from "@kennwort/client/session/links-api.ts";
import type { LinkContent } from "@kennwort/core";
import { Button, createToasts, Input, m, Toaster } from "@kennwort/ui";
import { createSignal, For, Match, Show, Switch, untrack } from "solid-js";
import { Card } from "../account/form.tsx";
import { Field } from "../frame/secret-field.tsx";
import { fetchSecret, openFetched, readSecretLink, type SecretView } from "./secret.ts";

const notice = (view: SecretView) =>
  view.state === "gone"
    ? m.secret_gone()
    : view.state === "too-many"
      ? m.error_too_many()
      : view.state === "unreachable"
        ? m.error_unreachable()
        : view.state === "damaged"
          ? m.secret_damaged()
          : view.state === "broken"
            ? m.secret_broken()
            : undefined;

const PassphraseForm = (props: { wrong: boolean; onSubmit: (passphrase: string) => void }) => {
  const [passphrase, setPassphrase] = createSignal("");
  return (
    <form
      class="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit(passphrase());
      }}
    >
      <p class="text-[13px] text-muted-foreground">{m.secret_passphrase_intro()}</p>
      <Show when={props.wrong}>
        <p role="alert" class="rounded-lg border border-danger px-3 py-2 text-[13px] text-danger">
          {m.secret_passphrase_wrong()}
        </p>
      </Show>
      <Input
        label={m.secret_passphrase()}
        type="password"
        autocomplete="off"
        required
        value={passphrase()}
        onInput={(event) => setPassphrase(event.currentTarget.value)}
      />
      <Button type="submit" variant="primary">
        {m.secret_unlock()}
      </Button>
    </form>
  );
};

const Opened = (props: {
  content: LinkContent;
  remaining: number;
  toasts: ReturnType<typeof createToasts>;
}) => (
  <div class="grid gap-3">
    <Show when={props.content.title}>
      <h2 class="text-[15px] font-semibold">{props.content.title}</h2>
    </Show>
    <div class="divide-y divide-border rounded-xl border border-border">
      <For each={props.content.fields}>
        {(field) => (
          <Field
            label={field.label}
            value={field.value}
            secret={field.secret}
            multiline={field.value.includes("\n")}
            toasts={props.toasts}
          />
        )}
      </For>
    </div>
    <p class="text-xs text-muted-foreground">
      {props.remaining === 0 ? m.secret_used_up() : m.secret_remaining({ count: props.remaining })}
    </p>
  </div>
);

export const SecretPage = (props: {
  fetchId: string;
  hash: string;
  fetchLink: LinkApi["fetchLink"];
}) => {
  // Deliberately read once: the app renders this page anew for every link it takes
  const link = untrack(() => readSecretLink(props.fetchId, props.hash));
  const toasts = createToasts();
  const [view, setView] = createSignal<SecretView>(link ? { state: "ready" } : { state: "broken" });
  const reveal = async () => {
    if (!link) return;
    setView({ state: "loading" });
    setView(await fetchSecret(props.fetchLink, link));
  };
  const unlock = async (passphrase: string) => {
    const shown = view();
    if (!link || shown.state !== "passphrase") return;
    setView({ state: "loading" });
    setView(await openFetched(shown.ciphertext, link.secret, shown.remaining, passphrase));
  };
  const retry = () => ["too-many", "unreachable"].includes(view().state);
  return (
    <>
      <Card title={m.secret_title()} error={notice(view())}>
        <Switch>
          <Match when={view().state === "ready"}>
            <p class="text-[13px] text-muted-foreground">{m.secret_intro()}</p>
            <Button variant="primary" onClick={() => void reveal()}>
              {m.secret_reveal()}
            </Button>
          </Match>
          <Match when={view().state === "loading"}>
            <p class="text-[13px] text-muted-foreground" role="status">
              {m.working()}
            </p>
          </Match>
          <Match when={retry()}>
            <Button onClick={() => void reveal()}>{m.secret_retry()}</Button>
          </Match>
          <Match
            when={(() => {
              const v = view();
              return v.state === "passphrase" ? v : undefined;
            })()}
          >
            {(v) => <PassphraseForm wrong={v().wrong} onSubmit={(p) => void unlock(p)} />}
          </Match>
          <Match
            when={(() => {
              const v = view();
              return v.state === "open" ? v : undefined;
            })()}
          >
            {(v) => <Opened content={v().content} remaining={v().remaining} toasts={toasts} />}
          </Match>
        </Switch>
        <p class="text-xs text-muted-foreground">{m.secret_footer()}</p>
      </Card>
      <Toaster toasts={toasts} />
    </>
  );
};
