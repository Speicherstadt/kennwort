/**
 * Team → Vaults (K-305, K-608): Master-Detail access management without groups.
 * Responsive via container queries: 3 columns (>= 1020px), 2 columns (600–1020px), and single
 * level list/detail navigation (< 600px). Every change is signed by a manager's device.
 */
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import { type Loaded, personalVaultId, type Vault } from "@kennwort/client/vaults/vaults.ts";
import { encodeBytes } from "@kennwort/core";
import { cn, Icon, m } from "@kennwort/ui";
import { Check } from "@kennwort/ui/icons";
import { createSignal, Match, onCleanup, onSettled, Show, Switch } from "solid-js";
import type { Navigation } from "../navigation.ts";
import type { Session } from "../session/session.ts";
import { createVaultRequestsState, type DialogApi } from "./dialog-state.ts";
import type { ExitError, Exits } from "./exit.ts";
import { createVaultActions, type VaultActions } from "./vault-actions.ts";
import { PersonalVaultDetail, VaultDetail } from "./vault-detail.tsx";
import { CreateVaultDialog, RemoveMemberDialog, UntilMemberDialog } from "./vault-dialogs.tsx";
import { VaultList } from "./vault-list.tsx";
import type { Request, VaultMember } from "./vault-members.ts";
import type { VaultStore } from "./vault-store.ts";

type AccessToast = { text: string; undo?: () => void };

const alertClass = "m-6 rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";

const AccessToastBar = (props: { toast: AccessToast | undefined; onDismiss: () => void }) => (
  <Show when={props.toast}>
    {(shown) => (
      <div
        role="status"
        aria-live="polite"
        class="absolute bottom-4.5 left-1/2 z-30 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-3 rounded-[10px] bg-primary px-3.5 py-2 text-[13px] whitespace-nowrap text-primary-foreground shadow-lg"
      >
        <Icon icon={Check} size={15} class="shrink-0 text-success" />
        <span>{shown().text}</span>
        <Show when={shown().undo}>
          {(undo) => (
            <button
              type="button"
              class="cursor-pointer font-semibold underline underline-offset-2"
              onClick={() => {
                undo()();
                props.onDismiss();
              }}
            >
              {m.vault_access_toast_undo()}
            </button>
          )}
        </Show>
      </div>
    )}
  </Show>
);

const createFeedback = () => {
  const [toast, setToast] = createSignal<AccessToast>();
  const [flashed, setFlashed] = createSignal<ReadonlySet<string>>(new Set());
  const [justAdded, setJustAdded] = createSignal<ReadonlySet<string>>(new Set());
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => {
    clearTimeout(toastTimer);
    clearTimeout(flashTimer);
  });
  return {
    toast,
    dismissToast: () => setToast(undefined),
    flashed,
    justAdded,
    clearJustAdded: () => setJustAdded(new Set<string>()),
    showToast: (text: string, undo?: () => void) => {
      clearTimeout(toastTimer);
      setToast(undo ? { text, undo } : { text });
      toastTimer = setTimeout(() => setToast(undefined), 5000);
    },
    flashKeys: (keys: string[], markAdded = false) => {
      clearTimeout(flashTimer);
      setFlashed(new Set(keys));
      if (markAdded) setJustAdded(new Set(keys));
      flashTimer = setTimeout(() => setFlashed(new Set()), 1900);
    },
  };
};

const VaultsReady = (props: {
  ready: Loaded;
  personalId: string | undefined;
  me: Uint8Array;
  entryCountOf: (vaultId: string) => number;
  requestsOf: (vaultId: string) => Request[];
  busy: boolean;
  error: ExitError | undefined;
  flashed: ReadonlySet<string>;
  justAdded: ReadonlySet<string>;
  actions: VaultActions;
  onClearJustAdded: () => void;
  onAskRemove: (member: VaultMember) => void;
  onAskLimit: (member: VaultMember) => void;
  onCreate: () => void;
  onHandOver?: ((vault: Vault) => void) | undefined;
  removing: VaultMember | undefined;
  limiting: VaultMember | undefined;
  onCloseDialogs: () => void;
}) => {
  const [selectedId, setSelectedId] = createSignal<string>();
  const [phoneScreen, setPhoneScreen] = createSignal<"list" | "detail">("list");
  const shared = () => props.ready.vaults.filter((v) => v.idText !== props.personalId);
  const personal = () => props.ready.vaults.find((v) => v.idText === props.personalId);
  const activeId = () => {
    const picked = selectedId();
    if (picked && props.ready.vaults.some((v) => v.idText === picked)) return picked;
    return shared()[0]?.idText ?? personal()?.idText;
  };
  const activeVault = () => props.ready.vaults.find((v) => v.idText === activeId());

  return (
    <>
      <div class="grid min-h-0 flex-1 grid-cols-[264px_minmax(0,1fr)] @max-[1020px]:grid-cols-[232px_minmax(0,1fr)] @max-[600px]:grid-cols-1">
        <VaultList
          shared={shared()}
          personal={personal()}
          refused={props.ready.refused}
          selectedId={activeId()}
          requestCount={(id) => props.requestsOf(id).length}
          onSelect={(id) => {
            setSelectedId(id);
            setPhoneScreen("detail");
            props.onClearJustAdded();
          }}
          onCreate={props.onCreate}
          hiddenOnPhone={phoneScreen() === "detail"}
        />
        <div class={cn("min-w-0 overflow-auto", phoneScreen() === "list" && "@max-[600px]:hidden")}>
          <Show
            when={activeVault()}
            fallback={
              <p class="m-6 rounded-xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
                {m.vaults_empty()}
              </p>
            }
          >
            {(vault) => (
              <Show
                when={vault().idText !== props.personalId}
                fallback={
                  <PersonalVaultDetail
                    name={vault().name ?? m.vaults_personal_name()}
                    onBack={() => setPhoneScreen("list")}
                  />
                }
              >
                <VaultDetail
                  vault={vault()}
                  people={props.ready.people}
                  me={props.me}
                  entryCount={props.entryCountOf(vault().idText)}
                  requests={props.requestsOf(vault().idText)}
                  busy={props.busy}
                  error={props.error}
                  flashedKeys={props.flashed}
                  justAddedKeys={props.justAdded}
                  onBack={() => setPhoneScreen("list")}
                  onAdd={(chosen, role, until) => props.actions.add(vault(), chosen, role, until)}
                  onRole={(member, role) => void props.actions.role(vault(), member, role)}
                  onUntil={props.onAskLimit}
                  onRemove={props.onAskRemove}
                  onGrant={(request) => void props.actions.grant(vault(), request)}
                  onDecline={(request) => void props.actions.decline(vault(), request)}
                  onHandOver={props.onHandOver ? () => props.onHandOver?.(vault()) : undefined}
                />
              </Show>
            )}
          </Show>
        </div>
      </div>
      <Show when={activeVault()}>
        {(vault) => (
          <>
            <RemoveMemberDialog
              member={props.removing}
              vaultName={vault().name ?? m.vaults_unnamed()}
              entryCount={props.entryCountOf(vault().idText)}
              busy={props.busy}
              onClose={props.onCloseDialogs}
              onConfirm={(member) => void props.actions.remove(vault(), member)}
            />
            <UntilMemberDialog
              member={props.limiting}
              vaultName={vault().name ?? m.vaults_unnamed()}
              busy={props.busy}
              onClose={props.onCloseDialogs}
              onSave={(member, until) => void props.actions.until(vault(), member, until)}
            />
          </>
        )}
      </Show>
    </>
  );
};

export const VaultsPage = (props: {
  nav: Navigation;
  store: VaultStore;
  api: DialogApi;
  session: Session;
  exits: Pick<Exits, "remove" | "changeRole">;
  entries?: (() => ShownEntry[]) | undefined;
  onHandOver?: ((vault: Vault) => void) | undefined;
}) => {
  const [creating, setCreating] = createSignal(false);
  const [removing, setRemoving] = createSignal<VaultMember>();
  const [limiting, setLimiting] = createSignal<VaultMember>();
  const fb = createFeedback();
  const closeDialogs = () => {
    setRemoving(undefined);
    setLimiting(undefined);
  };
  onSettled(() => void props.store.reload());

  const readyData = () => {
    const shown = props.store.shown();
    return shown.state === "ready" ? shown : undefined;
  };
  const reqState = createVaultRequestsState({
    vaults: () => readyData()?.vaults ?? [],
    people: () => readyData()?.people ?? [],
    api: props.api,
    session: props.session,
    store: props.store,
  });
  const actions = createVaultActions({
    api: props.api,
    session: props.session,
    exits: props.exits,
    ready: readyData,
    run: reqState.run,
    flashKeys: fb.flashKeys,
    showToast: fb.showToast,
    closeDialogs,
  });
  const personalId = () => {
    const opened = props.session.opened();
    return opened ? encodeBytes(personalVaultId(opened)) : undefined;
  };
  const entryCountOf = (vaultId: string) =>
    (props.entries?.() ?? []).filter((e) => e.vault === vaultId).length;

  return (
    <section
      aria-label={m.vaults_title()}
      class="@container relative flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <h1 class="sr-only">{m.vaults_title()}</h1>
      <Switch>
        <Match when={props.store.shown().state === "loading"}>
          <p class="p-6 text-muted-foreground">{m.vaults_loading()}</p>
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
        <Match when={readyData()}>
          {(ready) => (
            <VaultsReady
              ready={ready()}
              personalId={personalId()}
              me={props.session.opened()?.accountId ?? new Uint8Array()}
              entryCountOf={entryCountOf}
              requestsOf={reqState.requestsOf}
              busy={reqState.busy()}
              error={reqState.error()}
              flashed={fb.flashed()}
              justAdded={fb.justAdded()}
              actions={actions}
              onClearJustAdded={fb.clearJustAdded}
              onAskRemove={setRemoving}
              onAskLimit={setLimiting}
              onCreate={() => setCreating(true)}
              onHandOver={props.onHandOver}
              removing={removing()}
              limiting={limiting()}
              onCloseDialogs={closeDialogs}
            />
          )}
        </Match>
      </Switch>
      <CreateVaultDialog
        open={creating()}
        onClose={() => setCreating(false)}
        onCreate={props.store.create}
      />
      <AccessToastBar toast={fb.toast()} onDismiss={fb.dismissToast} />
    </section>
  );
};
