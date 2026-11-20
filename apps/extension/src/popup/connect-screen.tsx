/**
 * Connecting the extension (K-402): the company's server, the account ID and the Secret Key from
 * the recovery kit, and the passphrase. The extension keeps the first three in its session area
 * until the browser closes (account/records.ts); the passphrase only for this one unlock.
 */
import { Button, Input, m } from "@kennwort/ui";
import { createSignal } from "solid-js";
import type { ConnectInput, PopupOutcome } from "../account/popup-account.ts";
import { errorText } from "./error-text.ts";
import { ErrorNote } from "./shell.tsx";

export const ConnectScreen = (props: {
  onConnect: (input: ConnectInput) => Promise<PopupOutcome>;
}) => {
  const [server, setServer] = createSignal("");
  const [accountId, setAccountId] = createSignal("");
  const [secretKey, setSecretKey] = createSignal("");
  const [passphrase, setPassphrase] = createSignal("");
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await props.onConnect({
      server: server(),
      accountId: accountId(),
      secretKey: secretKey(),
      passphrase: passphrase(),
    });
    setBusy(false);
    setError(result.ok ? undefined : errorText(result.error));
  };
  return (
    <main aria-labelledby="connect-title" class="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      <h1 id="connect-title" class="text-[17px] font-semibold">
        {m.popup_connect_title()}
      </h1>
      <p class="text-xs text-muted-foreground">{m.popup_connect_text()}</p>
      <ErrorNote text={error()} />
      <form class="grid gap-3" onSubmit={submit}>
        <Input
          label={m.popup_server()}
          type="url"
          autocomplete="url"
          required
          onInput={(event) => setServer(event.currentTarget.value)}
        />
        <Input
          label={m.unlock_account()}
          autocomplete="username"
          required
          onInput={(event) => setAccountId(event.currentTarget.value)}
        />
        <Input
          label={m.unlock_secret_key()}
          autocomplete="off"
          required
          onInput={(event) => setSecretKey(event.currentTarget.value)}
        />
        <Input
          label={m.passphrase()}
          type="password"
          autocomplete="current-password"
          required
          onInput={(event) => setPassphrase(event.currentTarget.value)}
        />
        <Button type="submit" variant="primary" disabled={busy()}>
          {busy() ? m.working() : m.popup_connect_submit()}
        </Button>
      </form>
    </main>
  );
};
