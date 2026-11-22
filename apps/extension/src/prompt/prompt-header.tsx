/**
 * The head of the prompt frame (DESIGN.md, Speichern-Leiste and Phishing-Warnung): logo,
 * "Kennwort", the page's host in Geist Mono and × to close.
 */
import { Icon, IconButton, m } from "@kennwort/ui";
import { Lock, X } from "@kennwort/ui/icons";

export const PromptHeader = (props: { host: string; onClose: (event: MouseEvent) => void }) => (
  <header class="flex items-center gap-2 border-b border-border py-1 pr-1 pl-3">
    <span class="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
      <Icon icon={Lock} size={12} />
    </span>
    <span class="text-[13px] font-semibold">{m.app_name()}</span>
    <span class="min-w-0 flex-1 truncate text-right font-mono text-xs text-muted-foreground">
      {props.host}
    </span>
    <IconButton label={m.save_prompt_dismiss()} onClick={(event) => props.onClose(event)}>
      <Icon icon={X} size={14} />
    </IconButton>
  </header>
);
