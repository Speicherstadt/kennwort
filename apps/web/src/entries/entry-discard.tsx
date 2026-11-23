/**
 * Leaving the inline editor with unsaved changes (DESIGN.md, Eintrag bearbeiten): a real modal
 * question, the one place the editor still uses a <dialog>. „Weiter bearbeiten“ is the safe choice
 * and has the focus; Esc keeps editing too.
 */
import { Button, Dialog, m } from "@kennwort/ui";

export const DiscardDialog = (props: {
  open: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}) => (
  <Dialog
    open={props.open}
    onClose={() => props.onKeep()}
    title={m.entry_editor_discard_title()}
    description={m.entry_editor_discard_text()}
  >
    <div class="flex flex-wrap justify-end gap-2 pt-2">
      <Button class="h-11 md:h-8" autofocus onClick={() => props.onKeep()}>
        {m.entry_editor_keep()}
      </Button>
      <Button variant="danger" class="h-11 md:h-8" onClick={() => props.onDiscard()}>
        {m.entry_editor_discard()}
      </Button>
    </div>
  </Dialog>
);
