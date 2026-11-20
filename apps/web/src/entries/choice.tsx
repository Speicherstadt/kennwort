/** A labelled select of the entry dialog: vault, type, a field's kind (K-306) */
import { selectClass } from "@kennwort/ui";
import { createUniqueId, For } from "solid-js";

export const Choice = (props: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) => {
  // Labelled by ID, not by wrapping: a wrapped select adds its chosen option to its name
  const id = createUniqueId();
  return (
    <div class="grid gap-1">
      <label for={id} class="text-xs font-medium">
        {props.label}
      </label>
      <select
        id={id}
        class={selectClass}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      >
        <For each={props.options}>{(o) => <option value={o.value}>{o.label}</option>}</For>
      </select>
    </div>
  );
};
