/**
 * Vaults (K-305): every vault this account is a member of, with its role, and a form to create a
 * shared one. A vault whose log the client did not accept shows as such, never opened (DESIGN.md:
 * show trust, don't claim it).
 */
import type { VaultRole } from "@kennwort/core";
import { Button, Icon, Input, m } from "@kennwort/ui";
import { Archive, TriangleExclamationPoint } from "@kennwort/ui/icons";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { Link } from "../frame/link.tsx";
import type { Navigation } from "../navigation.ts";
import type { VaultStore } from "./vault-store.ts";
import type { CreateError } from "./vaults.ts";

export const roleText = (role: VaultRole): string =>
  ({ read: m.vault_role_read(), edit: m.vault_role_edit(), manage: m.vault_role_manage(), "": "" })[
    role
  ];

const createText = (error: CreateError) =>
  error === "uncertified" ? m.vaults_create_uncertified() : m.vaults_create_failed();

const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";

const CreateForm = (props: { onCreate: (name: string) => Promise<CreateError | undefined> }) => {
  const [name, setName] = createSignal("");
  const [error, setError] = createSignal<CreateError>();
  const [busy, setBusy] = createSignal(false);
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!name().trim()) return;
    setBusy(true);
    const failed = await props.onCreate(name().trim());
    setBusy(false);
    setError(failed);
    if (!failed) setName("");
  };
  return (
    <form class="mt-6 grid max-w-md gap-2" onSubmit={submit}>
      <h2 class="font-semibold">{m.vaults_create_title()}</h2>
      <Input
        label={m.vaults_create_name()}
        value={name()}
        maxlength={100}
        required
        onInput={(event) => setName(event.currentTarget.value)}
      />
      <Show when={error()}>
        {(e) => (
          <p class={alertClass} role="alert">
            {createText(e())}
          </p>
        )}
      </Show>
      <Button type="submit" disabled={busy()}>
        {m.vaults_create()}
      </Button>
    </form>
  );
};

export const VaultsPage = (props: { nav: Navigation; store: VaultStore }) => (
  <section aria-labelledby="page-title" class="min-h-0 flex-1 overflow-auto p-4 md:p-6">
    <h1 id="page-title" class="mb-4 text-[28px] font-semibold md:text-lg">
      {m.vaults_title()}
    </h1>
    <Switch>
      <Match when={props.store.shown().state === "loading"}>
        <p class="text-muted-foreground">{m.vaults_loading()}</p>
      </Match>
      <Match
        when={(() => {
          const s = props.store.shown();
          return s.state === "failed" ? s : undefined;
        })()}
      >
        {(failed) => (
          <p class={alertClass} role="alert">
            {failed().error === "untrusted" ? m.vaults_untrusted() : m.vaults_unreachable()}
          </p>
        )}
      </Match>
      <Match
        when={(() => {
          const s = props.store.shown();
          return s.state === "ready" ? s : undefined;
        })()}
      >
        {(ready) => (
          <>
            <ul class="divide-y divide-border rounded-xl border border-border">
              <For each={ready().vaults}>
                {(vault) => (
                  <li>
                    <Link
                      nav={props.nav}
                      href={`/vaults/${vault.idText}`}
                      class="flex items-center gap-3 px-3.5 py-2.5 hover:bg-accent"
                    >
                      <Icon icon={Archive} />
                      <span class="flex-1 truncate">{vault.name ?? m.vaults_unnamed()}</span>
                      <span class="text-xs text-muted-foreground">{roleText(vault.role)}</span>
                    </Link>
                  </li>
                )}
              </For>
              <For each={ready().refused}>
                {() => (
                  <li class="flex items-center gap-3 px-3.5 py-2.5 text-danger">
                    <Icon icon={TriangleExclamationPoint} />
                    <span class="flex-1">{m.vaults_refused()}</span>
                  </li>
                )}
              </For>
            </ul>
            <CreateForm onCreate={props.store.create} />
          </>
        )}
      </Match>
    </Switch>
  </section>
);
