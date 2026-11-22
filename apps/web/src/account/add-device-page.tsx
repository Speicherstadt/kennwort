/**
 * The unlocked device (P-04): takes the pairing link (opened from the QR code or pasted), answers
 * with the package, shows the comparison code and admits the device only after the user confirms.
 * An owner may instead choose a certified member and recover that member's access to the device
 * (K-307 part c, P-13): the member lost passphrase and Recovery Key, the owner answers with the
 * member's deposited AK.
 */
import { encodeBytes, type MemberView } from "@kennwort/core";
import { Button, Input, m } from "@kennwort/ui";
import { createSignal, Match, onSettled, Show, Switch } from "solid-js";
import { Choice } from "../entries/choice.tsx";
import { loadMembers, type MembersDeps } from "../members/members.ts";
import type { Navigation } from "../navigation.ts";
import { type PairingLink, readPairingLink } from "../pairing/link.ts";
import { type AnswerError, answerPairing } from "../pairing/pairing.ts";
import { type ApproveError, approveMember, confirmRecovery } from "../recovery/approve.ts";
import type { Session } from "../session/session.ts";
import { Card } from "./form.tsx";
import type { PairDeps } from "./pair-page.tsx";

const answerError = (error: AnswerError | ApproveError) =>
  ({
    gone: m.add_error_gone(),
    "other-key": m.add_error_key(),
    unexpected: m.error_unexpected(),
    "no-key": m.add_error_no_key(),
    "no-deposit": m.add_error_no_deposit(),
    refused: m.add_error_refused(),
  })[error];

export type AddDeviceDeps = PairDeps & MembersDeps;

/** Members an owner may recover: certified, still in the company, not the owner itself */
const recoverable = (views: MemberView[], me: MemberView | undefined) =>
  me?.role === "owner" && me.status === "certified"
    ? views.filter(
        (v) =>
          v.status === "certified" &&
          v.leftAt == null &&
          encodeBytes(v.accountId) !== encodeBytes(me.accountId),
      )
    : [];

export const AddDevicePage = (props: {
  nav: Navigation;
  session: Session;
  api: AddDeviceDeps;
  link?: string | undefined;
}) => {
  const [text, setText] = createSignal(props.link ?? "");
  const [members, setMembers] = createSignal<MemberView[]>([]);
  // Empty for this account's own new device, else the member's ID to recover
  const [target, setTarget] = createSignal("");
  const [answered, setAnswered] = createSignal<{
    link: PairingLink;
    code: string;
    member?: MemberView;
  }>();
  const [done, setDone] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  // The members an owner may recover, loaded once the page is on screen
  onSettled(() => {
    const opened = props.session.opened();
    if (!opened) return;
    void loadMembers(props.api, opened).then((loaded) => {
      if (loaded.ok) setMembers(recoverable(loaded.value.views, loaded.value.me));
    });
  });
  const chosen = () => members().find((v) => encodeBytes(v.accountId) === target());

  const connect = async (event: SubmitEvent) => {
    event.preventDefault();
    const link = readPairingLink(text());
    if (!link) return setError(m.add_error_link());
    const opened = props.session.opened();
    const secretKey = props.session.device()?.secretKey;
    if (!opened || !secretKey) return setError(m.error_unexpected());
    const member = chosen();
    setBusy(true);
    const result = member
      ? await approveMember(props.api, opened, member, link)
      : await answerPairing(props.api, opened, secretKey, link);
    setBusy(false);
    if (!result.ok) return setError(answerError(result.error));
    setError(undefined);
    setAnswered({ link, code: result.code, ...(member ? { member } : {}) });
  };
  const confirm = async (shown: { link: PairingLink; member?: MemberView }) => {
    const opened = props.session.opened();
    const confirmed =
      opened !== undefined &&
      (shown.member
        ? await confirmRecovery(props.api, opened, shown.member, shown.link)
        : await props.api.confirmPairing(opened.token, shown.link.id));
    if (!confirmed) return setError(m.add_error_gone());
    setDone(true);
  };

  return (
    <Card title={m.add_title()} error={error()}>
      <Switch>
        <Match when={done()}>
          <p class="text-[13px]">{answered()?.member ? m.add_recovery_done() : m.add_done()}</p>
          <Button class="w-fit" onClick={() => props.nav.go("/settings")}>
            {m.add_done_back()}
          </Button>
        </Match>
        <Match when={answered()}>
          {(shown) => (
            <>
              <p class="text-[13px]">
                {shown().member ? m.add_recovery_code_question() : m.add_code_question()}
              </p>
              <p class="text-center font-mono text-3xl tracking-widest" data-testid="pairing-code">
                {`${shown().code.slice(0, 3)} ${shown().code.slice(3)}`}
              </p>
              <div class="flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => confirm(shown())}>
                  {shown().member ? m.add_recovery_confirm() : m.add_confirm()}
                </Button>
                <Button onClick={() => props.nav.go("/settings")}>{m.pair_cancel()}</Button>
              </div>
            </>
          )}
        </Match>
        <Match when={true}>
          <p class="text-[13px] text-muted-foreground">{m.add_text()}</p>
          <form class="grid gap-4" onSubmit={connect}>
            <Input
              label={m.add_link()}
              value={text()}
              autocomplete="off"
              onInput={(event) => setText(event.currentTarget.value)}
            />
            <Show when={members().length > 0}>
              <Choice
                label={m.add_for()}
                value={target()}
                options={[
                  { value: "", label: m.add_for_me() },
                  ...members().map((v) => ({
                    value: encodeBytes(v.accountId),
                    label: m.add_for_member({ name: v.name ?? encodeBytes(v.accountId) }),
                  })),
                ]}
                onChange={setTarget}
              />
            </Show>
            <Button type="submit" variant="primary" disabled={busy()}>
              {busy() ? m.working() : m.add_connect()}
            </Button>
          </form>
        </Match>
      </Switch>
    </Card>
  );
};
