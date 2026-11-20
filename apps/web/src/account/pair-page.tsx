/**
 * The new device (P-04): shows a QR code with the pairing link, polls, shows the comparison code
 * once the unlocked device answered, and joins the account when the user agrees and the other
 * device confirmed. A package it cannot open ends the pairing.
 */
import { Button, m } from "@kennwort/ui";
import { createSignal, onCleanup, Show } from "solid-js";
import type { Navigation } from "../navigation.ts";
import { pairingLink } from "../pairing/link.ts";
import {
  announce,
  joinAccount,
  type NewDevicePairing,
  type PollState,
  poll,
} from "../pairing/pairing.ts";
import { QrCode } from "../pairing/qr-code.tsx";
import type { AccountApi } from "../session/api.ts";
import type { PairingApi } from "../session/pairing-api.ts";
import type { Session } from "../session/session.ts";
import { Card } from "./form.tsx";

export type PairDeps = PairingApi & Pick<AccountApi, "keys">;
/** Polling every four seconds stays inside the server's 20 requests a minute per address */
export const POLL_MS = 4000;

export const PairPage = (props: {
  nav: Navigation;
  session: Session;
  api: PairDeps;
  pollMs?: number;
}) => {
  const [pairing, setPairing] = createSignal<NewDevicePairing>();
  const [state, setState] = createSignal<PollState>({ state: "waiting" });
  const [agreed, setAgreed] = createSignal(false);
  const [error, setError] = createSignal<string>();
  let finished = false;

  const finish = async (now: PollState) => {
    if (finished || now.state !== "confirmed" || !agreed()) return;
    finished = true;
    const joined = await joinAccount(props.api, now.content, now.token);
    if (!joined) return setError(m.pair_failed());
    props.session.adopt(joined, now.content.secretKey);
    props.nav.replace("/entries");
  };
  const check = async () => {
    const current = pairing();
    if (!current || finished || error()) return;
    const now = await poll(props.api, current);
    if (now.state === "failed") return setError(m.pair_failed());
    setState(now);
    await finish(now);
  };
  void announce(props.api).then((made) =>
    made ? setPairing(made) : setError(m.error_unexpected()),
  );
  const timer = setInterval(check, props.pollMs ?? POLL_MS);
  onCleanup(() => {
    clearInterval(timer);
    const current = pairing();
    if (current && !finished) void props.api.cancelPairing(current.id, current.pollToken);
  });
  const code = () => {
    const now = state();
    return now.state === "package" || now.state === "confirmed" ? now.code : undefined;
  };
  const link = () => {
    const current = pairing();
    return current ? pairingLink(location.origin, current.link) : undefined;
  };

  return (
    <Card title={m.pair_title()} error={error()}>
      <Show
        when={code()}
        fallback={
          <Show when={link()}>
            {(text) => (
              <>
                <p class="text-[13px] text-muted-foreground">{m.pair_text()}</p>
                <div class="grid place-items-center">
                  <QrCode text={text()} label={m.pair_qr_label()} />
                </div>
                <p
                  class="font-mono text-xs break-all text-muted-foreground"
                  data-testid="pairing-link"
                >
                  {text()}
                </p>
              </>
            )}
          </Show>
        }
      >
        {(shown) => (
          <>
            <p class="text-[13px]">{m.pair_code_question()}</p>
            <p class="text-center font-mono text-3xl tracking-widest" data-testid="pairing-code">
              {`${shown().slice(0, 3)} ${shown().slice(3)}`}
            </p>
            <Show
              when={!agreed()}
              fallback={<p class="text-[13px] text-muted-foreground">{m.pair_waiting()}</p>}
            >
              <div class="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  onClick={() => {
                    setAgreed(true);
                    void finish(state());
                  }}
                >
                  {m.pair_agree()}
                </Button>
                <Button onClick={() => props.nav.go("/")}>{m.pair_cancel()}</Button>
              </div>
            </Show>
          </>
        )}
      </Show>
    </Card>
  );
};
