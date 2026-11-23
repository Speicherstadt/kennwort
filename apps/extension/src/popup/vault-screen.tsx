/**
 * The popup while the account is open (DESIGN.md, Extension-Popup): search, the entries for the
 * page in the active tab, all entries or the favorites, the generator, and a footer with the lock
 * time and a link to the web app. Vaults and entries load as account/load-entries.ts describes.
 */
import { Button, badgeVariants, m, SearchInput, type Toasts } from "@kennwort/ui";
import { GeneratorPanel } from "@kennwort/ui/generator/generator-panel.tsx";
import { createMemo, createSignal, Match, onSettled, Show, Switch } from "solid-js";
import { createEntryLoad } from "../account/load-entries.ts";
import type { PopupAccount } from "../account/popup-account.ts";
import { refreshAlertList } from "../alert/alert-refresh.ts";
import { EntrySection } from "./entry-list.tsx";
import { forPage, listed } from "./view.ts";

const Chip = (props: { pressed: boolean; onClick: () => void; children: string }) => (
  <button
    type="button"
    aria-pressed={props.pressed ? "true" : "false"}
    class={[
      badgeVariants({ variant: props.pressed ? "default" : "outline" }),
      "h-7 cursor-pointer hover:bg-accent data-[pressed=true]:hover:bg-primary/90",
    ]}
    data-pressed={props.pressed ? "true" : "false"}
    onClick={() => props.onClick()}
  >
    {props.children}
  </button>
);

export const VaultScreen = (props: {
  account: PopupAccount;
  /** The host of the page in the active tab, if there is one the extension may read */
  host: () => string | undefined;
  toasts: Toasts;
}) => {
  const { load, entries, start } = createEntryLoad(props.account, {
    policy: true,
    onEntries: refreshAlertList,
  });
  const [search, setSearch] = createSignal("");
  const [favoritesOnly, setFavoritesOnly] = createSignal(false);
  const [generator, setGenerator] = createSignal(false);
  const matches = createMemo(() => forPage(entries(), props.host()));
  const rest = createMemo(() => listed(entries(), search(), favoritesOnly()));

  // Once, when the screen is there
  onSettled(() => void start());

  const listTitle = () =>
    search().trim() !== ""
      ? m.popup_search_results()
      : favoritesOnly()
        ? m.nav_favorites()
        : m.nav_all();

  return (
    <>
      <main aria-label={m.app_name()} class="flex min-h-0 flex-1 flex-col">
        <Show
          when={!generator()}
          fallback={
            <section aria-labelledby="generator-title" class="grid gap-3 overflow-y-auto p-4">
              <h1 id="generator-title" class="text-[15px] font-semibold">
                {m.nav_generator()}
              </h1>
              <GeneratorPanel toasts={props.toasts} />
            </section>
          }
        >
          <div class="grid gap-2 border-b border-border p-3">
            <h1 class="sr-only">{m.nav_entries()}</h1>
            <SearchInput
              label={m.list_search()}
              placeholder={m.list_search_placeholder()}
              value={search()}
              onInput={(event) => setSearch(event.currentTarget.value)}
            />
            <fieldset class="flex gap-1.5">
              <legend class="sr-only">{m.list_filters()}</legend>
              <Chip pressed={!favoritesOnly()} onClick={() => setFavoritesOnly(false)}>
                {m.chip_all()}
              </Chip>
              <Chip pressed={favoritesOnly()} onClick={() => setFavoritesOnly(true)}>
                {m.nav_favorites()}
              </Chip>
            </fieldset>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto p-2">
            <Switch>
              <Match when={load() === "loading"}>
                <p role="status" class="p-2 text-xs text-muted-foreground">
                  {m.popup_loading()}
                </p>
              </Match>
              <Match when={load() === "failed" || load() === "untrusted"}>
                <p
                  role="alert"
                  class="m-2 rounded-lg border border-danger px-3 py-2 text-xs text-danger"
                >
                  {load() === "untrusted" ? m.popup_untrusted() : m.popup_load_failed()}
                </p>
              </Match>
              <Match when={load() === "ready"}>
                <Show when={search().trim() === "" && !favoritesOnly()}>
                  <Show
                    when={props.host()}
                    fallback={
                      <p class="px-2 pt-2 pb-3 text-xs text-muted-foreground">
                        {m.popup_no_page()}
                      </p>
                    }
                  >
                    {(host) => (
                      <EntrySection
                        title={m.popup_for_host({ host: host() })}
                        entries={matches()}
                        empty={m.popup_no_matches()}
                        toasts={props.toasts}
                      />
                    )}
                  </Show>
                </Show>
                <EntrySection
                  title={listTitle()}
                  entries={rest()}
                  empty={m.list_empty()}
                  toasts={props.toasts}
                />
              </Match>
            </Switch>
          </div>
        </Show>
      </main>
      <footer class="flex items-center gap-2 border-t border-border bg-muted px-3 py-2 text-xs">
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={generator() ? "true" : "false"}
          onClick={() => setGenerator(!generator())}
        >
          {m.nav_generator()}
        </Button>
        <span class="min-w-0 flex-1 truncate text-muted-foreground">
          {m.popup_lock_after({ minutes: props.account.lockMinutes() })}
        </span>
        <a
          href={props.account.device()?.server}
          target="_blank"
          rel="noopener noreferrer"
          class="font-medium underline-offset-4 hover:underline"
        >
          {m.popup_open_web_app()}
        </a>
      </footer>
    </>
  );
};
