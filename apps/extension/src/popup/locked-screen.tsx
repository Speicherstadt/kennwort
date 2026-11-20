/**
 * The popup while Kennwort is locked (DESIGN.md, Extension-Popup): lock, title, the passphrase as
 * the one primary action, and another account. Unlocking with a passkey (PRF) is not built in any
 * client yet; the button comes with it instead of a button that does nothing.
 */
import { Button, Icon, Input, m } from "@kennwort/ui";
import { Lock } from "@kennwort/ui/icons";
import { createSignal } from "solid-js";
import type { PopupOutcome } from "../account/popup-account.ts";
import { errorText } from "./error-text.ts";
import { ErrorNote } from "./shell.tsx";

export const LockedScreen = (props: {
  server: string;
  onUnlock: (passphrase: string) => Promise<PopupOutcome>;
  onOther: () => void;
}) => {
  const [passphrase, setPassphrase] = createSignal("");
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await props.onUnlock(passphrase());
    setBusy(false);
    setError(result.ok ? undefined : errorText(result.error));
  };
  return (
    <main
      aria-labelledby="locked-title"
      class="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center"
    >
      <span class="grid size-12 place-items-center rounded-full bg-accent">
        <Icon icon={Lock} size={22} />
      </span>
      <div class="grid gap-1">
        <h1 id="locked-title" class="text-[17px] font-semibold">
          {m.unlock_title()}
        </h1>
        <p class="font-mono text-xs text-muted-foreground">
          {m.popup_account_on({ server: new URL(props.server).host })}
        </p>
      </div>
      <ErrorNote text={error()} />
      <form class="grid w-full gap-3 text-left" onSubmit={submit}>
        <Input
          label={m.passphrase()}
          type="password"
          autocomplete="current-password"
          required
          onInput={(event) => setPassphrase(event.currentTarget.value)}
        />
        <Button type="submit" variant="primary" class="w-full" disabled={busy()}>
          {busy() ? m.working() : m.unlock_submit()}
        </Button>
      </form>
      <Button
        variant="ghost"
        class="underline-offset-4 hover:underline"
        onClick={() => props.onOther()}
      >
        {m.unlock_other()}
      </Button>
    </main>
  );
};
