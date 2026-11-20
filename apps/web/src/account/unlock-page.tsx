/**
 * Unlocking (P-03) with the passphrase; a device that does not know the account yet also asks for
 * the account ID and the Secret Key, then remembers both. The welcome page is for a new device.
 */
import { parseSecretKey } from "@kennwort/crypto";
import { Button, Input, m } from "@kennwort/ui";
import { createSignal, Show } from "solid-js";
import type { Navigation } from "../navigation.ts";
import type { Session } from "../session/session.ts";
import { Card, errorText } from "./form.tsx";

export const UnlockPage = (props: { session: Session }) => {
  const [passphrase, setPassphrase] = createSignal("");
  const [accountId, setAccountId] = createSignal("");
  const [secretKey, setSecretKey] = createSignal("");
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const known = () => props.session.device() !== undefined;
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const key = known() ? undefined : parseSecretKey(secretKey());
    if (key && !key.ok) return setError(errorText("wrong-passphrase"));
    setBusy(true);
    const result = await props.session.unlock(
      passphrase(),
      key?.value,
      known() ? undefined : accountId().trim(),
    );
    setBusy(false);
    if (!result.ok) setError(errorText(result.error));
  };
  return (
    <Card title={m.unlock_title()} error={error()}>
      <form class="grid gap-4" onSubmit={submit}>
        <Show when={!known()}>
          <Input
            label={m.unlock_account()}
            autocomplete="username"
            onInput={(event) => setAccountId(event.currentTarget.value)}
          />
          <Input
            label={m.unlock_secret_key()}
            autocomplete="off"
            onInput={(event) => setSecretKey(event.currentTarget.value)}
          />
        </Show>
        <Input
          label={m.passphrase()}
          type="password"
          autocomplete="current-password"
          onInput={(event) => setPassphrase(event.currentTarget.value)}
        />
        <Button type="submit" variant="primary" disabled={busy()}>
          {busy() ? m.working() : m.unlock_submit()}
        </Button>
      </form>
    </Card>
  );
};

export const WelcomePage = (props: { nav: Navigation; onUnlock: () => void }) => (
  <Card title={m.welcome_title()}>
    <p class="text-[13px] text-muted-foreground">{m.welcome_text()}</p>
    <div class="flex flex-wrap gap-2">
      <Button variant="primary" onClick={() => props.nav.go("/setup")}>
        {m.welcome_setup()}
      </Button>
      <Button onClick={() => props.onUnlock()}>{m.unlock_other()}</Button>
    </div>
  </Card>
);
