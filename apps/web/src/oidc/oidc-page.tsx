/**
 * Back from the identity provider (K-604, P-25): the server's redirect carries a one-time ticket
 * (or why the login failed) in the fragment, which the navigation already took from the address.
 * A known account gets no session from the provider's word: the app goes to the unlock screen. A
 * person without an account makes one here, like an invitee, under the company root the ticket
 * names; then the recovery kit, then the codes to compare with an owner or admin, who certifies.
 */
import type { OidcApi } from "@kennwort/client/session/oidc-api.ts";
import type { OidcTicket } from "@kennwort/core";
import { Button, m } from "@kennwort/ui";
import { createSignal, Match, onSettled, Show, Switch } from "solid-js";
import { Card, errorText, passphraseProblem } from "../account/form.tsx";
import { Kit } from "../account/kit.tsx";
import { PassphraseFields } from "../account/setup-page.tsx";
import { ownCodes } from "../members/enrolled.ts";
import type { Navigation } from "../navigation.ts";
import type { NewKeys, Session } from "../session/session.ts";

const ERRORS: Record<string, () => string> = {
  denied: () => m.oidc_error_denied(),
  state: () => m.oidc_error_state(),
  provider: () => m.oidc_error_provider(),
  token: () => m.oidc_error_token(),
  left: () => m.oidc_error_left(),
  "no-company": () => m.oidc_error_no_company(),
  "linked-elsewhere": () => m.oidc_error_linked_elsewhere(),
  "already-linked": () => m.oidc_error_already_linked(),
  "invalid-ticket": () => m.oidc_error_ticket(),
};

/** The ticket or the error code from the fragment; an unknown code reads as an expired login */
export const readOidcFragment = (hash: string) => {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const ticket = params.get("ticket");
  if (ticket && /^[A-Za-z0-9_-]{1,128}$/.test(ticket)) return { ticket };
  const error = params.get("error") ?? "state";
  return { error: Object.hasOwn(ERRORS, error) ? error : "state" };
};

type Shown =
  | { kind: "checking" }
  | { kind: "error"; text: string }
  | { kind: "enrol"; ticket: string; person: string | null; root: Uint8Array }
  | { kind: "kit"; keys: NewKeys }
  | { kind: "waiting" };

const errorOf = (code: string) => ({
  kind: "error" as const,
  text: (ERRORS[code] ?? ERRORS.state)?.() ?? "",
});

/** The form of a new account: a passphrase only, the Secret Key is made on this device */
const EnrolForm = (props: {
  person: string | null;
  error: string | undefined;
  onSubmit: (passphrase: string) => Promise<void>;
}) => {
  const [passphrase, setPassphrase] = createSignal({ value: "", repeated: "" });
  const [problem, setProblem] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const wrong = passphraseProblem(passphrase().value, passphrase().repeated);
    if (wrong) return setProblem(errorText(wrong));
    setBusy(true);
    await props.onSubmit(passphrase().value);
    setBusy(false);
  };
  return (
    <Card title={m.oidc_title()} error={problem() ?? props.error}>
      <Show when={props.person}>
        {(person) => <p class="text-[13px]">{m.oidc_enrol_as({ person: person() })}</p>}
      </Show>
      <p class="text-[13px] text-muted-foreground">{m.oidc_enrol_text()}</p>
      <form class="grid gap-4" onSubmit={submit}>
        <PassphraseFields onInput={(value, repeated) => setPassphrase({ value, repeated })} />
        <Button type="submit" variant="primary" disabled={busy()}>
          {busy() ? m.working() : m.invite_submit()}
        </Button>
      </form>
    </Card>
  );
};

/** The codes the person compares with an owner or admin, before any vault can be shared */
const Waiting = (props: { session: Session; onDone: () => void }) => (
  <Card title={m.oidc_waiting_title()}>
    <p class="text-[13px]">{m.oidc_waiting_text()}</p>
    <p class="text-xs font-medium">{m.oidc_waiting_own()}</p>
    <p class="rounded-lg bg-muted px-3 py-2 font-mono text-[15px]" data-testid="own-code">
      {ownCodes(props.session)?.own}
    </p>
    <p class="text-xs font-medium">{m.oidc_waiting_company()}</p>
    <p class="rounded-lg bg-muted px-3 py-2 font-mono text-[15px]" data-testid="company-code">
      {ownCodes(props.session)?.company}
    </p>
    <Button variant="primary" class="w-fit" onClick={() => props.onDone()}>
      {m.oidc_waiting_done()}
    </Button>
  </Card>
);

const shownFor = (ticket: string, redeemed: OidcTicket): Shown =>
  redeemed.kind === "enrol"
    ? { kind: "enrol", ticket, person: redeemed.name, root: redeemed.rootPublicKey }
    : { kind: "checking" };

export const OidcPage = (props: {
  nav: Navigation;
  session: Session;
  api: Pick<OidcApi, "redeemTicket">;
  hash: string;
}) => {
  // The fragment of this one return from the provider, read once like an invitation's
  const fragment = readOidcFragment(props.hash);
  const [shown, setShown] = createSignal<Shown>(
    fragment.ticket ? { kind: "checking" } : errorOf(fragment.error ?? "state"),
  );
  const [error, setError] = createSignal<string>();
  onSettled(() => {
    const ticket = fragment.ticket;
    if (!ticket) return;
    void props.api.redeemTicket(ticket).then((redeemed) => {
      if (!redeemed.ok) return setShown(errorOf(redeemed.error));
      // A known account unlocks with its passphrase as always
      if (redeemed.value.kind === "known") return props.nav.replace("/");
      setShown(shownFor(ticket, redeemed.value));
    });
  });
  const enrol = async (ticket: string, root: Uint8Array, passphrase: string) => {
    const made = await props.session.enrolOidc(ticket, root, passphrase);
    if (made.ok) setShown({ kind: "kit", keys: made.value });
    else
      setError(made.error === "invalid-invitation" ? m.oidc_error_ticket() : errorText(made.error));
  };
  return (
    <Switch>
      <Match when={shown().kind === "checking"}>
        <Card title={m.oidc_title()}>
          <p class="text-[13px] text-muted-foreground">{m.oidc_working()}</p>
        </Card>
      </Match>
      <Match when={shown().kind === "error" && (shown() as { text: string })}>
        {(failed) => (
          <Card title={m.oidc_title()} error={failed().text}>
            <Button class="w-fit" onClick={() => props.nav.replace("/")}>
              {m.oidc_back()}
            </Button>
          </Card>
        )}
      </Match>
      <Match when={shown().kind === "enrol" && (shown() as Extract<Shown, { kind: "enrol" }>)}>
        {(form) => (
          <EnrolForm
            person={form().person}
            error={error()}
            onSubmit={(passphrase) => enrol(form().ticket, form().root, passphrase)}
          />
        )}
      </Match>
      <Match when={shown().kind === "kit" && (shown() as Extract<Shown, { kind: "kit" }>)}>
        {(kit) => <Kit keys={kit().keys} onDone={() => setShown({ kind: "waiting" })} />}
      </Match>
      <Match when={shown().kind === "waiting"}>
        <Waiting session={props.session} onDone={() => props.nav.go("/entries")} />
      </Match>
    </Switch>
  );
};
