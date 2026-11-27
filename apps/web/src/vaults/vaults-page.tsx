/**
 * Vaults (K-305): every vault this account is a member of, with its role, and a form to create a
 * shared one. A vault whose log the client did not accept shows as such, never opened (DESIGN.md:
 * show trust, don't claim it).
 */

import type { CreateError, Vault } from "@kennwort/client/vaults/vaults.ts";
import {
  Badge,
  Button,
  Icon,
  Input,
  m,
  pageClass,
  panelClass,
  panelTitleClass,
} from "@kennwort/ui";
import { Archive, Handshake, TriangleExclamationPoint, Users } from "@kennwort/ui/icons";
import { createSignal, For, Match, onSettled, Show, Switch } from "solid-js";
import { Link } from "../frame/link.tsx";
import type { Navigation } from "../navigation.ts";
import type { Session } from "../session/session.ts";
import type { DialogApi } from "./dialog-state.ts";
import type { Exits } from "./exit.ts";
import { VaultMembersDialog } from "./vault-members-dialog.tsx";
import type { VaultStore } from "./vault-store.ts";
import { roleText } from "./vault-text.ts";

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
    <form class={`mt-6 ${panelClass}`} onSubmit={submit}>
      <div class="grid gap-1">
        <h2 class={panelTitleClass}>{m.vaults_create_title()}</h2>
        <p class="text-[13px] text-muted-foreground">{m.vaults_create_hint()}</p>
      </div>
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
      <Button type="submit" variant="primary" class="w-fit justify-self-end" disabled={busy()}>
        {m.vaults_create()}
      </Button>
    </form>
  );
};

export const VaultsPage = (props: {
  nav: Navigation;
  store: VaultStore;
  api: DialogApi;
  session: Session;
  /** Removing someone with the key rotation, and changing roles with the re-save (exit.ts) */
  exits: Pick<Exits, "remove" | "changeRole">;
  /** Hands a vault this account manages over to another company of the account (K-605) */
  onHandOver?: ((vault: Vault) => void) | undefined;
  /** Opens Team -> Groups focused on a specific group */
  onManageGroup?: ((groupId: string | undefined) => void) | undefined;
}) => {
  /** The vault whose members show: by ID, so the dialog stays open while the vaults load anew */
  const [membersOf, setMembersOf] = createSignal<string>();
  // Another device may have changed a vault: the page shows them as they are now
  onSettled(() => void props.store.reload());
  return (
    <section aria-labelledby="page-title" class={pageClass("wide")}>
      <h1 id="page-title" class="mb-6 text-[28px] font-semibold md:text-lg">
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
          {(ready) => {
            const selected = () => ready().vaults.find((v) => v.idText === membersOf());
            return (
              <div
                class={
                  selected()
                    ? "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]"
                    : ""
                }
              >
                <div class={selected() ? "hidden lg:block" : ""}>
                  <Show when={ready().vaults.length === 0 && ready().refused.length === 0}>
                    <p class="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
                      {m.vaults_empty()}
                    </p>
                  </Show>
                  <ul class="divide-y divide-border overflow-hidden rounded-xl border border-border empty:hidden">
                    <For each={ready().vaults}>
                      {(vault) => (
                        <li
                          class={
                            membersOf() === vault.idText
                              ? "flex flex-wrap items-center gap-2 bg-muted/60 pr-3 transition-colors"
                              : "flex flex-wrap items-center gap-2 pr-3 transition-colors hover:bg-muted/50"
                          }
                        >
                          <Link
                            nav={props.nav}
                            href={`/vaults/${vault.idText}`}
                            class="flex min-w-0 flex-1 items-center gap-3 px-4 py-3"
                          >
                            <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-accent">
                              <Icon icon={Archive} />
                            </span>
                            <span class="flex-1 truncate font-medium">
                              {vault.name ?? m.vaults_unnamed()}
                            </span>
                            <Badge variant="outline">{roleText(vault.role)}</Badge>
                          </Link>
                          <Button
                            aria-label={m.vault_members_of({
                              name: vault.name ?? m.vaults_unnamed(),
                            })}
                            onClick={() => setMembersOf(vault.idText)}
                          >
                            <Icon icon={Users} /> {m.vault_members_open()}
                          </Button>
                          <Show when={vault.role === "manage" ? props.onHandOver : undefined}>
                            {(handOver) => (
                              <Button
                                aria-label={m.handover_open({
                                  name: vault.name ?? m.vaults_unnamed(),
                                })}
                                onClick={() => handOver()(vault)}
                              >
                                <Icon icon={Handshake} /> {m.handover_button()}
                              </Button>
                            )}
                          </Show>
                        </li>
                      )}
                    </For>
                    <For each={ready().refused}>
                      {() => (
                        <li class="flex items-center gap-3 px-4 py-3 text-danger">
                          <Icon icon={TriangleExclamationPoint} />
                          <span class="flex-1">{m.vaults_refused()}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                  <CreateForm onCreate={props.store.create} />
                </div>
                <Show when={selected()}>
                  {(vault) => (
                    <VaultMembersDialog
                      open
                      onClose={() => setMembersOf(undefined)}
                      vault={vault()}
                      people={ready().people}
                      api={props.api}
                      session={props.session}
                      store={props.store}
                      onRemove={(accountId) =>
                        props.exits.remove(vault(), ready().trust, accountId, ready().left)
                      }
                      onRole={(accountId, role) => props.exits.changeRole(vault(), accountId, role)}
                      onManageGroups={(groupId) => {
                        setMembersOf(undefined);
                        if (props.onManageGroup) props.onManageGroup(groupId);
                        else props.nav.go("/groups");
                      }}
                    />
                  )}
                </Show>
              </div>
            );
          }}
        </Match>
      </Switch>
    </section>
  );
};
