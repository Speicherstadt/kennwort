/**
 * The mobile app's first start: the company's server, as the extension asks for it (K-402). The
 * address is checked here (serverOrigin, packages/client) and again in Rust before it is stored;
 * from then on every API call goes only there (native-send.ts). Another server later means
 * clearing the app's data (docs/handy.md).
 */
import { serverOrigin } from "@kennwort/client/session/server-url.ts";
import { Button, Input, m } from "@kennwort/ui";
import { createSignal } from "solid-js";
import { Card } from "../account/form.tsx";
import type { AppServer, ServerSetupError } from "./native-send.ts";

const setupText = (error: ServerSetupError): string =>
  ({
    "invalid-server": m.error_invalid_server(),
    "insecure-server": m.error_insecure_server(),
    "storage-failed": m.mobile_server_storage_failed(),
    unexpected: m.error_unexpected(),
  })[error];

export const ServerSetup = (props: { server: AppServer; onReady: (origin: string) => void }) => {
  const [typed, setTyped] = createSignal("");
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const checked = serverOrigin(typed());
    if (!checked.ok) return setError(setupText(checked.error));
    setBusy(true);
    const stored = await props.server.store(checked.value);
    setBusy(false);
    if (!stored.ok) return setError(setupText(stored.error));
    props.onReady(stored.value);
  };
  return (
    <Card title={m.mobile_server_title()} error={error()}>
      <p class="text-[13px] text-muted-foreground">{m.mobile_server_text()}</p>
      <form class="grid gap-3" onSubmit={submit}>
        <Input
          label={m.popup_server()}
          type="url"
          inputmode="url"
          autocomplete="url"
          placeholder="https://kennwort.example.com"
          required
          onInput={(event) => setTyped(event.currentTarget.value)}
        />
        <Button type="submit" variant="primary" disabled={busy()}>
          {busy() ? m.working() : m.mobile_server_submit()}
        </Button>
      </form>
    </Card>
  );
};
