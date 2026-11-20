/** The first owner of a company (P-01, P-07): setup code and passphrase, then the recovery kit */
import { Button, Input, m } from "@kennwort/ui";
import { createSignal, Show } from "solid-js";
import type { Navigation } from "../navigation.ts";
import type { NewKeys, Session } from "../session/session.ts";
import { Card, errorText, passphraseProblem } from "./form.tsx";
import { Kit } from "./kit.tsx";

export const PassphraseFields = (props: {
  onInput: (passphrase: string, repeated: string) => void;
}) => {
  let passphrase = "";
  let repeated = "";
  return (
    <>
      <Input
        label={m.passphrase()}
        hint={m.passphrase_hint()}
        type="password"
        autocomplete="new-password"
        onInput={(event) => {
          passphrase = event.currentTarget.value;
          props.onInput(passphrase, repeated);
        }}
      />
      <Input
        label={m.passphrase_repeat()}
        type="password"
        autocomplete="new-password"
        onInput={(event) => {
          repeated = event.currentTarget.value;
          props.onInput(passphrase, repeated);
        }}
      />
    </>
  );
};

export const SetupPage = (props: { nav: Navigation; session: Session }) => {
  const [code, setCode] = createSignal("");
  const [passphrase, setPassphrase] = createSignal({ value: "", repeated: "" });
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const [keys, setKeys] = createSignal<NewKeys>();
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const problem = passphraseProblem(passphrase().value, passphrase().repeated);
    if (problem) return setError(errorText(problem));
    setBusy(true);
    const result = await props.session.setUp(code(), passphrase().value);
    setBusy(false);
    if (result.ok) setKeys(result.value);
    else setError(errorText(result.error));
  };
  return (
    <Show
      when={keys()}
      fallback={
        <Card title={m.setup_title()} error={error()}>
          <form class="grid gap-4" onSubmit={submit}>
            <Input
              label={m.setup_code()}
              hint={m.setup_code_hint()}
              autocomplete="off"
              onInput={(event) => setCode(event.currentTarget.value)}
            />
            <PassphraseFields onInput={(value, repeated) => setPassphrase({ value, repeated })} />
            <Button type="submit" variant="primary" disabled={busy()}>
              {busy() ? m.working() : m.setup_submit()}
            </Button>
          </form>
        </Card>
      }
    >
      {(made) => <Kit keys={made()} onDone={() => props.nav.go("/entries")} />}
    </Show>
  );
};
