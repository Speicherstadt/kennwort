/**
 * The tags of an entry in its dialog (K-306 part 5): each as a chip with a button to remove it,
 * a field to add one with Enter or the button; the search finds an entry by its tags
 */
import { Button, badgeVariants, cn, Icon, IconButton, Input, m } from "@kennwort/ui";
import { Plus, X } from "@kennwort/ui/icons";
import { createSignal, For } from "solid-js";
import { withTag } from "./entry-input.ts";

export const TagsInput = (props: { tags: string[]; onChange: (tags: string[]) => void }) => {
  const [draft, setDraft] = createSignal("");
  // A plain mirror, as in the editor: Solid 2 hands back the old value until the next flush
  let typed = "";
  const add = () => {
    props.onChange(withTag(props.tags, typed));
    typed = "";
    setDraft("");
  };
  return (
    <fieldset class="grid gap-2">
      <legend class="mb-1 text-xs font-medium">{m.entry_editor_tags()}</legend>
      <ul class="flex flex-wrap gap-1.5 empty:hidden">
        <For each={props.tags}>
          {(tag) => (
            <li class={cn(badgeVariants({ variant: "secondary" }), "gap-0.5 py-0 pr-0.5")}>
              {tag}
              <IconButton
                type="button"
                label={m.entry_editor_remove_tag({ tag })}
                onClick={() => props.onChange(props.tags.filter((t) => t !== tag))}
              >
                <Icon icon={X} />
              </IconButton>
            </li>
          )}
        </For>
      </ul>
      <div class="flex items-end gap-2">
        <div class="grid flex-1">
          <Input
            label={m.entry_editor_new_tag()}
            value={draft()}
            onInput={(event) => {
              typed = event.currentTarget.value;
              setDraft(typed);
            }}
            onKeyDown={(event) => {
              // Enter adds the tag instead of saving the entry
              if (event.key !== "Enter") return;
              event.preventDefault();
              add();
            }}
          />
        </div>
        <Button type="button" onClick={add}>
          <Icon icon={Plus} /> {m.entry_editor_add_tag()}
        </Button>
      </div>
    </fieldset>
  );
};
