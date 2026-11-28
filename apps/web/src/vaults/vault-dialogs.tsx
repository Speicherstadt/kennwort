/**
 * Dialogs for Team → Vaults (K-608): destructive remove confirmation (alertdialog, focus on Cancel,
 * naming key rotation and "To change"), access time-limit dialog, and new-vault dialog.
 */
import type { CreateError } from "@kennwort/client/vaults/vaults.ts";
import { Button, Dialog, DialogFooter, Icon, Input, m } from "@kennwort/ui";
import { KeyRound } from "@kennwort/ui/icons";
import { createEffect, createSignal, Show } from "solid-js";
import { endOfDay, today } from "./day.ts";
import { displayName, firstNameOf, inputDateOf } from "./vault-access.ts";
import type { VaultMember } from "./vault-members.ts";

const createText = (error: CreateError) =>
  error === "uncertified" ? m.vaults_create_uncertified() : m.vaults_create_failed();

export const RemoveMemberDialog = (props: {
  member: VaultMember | undefined;
  vaultName: string;
  entryCount: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (member: VaultMember) => void;
}) => {
  let cancelBtn: HTMLButtonElement | undefined;
  createEffect(
    () => props.member !== undefined,
    (open) => {
      if (open) queueMicrotask(() => cancelBtn?.focus());
    },
  );
  const full = () => displayName(props.member?.name);
  const first = () => firstNameOf(props.member?.name);
  return (
    <Dialog
      open={props.member !== undefined}
      onClose={props.onClose}
      role="alertdialog"
      variant="destructive"
      size="sm"
      title={m.vault_access_remove_title({ name: first(), vault: props.vaultName })}
      description={m.vault_access_remove_desc({ fullName: full(), vault: props.vaultName })}
      footer={
        <>
          <Button
            ref={(el) => {
              cancelBtn = el;
            }}
            disabled={props.busy}
            onClick={() => props.onClose()}
          >
            {m.ui_cancel()}
          </Button>
          <Button
            variant="danger"
            disabled={props.busy}
            onClick={() => {
              const target = props.member;
              if (target) props.onConfirm(target);
            }}
          >
            {m.vault_access_remove_confirm()}
          </Button>
        </>
      }
    >
      <ol class="flex list-decimal flex-col gap-1.5 pl-4.5 text-[13px] text-muted-foreground">
        <li>{m.vault_access_remove_step1({ vault: props.vaultName, name: first() })}</li>
        <li>
          {props.entryCount === 1
            ? m.vault_access_remove_step2_one()
            : m.vault_access_remove_step2_many({ count: String(props.entryCount) })}
        </li>
        <li>{m.vault_access_remove_step3({ name: first() })}</li>
      </ol>
      <div class="flex gap-2.5 rounded-lg border border-warning bg-warning-surface p-3 text-[13px] text-foreground">
        <Icon icon={KeyRound} size={15} class="mt-0.5 shrink-0 text-warning" />
        <p>{m.vault_access_remove_warn({ name: first() })}</p>
      </div>
    </Dialog>
  );
};

export const UntilMemberDialog = (props: {
  member: VaultMember | undefined;
  vaultName: string;
  busy: boolean;
  onClose: () => void;
  onSave: (member: VaultMember, validUntil: number) => void;
}) => {
  const [day, setDay] = createSignal("");
  createEffect(
    () => props.member,
    (member) => {
      if (member) setDay(member.validUntil ? inputDateOf(member.validUntil) : today());
    },
  );
  const first = () => firstNameOf(props.member?.name);
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const target = props.member;
    if (!target || !day()) return;
    props.onSave(target, endOfDay(day()));
  };
  return (
    <Dialog
      open={props.member !== undefined}
      onClose={props.onClose}
      size="sm"
      title={m.vault_access_until_title({ name: first() })}
      description={m.vault_access_until_desc({ vault: props.vaultName, name: first() })}
    >
      <form class="grid gap-4" onSubmit={submit}>
        <Input
          label={m.vault_access_limit_date_label()}
          type="date"
          min={today()}
          value={day()}
          required
          onInput={(event) => setDay(event.currentTarget.value)}
        />
        <DialogFooter class="items-center">
          <Show when={(props.member?.validUntil ?? 0) > 0}>
            <Button
              variant="ghost"
              disabled={props.busy}
              class="md:mr-auto"
              onClick={() => {
                const target = props.member;
                if (target) props.onSave(target, 0);
              }}
            >
              {m.vault_access_until_no_end()}
            </Button>
          </Show>
          <Button disabled={props.busy} onClick={() => props.onClose()}>
            {m.ui_cancel()}
          </Button>
          <Button type="submit" variant="primary" disabled={props.busy || !day()}>
            {m.entry_editor_save()}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
};

export const CreateVaultDialog = (props: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<CreateError | undefined>;
}) => {
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
    if (!failed) {
      setName("");
      props.onClose();
    }
  };
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      size="sm"
      title={m.vaults_create_title()}
      description={m.vaults_create_hint()}
    >
      <form class="grid gap-3" onSubmit={submit}>
        <Input
          label={m.vaults_create_name()}
          value={name()}
          maxlength={100}
          required
          onInput={(event) => setName(event.currentTarget.value)}
        />
        <Show when={error()}>
          {(e) => (
            <p
              class="rounded-lg border border-danger px-3 py-2 text-[13px] text-danger"
              role="alert"
            >
              {createText(e())}
            </p>
          )}
        </Show>
        <DialogFooter>
          <Button disabled={busy()} onClick={() => props.onClose()}>
            {m.ui_cancel()}
          </Button>
          <Button type="submit" variant="primary" disabled={busy() || !name().trim()}>
            {m.vaults_create()}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
};
