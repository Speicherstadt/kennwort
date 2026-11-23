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
    variant="destructive"
    size="sm"
    footer={
      <>
        <Button autofocus onClick={() => props.onKeep()}>
          {m.entry_editor_keep()}
        </Button>
        <Button variant="danger" onClick={() => props.onDiscard()}>
          {m.entry_editor_discard()}
        </Button>
      </>
    }
  />
);
