/** „Etikett drucken“ in the open app (K-605): which entry's label is open, and its dialog */
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import { createSignal, Show } from "solid-js";
import { LabelDialog } from "./label-dialog.tsx";

export const createLabels = () => {
  const [labelOf, setLabelOf] = createSignal<ShownEntry>();
  return {
    start: (entry: ShownEntry) => setLabelOf(entry),
    dialog: () => (
      <Show when={labelOf()}>
        {(entry) => (
          <LabelDialog
            entry={entry()}
            origin={location.origin}
            onClose={() => setLabelOf(undefined)}
          />
        )}
      </Show>
    ),
  };
};
