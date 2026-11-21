/** The other sections: generator, groups, settings, and a page that does not exist */
import { Button, getLocale, Icon, type Locale, locales, m, type Toasts } from "@kennwort/ui";
import { GeneratorPanel } from "@kennwort/ui/generator/generator-panel.tsx";
import { Archive, Import, Lock, Users } from "@kennwort/ui/icons";
import type { JSX } from "@solidjs/web";
import { createSignal, For, Show } from "solid-js";
import { groups } from "../demo.ts";
import type { Navigation } from "../navigation.ts";
import { applyTheme, readTheme, type Theme } from "../theme.ts";
import { Link } from "./link.tsx";

const Page = (props: { title: string; children: JSX.Element }) => (
  <section aria-labelledby="page-title" class="min-h-0 flex-1 overflow-auto p-4 md:p-6">
    <h1 id="page-title" class="mb-4 text-[28px] font-semibold md:text-lg">
      {props.title}
    </h1>
    {props.children}
  </section>
);

export const GeneratorPage = (props: { toasts: Toasts }) => (
  <Page title={m.nav_generator()}>
    <p class="mb-4 text-muted-foreground">{m.generator_intro()}</p>
    <GeneratorPanel toasts={props.toasts} storage={globalThis.localStorage} />
  </Page>
);

export const GroupsPage = () => (
  <Page title={m.nav_groups()}>
    <p class="mb-4 text-muted-foreground">{m.groups_intro()}</p>
    <ul class="divide-y divide-border rounded-xl border border-border">
      <For each={groups}>
        {(group) => (
          <li class="flex items-center gap-3 px-3.5 py-2.5">
            <Icon icon={Users} />
            <span class="flex-1">{group.name}</span>
            <span class="text-xs text-muted-foreground">
              {m.groups_members({ count: group.members })}
            </span>
          </li>
        )}
      </For>
    </ul>
  </Page>
);

const Choice = <T extends string>(props: {
  legend: string;
  name: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) => (
  <fieldset class="grid gap-2">
    <legend class="mb-1 text-xs font-medium">{props.legend}</legend>
    <For each={props.options}>
      {(option) => (
        <label class="flex min-h-11 items-center gap-2 md:min-h-0">
          <input
            type="radio"
            name={props.name}
            value={option.value}
            checked={props.value === option.value}
            onChange={() => props.onChange(option.value)}
          />
          {option.label}
        </label>
      )}
    </For>
  </fieldset>
);

export const SettingsPage = (props: {
  onLock: () => void;
  onLocale: (locale: Locale) => void;
  onAddDevice: () => void;
  onMembers?: (() => void) | undefined;
  onVaults?: (() => void) | undefined;
  onImport?: (() => void) | undefined;
  devices?: (() => JSX.Element) | undefined;
}) => {
  const [theme, setTheme] = createSignal<Theme>(readTheme(globalThis.localStorage));
  const chooseTheme = (next: Theme) => {
    setTheme(next);
    applyTheme(next, document.documentElement, globalThis.localStorage);
  };
  const languages = { de: m.language_de(), en: m.language_en() } as const;
  return (
    <Page title={m.nav_settings()}>
      <div class="grid max-w-md gap-6">
        <Choice
          legend={m.settings_theme()}
          name="theme"
          value={theme()}
          onChange={chooseTheme}
          options={[
            { value: "system", label: m.theme_system() },
            { value: "light", label: m.theme_light() },
            { value: "dark", label: m.theme_dark() },
          ]}
        />
        <Choice
          legend={m.settings_language()}
          name="language"
          value={getLocale()}
          onChange={(locale) => props.onLocale(locale)}
          options={locales.map((locale) => ({ value: locale, label: languages[locale] }))}
        />
        <Show when={props.onMembers}>
          {(open) => (
            <Button class="w-fit" onClick={() => open()()}>
              <Icon icon={Users} /> {m.settings_members()}
            </Button>
          )}
        </Show>
        <Show when={props.onVaults}>
          {(open) => (
            <Button class="w-fit" onClick={() => open()()}>
              <Icon icon={Archive} /> {m.settings_vaults()}
            </Button>
          )}
        </Show>
        <Show when={props.onImport}>
          {(open) => (
            <Button class="w-fit" onClick={() => open()()}>
              <Icon icon={Import} /> {m.settings_import()}
            </Button>
          )}
        </Show>
        {props.devices?.()}
        <Button class="w-fit" onClick={() => props.onAddDevice()}>
          {m.settings_add_device()}
        </Button>
        <Button class="w-fit" onClick={() => props.onLock()}>
          <Icon icon={Lock} /> {m.lock()}
        </Button>
      </div>
    </Page>
  );
};

export const NotFoundPage = (props: { nav: Navigation }) => (
  <Page title={m.not_found_title()}>
    <Link nav={props.nav} href="/entries" class="underline">
      {m.not_found_back()}
    </Link>
  </Page>
);
