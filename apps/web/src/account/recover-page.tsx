/**
 * The passphrase is forgotten (P-12): the Recovery Key from the kit opens the account, the user
 * chooses a new passphrase and gets a new kit; the old Recovery Key is spent.
 */
import { parseRecoveryKey } from "@kennwort/crypto";
import { Button, Input, m } from "@kennwort/ui";
import { createSignal, Show } from "solid-js";
import type { Navigation } from "../navigation.ts";
import type { NewKeys, Session } from "../session/session.ts";
import { Card, errorText, passphraseProblem } from "./form.tsx";
import { Kit } from "./kit.tsx";
import { PassphraseFields } from "./setup-page.tsx";

export const RecoverPage = (props: { nav: Navigation; session: Session }) => {
  const [accountId, setAccountId] = createSignal(props.session.device()?.accountId ?? "");
  const [recoveryKey, setRecoveryKey] = createSignal("");
  const [passphrase, setPassphrase] = createSignal({ value: "", repeated: "" });
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const [keys, setKeys] = createSignal<NewKeys>();
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const key = parseRecoveryKey(recoveryKey());
    if (!key.ok) return setError(errorText("wrong-recovery-key"));
    const problem = passphraseProblem(passphrase().value, passphrase().repeated);
    if (problem) return setError(errorText(problem));
    setBusy(true);
    const result = await props.session.recover(key.value, passphrase().value, accountId().trim());
    setBusy(false);
    if (result.ok) setKeys(result.value);
    else setError(errorText(result.error));
  };
  return (
    <Show
      when={keys()}
      fallback={
        <Card title={m.recover_title()} error={error()}>
          <p class="text-[13px] text-muted-foreground">{m.recover_text()}</p>
          <form class="grid gap-4" onSubmit={submit}>
            <Input
              label={m.unlock_account()}
              value={accountId()}
              autocomplete="username"
              onInput={(event) => setAccountId(event.currentTarget.value)}
            />
            <Input
              label={m.kit_recovery_key()}
              autocomplete="off"
              onInput={(event) => setRecoveryKey(event.currentTarget.value)}
            />
            <PassphraseFields onInput={(value, repeated) => setPassphrase({ value, repeated })} />
            <Button type="submit" variant="primary" disabled={busy()}>
              {busy() ? m.working() : m.recover_submit()}
            </Button>
          </form>
        </Card>
      }
    >
      {(made) => <Kit keys={made()} onDone={() => props.nav.go("/entries")} />}
    </Show>
  );
};
