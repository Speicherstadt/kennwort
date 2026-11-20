/**
 * The new device (P-04): shows a QR code with the pairing link, polls, shows the comparison code
 * once the unlocked device answered, and joins the account when the user agrees and the other
 * device confirmed. A package it cannot open, or one whose code is not the one shown, ends the
 * pairing; after the confirmation it stops polling, as the server then forgets the pairing.
 */
import { Button, m } from "@kennwort/ui";
import { createSignal, onSettled, Show } from "solid-js";
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
  // The code the user agreed to: only the package behind it may join (review of K-303)
  const [agreed, setAgreed] = createSignal<string>();
  const [error, setError] = createSignal<string>();
  let finished = false;
  // What the cleanup cancels: the signal gives the old value until the next flush (Solid 2 batching)
  let announced: NewDevicePairing | undefined;

  // The agreed code is passed in from the click: a signal read right after its write still sees
  // the old value until the next flush
  const finish = async (now: PollState, agreedCode = agreed()) => {
    if (finished || now.state !== "confirmed" || agreedCode !== now.code) return;
    finished = true;
    const joined = await joinAccount(props.api, now.content, now.token);
    if (!joined) return setError(m.pair_failed());
    props.session.adopt(joined, now.content.secretKey);
    props.nav.replace("/entries");
  };
  const check = async () => {
    const current = pairing();
    const confirmed = () => state().state === "confirmed";
    if (!current || finished || error() || confirmed()) return;
    const now = await poll(props.api, current);
    if (finished || confirmed()) return;
    if (now.state === "failed") return setError(m.pair_failed());
    const shown = code();
    if (shown && now.state !== "waiting" && now.code !== shown) return setError(m.pair_failed());
    setState(now);
    await finish(now);
  };
  // Announced and polled once the page is on screen; leaving it cancels a pairing not finished
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
                    setAgreed(shown());
                    void finish(state(), shown());
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
