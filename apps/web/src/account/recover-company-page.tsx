/**
 * Company recovery on the member's new device (K-307 part c, P-13): shows the pairing QR code for an
 * owner, polls, shows the comparison code, and once the owner confirmed and the account checks out
 * (recover-device.ts), lets the member choose a new passphrase and shows the new recovery kit. A
 * package it cannot open or whose code is not the one agreed ends the recovery.
 */
import { Button, m } from "@kennwort/ui";
import { createSignal, Match, onSettled, Show, Switch } from "solid-js";
import type { Navigation } from "../navigation.ts";
import { pairingLink } from "../pairing/link.ts";
import { announce, type NewDevicePairing } from "../pairing/pairing.ts";
import { QrCode } from "../pairing/qr-code.tsx";
import {
  finishRecovery,
  pollRecovery,
  type RecoverDeps,
  type RecoveryPoll,
} from "../recovery/recover-device.ts";
import type { NewKeys, Session } from "../session/session.ts";
import { Card, errorText, passphraseProblem } from "./form.tsx";
import { Kit } from "./kit.tsx";
import { type PairDeps, POLL_MS } from "./pair-page.tsx";
import { PassphraseFields } from "./setup-page.tsx";

type Confirmed = Extract<RecoveryPoll, { state: "confirmed" }>;

/** The QR code with the pairing link for the owner's device */
const LinkStep = (props: { link: string }) => (
  <>
    <p class="text-[13px] text-muted-foreground">{m.recovery_device_text()}</p>
    <div class="grid place-items-center">
      <QrCode text={props.link} label={m.pair_qr_label()} />
    </div>
    <p class="font-mono text-xs break-all text-muted-foreground" data-testid="pairing-link">
      {props.link}
    </p>
  </>
);

/** The comparison code, to agree to before the owner's confirmation counts */
const CodeStep = (props: {
  code: string;
  agreed: boolean;
  onAgree: () => void;
  onCancel: () => void;
}) => (
  <>
    <p class="text-[13px]">{m.pair_code_question()}</p>
    <p class="text-center font-mono text-3xl tracking-widest" data-testid="pairing-code">
      {`${props.code.slice(0, 3)} ${props.code.slice(3)}`}
    </p>
    <Show
      when={!props.agreed}
      fallback={<p class="text-[13px] text-muted-foreground">{m.pair_waiting()}</p>}
    >
      <div class="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => props.onAgree()}>
          {m.pair_agree()}
        </Button>
        <Button onClick={() => props.onCancel()}>{m.pair_cancel()}</Button>
      </div>
    </Show>
  </>
);

export const RecoverCompanyPage = (props: {
  nav: Navigation;
  session: Session;
  api: PairDeps & RecoverDeps["api"];
  derive?: RecoverDeps["derive"];
  pollMs?: number;
}) => {
  const [pairing, setPairing] = createSignal<NewDevicePairing>();
  const [state, setState] = createSignal<RecoveryPoll>({ state: "waiting" });
  const [agreed, setAgreed] = createSignal<string>();
  const [confirmed, setConfirmed] = createSignal<Confirmed>();
  const [passphrase, setPassphrase] = createSignal({ value: "", repeated: "" });
  const [keys, setKeys] = createSignal<NewKeys>();
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  // Plain variables beside the signals: a signal read right after its write gives the old value
  let finished = false;
  let announced: NewDevicePairing | undefined;
  let agreedCode: string | undefined;

  const take = (now: RecoveryPoll) => {
    if (now.state !== "confirmed" || now.code !== agreedCode) return;
    finished = true;
    setConfirmed(now);
  };
  const check = async () => {
    const current = pairing();
    // After the confirmation the server forgets the pairing: no more polling then
    const confirmedAlready = () => state().state === "confirmed";
    if (!current || finished || error() || confirmedAlready()) return;
    const now = await pollRecovery(props.api, current);
    if (finished || confirmedAlready()) return;
    if (now.state === "failed") return setError(m.recovery_device_failed());
    const shown = code();
    if (shown && now.state !== "waiting" && now.code !== shown)
      return setError(m.recovery_device_failed());
    setState(now);
    take(now);
  };
  onSettled(() => {
    void announce(props.api).then((made) => {
      announced = made;
      if (made) setPairing(made);
      else setError(m.error_unexpected());
    });
    const timer = setInterval(check, props.pollMs ?? POLL_MS);
    return () => {
      clearInterval(timer);
      if (announced && !finished) void props.api.cancelPairing(announced.id, announced.pollToken);
    };
  });
  const code = () => {
    const now = state();
    return now.state === "package" || now.state === "confirmed" ? now.code : undefined;
  };
  const link = () => {
    const current = pairing();
    return current ? pairingLink(location.origin, current.link) : undefined;
  };
  const submit = async (event: SubmitEvent, now: Confirmed) => {
    event.preventDefault();
    const problem = passphraseProblem(passphrase().value, passphrase().repeated);
    if (problem) return setError(errorText(problem));
    setBusy(true);
    const deps = { api: props.api, ...(props.derive ? { derive: props.derive } : {}) };
    const result = await finishRecovery(deps, now.content, now.token, passphrase().value);
    setBusy(false);
    if (!result.ok)
      return setError(
        result.error === "uncertified" ? m.recovery_device_untrusted() : m.recovery_device_failed(),
      );
    setError(undefined);
    props.session.adopt(result.value.opened, result.value.keys.secretKey);
    setKeys(result.value.keys);
  };

  return (
    <Show
      when={keys()}
      fallback={
        <Card title={m.recovery_device_title()} error={error()}>
          <Switch>
            <Match when={confirmed()}>
              {(now) => (
                <>
                  <p class="text-[13px] text-muted-foreground">{m.recovery_device_passphrase()}</p>
                  <form class="grid gap-4" onSubmit={(event) => submit(event, now())}>
                    <PassphraseFields
                      onInput={(value, repeated) => setPassphrase({ value, repeated })}
                    />
                    <Button type="submit" variant="primary" disabled={busy()}>
                      {busy() ? m.working() : m.recovery_device_submit()}
                    </Button>
                  </form>
                </>
              )}
            </Match>
            <Match when={code()}>
              {(shown) => (
                <CodeStep
                  code={shown()}
                  agreed={agreed() !== undefined}
                  onAgree={() => {
                    agreedCode = shown();
                    setAgreed(shown());
                    take(state());
                  }}
                  onCancel={() => props.nav.go("/")}
                />
              )}
            </Match>
            <Match when={link()}>{(text) => <LinkStep link={text()} />}</Match>
          </Switch>
        </Card>
      }
    >
      {(made) => <Kit keys={made()} onDone={() => props.nav.go("/entries")} />}
    </Show>
  );
};
