/**
 * The unlocked device (P-04): takes the pairing link (opened from the QR code or pasted), answers
 * with the package, shows the comparison code and admits the device only after the user confirms.
 */
import { Button, Input, m } from "@kennwort/ui";
import { createSignal, Match, Switch } from "solid-js";
import type { Navigation } from "../navigation.ts";
import { type PairingLink, readPairingLink } from "../pairing/link.ts";
import { type AnswerError, answerPairing } from "../pairing/pairing.ts";
import type { Session } from "../session/session.ts";
import { Card } from "./form.tsx";
import type { PairDeps } from "./pair-page.tsx";

const answerError = (error: AnswerError) =>
  ({ gone: m.add_error_gone(), "other-key": m.add_error_key(), unexpected: m.error_unexpected() })[
    error
  ];

export const AddDevicePage = (props: {
  nav: Navigation;
  session: Session;
  api: PairDeps;
  link?: string | undefined;
}) => {
  const [text, setText] = createSignal(props.link ?? "");
  const [answered, setAnswered] = createSignal<{ link: PairingLink; code: string }>();
  const [done, setDone] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);

  const connect = async (event: SubmitEvent) => {
    event.preventDefault();
    const link = readPairingLink(text());
    if (!link) return setError(m.add_error_link());
    const opened = props.session.opened();
    const secretKey = props.session.device()?.secretKey;
    if (!opened || !secretKey) return setError(m.error_unexpected());
    setBusy(true);
    const result = await answerPairing(props.api, opened, secretKey, link);
    setBusy(false);
    if (!result.ok) return setError(answerError(result.error));
    setError(undefined);
    setAnswered({ link, code: result.code });
  };
  const confirm = async (link: PairingLink) => {
    const token = props.session.opened()?.token;
    if (!token || !(await props.api.confirmPairing(token, link.id)))
      return setError(m.add_error_gone());
    setDone(true);
  };

  return (
    <Card title={m.add_title()} error={error()}>
      <Switch>
        <Match when={done()}>
          <p class="text-[13px]">{m.add_done()}</p>
          <Button class="w-fit" onClick={() => props.nav.go("/settings")}>
            {m.add_done_back()}
          </Button>
        </Match>
        <Match when={answered()}>
          {(shown) => (
            <>
              <p class="text-[13px]">{m.add_code_question()}</p>
              <p class="text-center font-mono text-3xl tracking-widest" data-testid="pairing-code">
                {`${shown().code.slice(0, 3)} ${shown().code.slice(3)}`}
              </p>
              <div class="flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => confirm(shown().link)}>
                  {m.add_confirm()}
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
            <Button type="submit" variant="primary" disabled={busy()}>
              {busy() ? m.working() : m.add_connect()}
            </Button>
          </form>
        </Match>
      </Switch>
    </Card>
  );
};
