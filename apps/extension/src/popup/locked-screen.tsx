/**
 * The popup while Kennwort is locked (DESIGN.md, Extension-Popup): lock, title, the passkey as the
 * one primary action and the passphrase as the way around it. Unlocking itself comes with K-402;
 * until then both say so instead of pretending to work.
 */
import { Button, Icon, m } from "@kennwort/ui";
import { Lock } from "@kennwort/ui/icons";
import { createSignal } from "solid-js";

export const LockedScreen = () => {
  const [notYet, setNotYet] = createSignal(false);
  return (
    <div class="flex h-[600px] w-[360px] flex-col bg-background text-foreground">
      <header class="flex items-center gap-2 border-b border-border px-4 py-3">
        <span class="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Icon icon={Lock} size={14} />
        </span>
        <span class="text-[13px] font-semibold">{m.app_name()}</span>
      </header>
      <main
        aria-labelledby="locked-title"
        class="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center"
      >
        <span class="grid size-12 place-items-center rounded-full bg-accent">
          <Icon icon={Lock} size={22} />
        </span>
        <h1 id="locked-title" class="text-[17px] font-semibold">
          {m.unlock_title()}
        </h1>
        <Button variant="primary" class="w-full" onClick={() => setNotYet(true)}>
          {m.popup_unlock_passkey()}
        </Button>
        <Button
          variant="ghost"
          class="underline-offset-4 hover:underline"
          onClick={() => setNotYet(true)}
        >
          {m.popup_use_passphrase()}
        </Button>
        <p role="status" class="min-h-4 text-xs text-muted-foreground">
          {notYet() ? m.popup_unlock_not_yet() : ""}
        </p>
      </main>
    </div>
  );
};
