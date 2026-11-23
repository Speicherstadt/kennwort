/**
 * The company root on the members page (K-307 part f, P-07). Everyone sees the code of the root
 * this account pinned, to compare a new one with; an owner replaces the root here, which the client
 * also does at once after an owner or admin left or became a member (members.ts). A new root the
 * server serves waits on every other client until the person compared its code with an owner and
 * confirmed: whoever left kept the old root and could sign a change of their own.
 */
import {
  confirmRootChange,
  type RootDeps,
  replaceRoot,
} from "@kennwort/client/root/root-change.ts";
import { comparisonCode } from "@kennwort/crypto";
import { Button, Dialog, m, panelClass, panelTitleClass } from "@kennwort/ui";
import { createSignal, Show } from "solid-js";
import type { Session } from "../session/session.ts";
import type { PendingRoot } from "./members.ts";

const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";
const codeClass = "rounded-lg bg-muted px-3 py-2 font-mono text-[15px] tracking-wide";

/** A change of the root waits for this person: the new root's code and the confirmation */
export const RootChangeNotice = (props: {
  session: Session;
  api: RootDeps;
  pending: PendingRoot;
  onConfirmed: () => Promise<unknown>;
}) => {
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const confirm = async () => {
    setBusy(true);
    setFailed(false);
    const done = await confirmRootChange(props.api, props.session, props.pending.changes);
    setBusy(false);
    setFailed(!done);
    if (done) await props.onConfirmed();
  };
  return (
    <section aria-labelledby="root-change-title" class="grid gap-3 rounded-xl border p-4">
      <h2 id="root-change-title" class="text-sm font-medium">
        {m.root_change_title()}
      </h2>
      <p class="text-[13px]">{m.root_change_text()}</p>
      <p class={codeClass} data-testid="root-change-code">
        {props.pending.code}
      </p>
      <Button
        variant="primary"
        class="h-11 w-fit md:h-8"
        disabled={busy()}
        onClick={() => void confirm()}
      >
        {busy() ? m.working() : m.root_change_confirm()}
      </Button>
      <Show when={failed()}>
        <p role="alert" class={alertClass}>
          {m.root_change_failed()}
        </p>
      </Show>
    </section>
  );
};

const ReplaceDialog = (props: { busy: boolean; onConfirm: () => void; onClose: () => void }) => (
  <Dialog open onClose={props.onClose} title={m.root_replace()}>
    <div class="grid gap-4">
      <p class="text-[13px]">{m.root_replace_text()}</p>
      <Button
        variant="primary"
        class="h-11 w-fit md:h-8"
        disabled={props.busy}
        onClick={() => props.onConfirm()}
      >
        {props.busy ? m.working() : m.root_replace_confirm()}
      </Button>
    </div>
  </Dialog>
);

/** The pinned root's code for everyone; for an owner with the root key, replacing it */
export const RootSection = (props: {
  session: Session;
  api: RootDeps;
  canReplace: boolean;
  onReplaced: () => Promise<unknown>;
}) => {
  const [asking, setAsking] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [result, setResult] = createSignal<"replaced" | "failed">();
  const code = () => {
    const opened = props.session.opened();
    return opened ? comparisonCode(opened.state.rootFingerprint) : undefined;
  };
  const replace = async () => {
    setBusy(true);
    const done = await replaceRoot(props.api, props.session);
    setBusy(false);
    setAsking(false);
    setResult(done.ok ? "replaced" : "failed");
    await props.onReplaced();
  };
  return (
    <section aria-labelledby="root-title" class={panelClass}>
      <h2 id="root-title" class={panelTitleClass}>
        {m.root_title()}
      </h2>
      <p class="text-[13px] text-muted-foreground">{m.root_code_text()}</p>
      <Show when={result() === "replaced"}>
        <p role="status" class="text-[13px] text-success">
          {m.root_replaced()}
        </p>
      </Show>
      <p class="text-xs font-medium">{m.root_code()}</p>
      <p class={codeClass} data-testid="root-code">
        {code()}
      </p>
      <Show when={props.canReplace}>
        <Button class="h-11 w-fit md:h-8" disabled={busy()} onClick={() => setAsking(true)}>
          {m.root_replace()}
        </Button>
      </Show>
      <Show when={result() === "failed"}>
        <p role="alert" class={alertClass}>
          {m.root_replace_failed()}
        </p>
      </Show>
      <Show when={asking()}>
        <ReplaceDialog
          busy={busy()}
          onConfirm={() => void replace()}
          onClose={() => setAsking(false)}
        />
      </Show>
    </section>
  );
};
