/**
 * Accepting an invitation (P-08): the link's fragment (#token=…&s=…&root=…) never reaches the
 * server; the root fingerprint in it is pinned in the new account, so no server can slip in another
 * root, and the secret `s` binds the new bundle to this invitation, so the server cannot swap it.
 */
import { bytes } from "@kennwort/core";
import { Button, m } from "@kennwort/ui";
import { createSignal, Show } from "solid-js";
import type { Navigation } from "../navigation.ts";
import type { NewKeys, Session } from "../session/session.ts";
import { Card, errorText, passphraseProblem } from "./form.tsx";
import { Kit } from "./kit.tsx";
import { PassphraseFields } from "./setup-page.tsx";

/** Token, secret and root fingerprint from the fragment; undefined when any is missing or malformed */
export const readInvitation = (hash: string) => {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = params.get("token");
  const secret = bytes(32).safeParse(params.get("s"));
  const root = bytes(32).safeParse(params.get("root"));
  return token && secret.success && root.success
    ? { token, secret: secret.data, rootFingerprint: root.data }
    : undefined;
};

export const InvitePage = (props: {
  nav: Navigation;
  session: Session;
  id: string;
  hash: string;
}) => {
  const invitation = readInvitation(props.hash);
  const [passphrase, setPassphrase] = createSignal({ value: "", repeated: "" });
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const [keys, setKeys] = createSignal<NewKeys>();
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const problem = passphraseProblem(passphrase().value, passphrase().repeated);
    if (problem || !invitation) return setError(problem ? errorText(problem) : m.invite_broken());
    setBusy(true);
    const result = await props.session.accept(
      props.id,
      invitation.token,
      invitation.rootFingerprint,
      invitation.secret,
      passphrase().value,
    );
    setBusy(false);
    if (result.ok) setKeys(result.value);
    else setError(errorText(result.error));
  };
  return (
    <Show
      when={keys()}
      fallback={
        <Card title={m.invite_title()} error={invitation ? error() : m.invite_broken()}>
          <Show when={invitation}>
            <form class="grid gap-4" onSubmit={submit}>
              <PassphraseFields onInput={(value, repeated) => setPassphrase({ value, repeated })} />
              <Button type="submit" variant="primary" disabled={busy()}>
                {busy() ? m.working() : m.invite_submit()}
              </Button>
            </form>
          </Show>
        </Card>
      }
    >
      {(made) => <Kit keys={made()} onDone={() => props.nav.go("/entries")} />}
    </Show>
  );
};
