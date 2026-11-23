/**
 * Sharing one entry in a dialog (K-305 part 6b, P-10): the shares this device can trust, each with
 * a button to revoke it, and a form to share with a certified colleague outside the vault, with an
 * optional last day. Revoking writes the entry anew under a new entry key (shares.ts).
 */

import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import type { ShareApi } from "@kennwort/client/session/shares-api.ts";
import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import { type Certificate, idKey, type MemberView, type Share, type Trust } from "@kennwort/core";
import { Button, Dialog, Input, m, selectClass } from "@kennwort/ui";
import { createSignal, For, onSettled, Show } from "solid-js";
import type { Session } from "../session/session.ts";
import { dateText, endOfDay, today } from "../vaults/day.ts";
import { candidates, hasExpired } from "../vaults/vault-members.ts";
import {
  type EntryKeys,
  loadShares,
  personName,
  revokeShare,
  type ShareError,
  shareWith,
} from "./shares.ts";

const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";

const errorText = (error: ShareError) =>
  error === "past"
    ? m.vault_members_past()
    : error === "not-renewed"
      ? m.share_not_renewed()
      : error === "not-current"
        ? m.share_not_current()
        : m.share_failed();

const ShareRow = (props: { name: string; share: Share; busy: boolean; onRemove: () => void }) => (
  <li class="flex flex-wrap items-center gap-2 px-3 py-2">
    <span class="flex-1 truncate">
      {props.name}
      <Show when={props.share.validUntil !== 0}>
        <span class="ml-2 text-xs text-muted-foreground">
          {hasExpired(props.share)
            ? m.vault_members_expired()
            : m.vault_members_until({ date: dateText(props.share.validUntil) })}
        </span>
      </Show>
    </span>
    <Button
      aria-label={m.share_remove_of({ name: props.name })}
      disabled={props.busy}
      onClick={props.onRemove}
    >
      {m.vault_members_remove()}
    </Button>
  </li>
);

const ShareForm = (props: {
  people: (MemberView & { certificate: Certificate })[];
  busy: boolean;
  onShare: (person: Certificate, validUntil: number) => void;
}) => {
  const [chosen, setChosen] = createSignal("");
  const [until, setUntil] = createSignal("");
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const person = props.people.find((p) => idKey(p.accountId) === chosen());
    if (person) props.onShare(person.certificate, endOfDay(until()));
  };
  return (
    <form class="grid gap-2" onSubmit={submit}>
      <select
        aria-label={m.vault_members_person()}
        class={selectClass}
        value={chosen()}
        required
        onChange={(event) => setChosen(event.currentTarget.value)}
      >
        <option value="">{m.vault_members_choose()}</option>
        <For each={props.people}>
          {(person) => (
            <option value={idKey(person.accountId)}>{person.name ?? m.share_unnamed()}</option>
          )}
        </For>
      </select>
      <Input
        label={m.vault_members_until_label()}
        hint={m.share_until_hint()}
        type="date"
        min={today()}
        value={until()}
        onInput={(event) => setUntil(event.currentTarget.value)}
      />
      <Button type="submit" variant="primary" disabled={props.busy || chosen() === ""}>
        {m.detail_share()}
      </Button>
    </form>
  );
};

export type ShareDialogProps = {
  entry: ShownEntry;
  vault: Vault;
  people: MemberView[];
  trust: Trust;
  api: ShareApi;
  session: Session;
  keys: EntryKeys;
  onClose: () => void;
};

export const ShareDialog = (props: ShareDialogProps) => {
  const [shares, setShares] = createSignal<Share[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<ShareError>();
  const { api, session, keys } = props;
  const reload = async () => {
    const loaded = await loadShares(api, session, keys, props.vault, props.entry.id, props.trust);
    setShares(loaded ?? []);
  };
  onSettled(() => void reload());
  const run = async (change: () => Promise<{ ok: true } | { ok: false; error: ShareError }>) => {
    setBusy(true);
    const done = await change();
    setError(done.ok ? undefined : done.error);
    await reload();
    setBusy(false);
  };
  const nameOf = (accountId: Uint8Array) =>
    personName(props.people, accountId) ?? m.share_unnamed();
  // Whoever has a share already gets a new one only after it was removed
  const open = () =>
    candidates(props.vault, props.people).filter(
      (person) => !shares().some((s) => idKey(s.recipient) === idKey(person.accountId)),
    );
  return (
    <Dialog
      open
      onClose={props.onClose}
      title={m.share_title({ title: props.entry.title })}
      description={m.share_intro()}
      size="lg"
    >
      <h3 class="mb-1 text-sm font-semibold">{m.share_list()}</h3>
      <Show
        when={shares().length > 0}
        fallback={<p class="mb-4 text-[13px] text-muted-foreground">{m.share_none()}</p>}
      >
        <ul
          class="mb-4 divide-y divide-border rounded-xl border border-border"
          aria-label={m.share_list()}
        >
          <For each={shares()}>
            {(share) => (
              <ShareRow
                name={nameOf(share.recipient)}
                share={share}
                busy={busy()}
                onRemove={() =>
                  run(() =>
                    revokeShare(
                      api,
                      session,
                      keys,
                      props.vault,
                      props.entry.id,
                      share.recipient,
                      props.trust,
                    ),
                  )
                }
              />
            )}
          </For>
        </ul>
      </Show>
      <Show when={error()}>
        {(e) => (
          <p class={`mb-2 ${alertClass}`} role="alert">
            {errorText(e())}
          </p>
        )}
      </Show>
      <Show
        when={open().length > 0}
        fallback={<p class="text-[13px] text-muted-foreground">{m.share_no_candidates()}</p>}
      >
        <ShareForm
          people={open()}
          busy={busy()}
          onShare={(person, until) =>
            run(() => shareWith(api, session, keys, props.vault, props.entry.id, person, until))
          }
        />
      </Show>
    </Dialog>
  );
};
