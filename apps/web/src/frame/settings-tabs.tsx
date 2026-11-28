/** Tabs for the settings groups: wrapped pills on phones, vertical sidebar from md */
import { cn, m } from "@kennwort/ui";
import { For } from "solid-js";

export type SettingsTabGroup = { id: string; title: string; danger?: boolean };

export const SectionTabs = (props: {
  groups: SettingsTabGroup[];
  active: string;
  onSelect: (id: string) => void;
}) => {
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const count = props.groups.length;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (index + 1) % count
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index - 1 + count) % count
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? count - 1
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    const group = props.groups[next];
    if (!group) return;
    props.onSelect(group.id);
    const tabs = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>(
      '[role="tab"]',
    );
    tabs?.[next]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={m.settings_sections()}
      class="flex flex-wrap gap-1.5 border-b border-border pb-3 md:sticky md:top-0 md:flex-col md:flex-nowrap md:gap-1 md:self-start md:border-b-0 md:pb-0"
    >
      <For each={props.groups}>
        {(group, index) => {
          const selected = () => props.active === group.id;
          return (
            <button
              type="button"
              role="tab"
              id={`tab-${group.id}`}
              tabindex={selected() ? 0 : -1}
              aria-selected={selected() ? "true" : "false"}
              aria-controls="settings-panel"
              class={cn(
                "min-h-11 shrink-0 rounded-lg px-3 py-2 text-left text-[13px] whitespace-nowrap transition-colors md:min-h-0 md:w-full md:py-1.5",
                selected()
                  ? group.danger
                    ? "bg-danger/10 font-medium text-danger"
                    : "bg-accent font-medium text-foreground"
                  : group.danger
                    ? "text-danger hover:bg-danger/10"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
              onClick={() => props.onSelect(group.id)}
              onKeyDown={(event) => onKeyDown(event, index())}
            >
              {group.title}
            </button>
          );
        }}
      </For>
    </div>
  );
};
