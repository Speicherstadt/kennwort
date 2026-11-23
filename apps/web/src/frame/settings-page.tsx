/**
 * „Einstellungen“ (DESIGN.md, Einstellungen): groups with a title and a sentence, each a card of
 * rows with the label and its help on the left and the control on the right. From md a sticky
 * list of the groups jumps to each; on a phone the rows lead to their own screens. Locking sits
 * apart in the „Gefahrenzone“.
 */
import { Button, cn, getLocale, Icon, type Locale, locales, m, pageClass } from "@kennwort/ui";
import type { IconNode } from "@kennwort/ui/icons";
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  Download,
  Import,
  LifeBuoy,
  Link2,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldUser,
  Users,
} from "@kennwort/ui/icons";
import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, createUniqueId, For, Show } from "solid-js";
import type { Navigation } from "../navigation.ts";
import { applyTheme, readTheme, type Theme } from "../theme.ts";
import { Link } from "./link.tsx";

export type SettingsProps = {
  onLock: () => void;
  onLocale: (locale: Locale) => void;
  onAddDevice: () => void;
  /** The team page (members, groups, vaults), moved out of the settings */
  onTeam?: (() => void) | undefined;
  onImport?: (() => void) | undefined;
  onExport?: (() => void) | undefined;
  onEmergency?: (() => void) | undefined;
  onLinks?: (() => void) | undefined;
  onSecurity?: (() => void) | undefined;
  onRenew?: (() => void) | undefined;
  onCompanies?: (() => void) | undefined;
  onPrivacy?: (() => void) | undefined;
  devices?: (() => JSX.Element) | undefined;
};

type SettingLink = { label: string; help: string; icon: IconNode; open: (() => void) | undefined };
type Group = { id: string; title: string; help: string };

const rowClass = "flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3";

/** A group: title and sentence above a card of rows */
const SettingsGroup = (props: Group & { danger?: boolean; children: JSX.Element }) => (
  <section id={props.id} aria-labelledby={`${props.id}-title`} class="grid scroll-mt-8 gap-3">
    <div class="grid gap-0.5">
      <h2
        id={`${props.id}-title`}
        class={cn("text-[15px] font-semibold", props.danger && "text-danger")}
      >
        {props.title}
      </h2>
      <p class="text-[13px] text-muted-foreground">{props.help}</p>
    </div>
    {props.children}
  </section>
);

const cardClass = (danger?: boolean) =>
  cn("divide-y divide-border rounded-xl border", danger ? "border-danger/40" : "border-border");

/** A row with label and help on the left, the control on the right */
const Row = (props: { label: string; help: string; id?: string; children: JSX.Element }) => (
  <div class={rowClass}>
    <div class="grid min-w-48 flex-1 gap-0.5">
      <p id={props.id} class="font-medium">
        {props.label}
      </p>
      <p class="text-xs text-muted-foreground">{props.help}</p>
    </div>
    {props.children}
  </div>
);

/** A row that opens a page of its own; the whole row takes the click */
const LinkRow = (props: SettingLink & { open: () => void }) => {
  const id = createUniqueId();
  return (
    <div
      class={cn(
        rowClass,
        "relative flex-nowrap transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-accent has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-foreground",
      )}
    >
      <span class="grid size-8 shrink-0 place-items-center rounded-lg border border-border">
        <Icon icon={props.icon} />
      </span>
      <span class="grid min-w-0 flex-1 gap-0.5">
        {/* The label is the button, stretched over the row: its name is the label alone */}
        <button
          type="button"
          aria-describedby={id}
          class="w-fit text-left font-medium outline-none after:absolute after:inset-0 after:content-['']"
          onClick={() => props.open()}
        >
          {props.label}
        </button>
        <span id={id} class="text-xs text-muted-foreground">
          {props.help}
        </span>
      </span>
      <Icon icon={ChevronRight} class="text-muted-foreground" />
    </div>
  );
};

/** The links of a group that this app offers; a group without any is left out */
const LinkGroup = (props: Group & { links: SettingLink[] }) => (
  <Show when={props.links.filter((link) => link.open).length > 0}>
    <SettingsGroup {...props}>
      <div class={cardClass()}>
        <For each={props.links}>
          {(link) => <Show when={link.open}>{(open) => <LinkRow {...link} open={open()} />}</Show>}
        </For>
      </div>
    </SettingsGroup>
  </Show>
);

/** Radio buttons in one row, labelled by the row's label */
const Options = <T extends string>(props: {
  labelledBy: string;
  name: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) => (
  <div role="radiogroup" aria-labelledby={props.labelledBy} class="flex flex-wrap gap-x-4 gap-y-1">
    <For each={props.options}>
      {(option) => (
        <label class="flex min-h-11 items-center gap-2 md:min-h-0">
          <input
            type="radio"
            class="accent-primary"
            name={props.name}
            value={option.value}
            checked={props.value === option.value}
            onChange={() => props.onChange(option.value)}
          />
          {option.label}
        </label>
      )}
    </For>
  </div>
);

const General = (props: { onLocale: (locale: Locale) => void }) => {
  const [theme, setTheme] = createSignal<Theme>(readTheme(globalThis.localStorage));
  const chooseTheme = (next: Theme) => {
    setTheme(next);
    applyTheme(next, document.documentElement, globalThis.localStorage);
  };
  const languages = { de: m.language_de(), en: m.language_en() } as const;
  return (
    <SettingsGroup
      id="settings-general"
      title={m.settings_group_general()}
      help={m.settings_group_general_help()}
    >
      <div class={cardClass()}>
        <Row id="settings-theme" label={m.settings_theme()} help={m.settings_theme_help()}>
          <Options
            labelledBy="settings-theme"
            name="theme"
            value={theme()}
            onChange={chooseTheme}
            options={[
              { value: "system", label: m.theme_system() },
              { value: "light", label: m.theme_light() },
              { value: "dark", label: m.theme_dark() },
            ]}
          />
        </Row>
        <Row id="settings-language" label={m.settings_language()} help={m.settings_language_help()}>
          <Options
            labelledBy="settings-language"
            name="language"
            value={getLocale()}
            onChange={(locale) => props.onLocale(locale)}
            options={locales.map((locale) => ({ value: locale, label: languages[locale] }))}
          />
        </Row>
      </div>
    </SettingsGroup>
  );
};

const groups = (props: SettingsProps) => ({
  company: [
    {
      label: m.settings_companies(),
      help: m.settings_companies_help(),
      icon: Building2,
      open: props.onCompanies,
    },
    {
      label: m.settings_team(),
      help: m.settings_team_help(),
      icon: Users,
      open: props.onTeam,
    },
    {
      label: m.nav_security(),
      help: m.settings_security_help(),
      icon: ShieldCheck,
      open: props.onSecurity,
    },
  ],
  data: [
    {
      label: m.settings_import(),
      help: m.settings_import_help(),
      icon: Import,
      open: props.onImport,
    },
    {
      label: m.settings_export(),
      help: m.settings_export_help(),
      icon: Download,
      open: props.onExport,
    },
    { label: m.settings_links(), help: m.settings_links_help(), icon: Link2, open: props.onLinks },
  ],
  account: [
    {
      label: m.settings_emergency(),
      help: m.settings_emergency_help(),
      icon: LifeBuoy,
      open: props.onEmergency,
    },
    {
      label: m.settings_renew(),
      help: m.settings_renew_help(),
      icon: RefreshCw,
      open: props.onRenew,
    },
    {
      label: m.settings_privacy(),
      help: m.settings_privacy_help(),
      icon: ShieldUser,
      open: props.onPrivacy,
    },
  ],
});

/** The list of groups beside the settings from md: a jump to each, without changing the address */
const SectionNav = (props: { groups: Group[] }) => (
  <nav aria-label={m.settings_sections()} class="sticky top-0 hidden self-start md:block">
    <ul class="grid gap-0.5">
      <For each={props.groups}>
        {(group) => (
          <li>
            <a
              href={`#${group.id}`}
              class="block rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={(event) => {
                event.preventDefault();
                document.getElementById(group.id)?.scrollIntoView({ block: "start" });
              }}
            >
              {group.title}
            </a>
          </li>
        )}
      </For>
    </ul>
  </nav>
);

export const SettingsPage = (props: SettingsProps) => {
  const links = createMemo(() => groups(props));
  const shown = createMemo((): Group[] => [
    { id: "settings-general", title: m.settings_group_general(), help: "" },
    ...(links().company.some((l) => l.open)
      ? [{ id: "settings-company", title: m.settings_group_company(), help: "" }]
      : []),
    ...(links().data.some((l) => l.open)
      ? [{ id: "settings-data", title: m.settings_group_data(), help: "" }]
      : []),
    ...(links().account.some((l) => l.open)
      ? [{ id: "settings-account", title: m.settings_group_account(), help: "" }]
      : []),
    { id: "settings-devices", title: m.settings_group_devices(), help: "" },
    { id: "settings-danger", title: m.settings_group_danger(), help: "" },
  ]);
  return (
    <section aria-labelledby="page-title" class={pageClass("wide")}>
      <h1 id="page-title" class="mb-1 text-[28px] font-semibold md:text-lg">
        {m.nav_settings()}
      </h1>
      <p class="mb-6 text-[13px] text-muted-foreground">{m.settings_intro()}</p>
      <div class="grid gap-10 md:grid-cols-[11rem_minmax(0,48rem)] md:gap-12">
        <SectionNav groups={shown()} />
        <div class="grid min-w-0 gap-10">
          <General onLocale={props.onLocale} />
          <LinkGroup
            id="settings-company"
            title={m.settings_group_company()}
            help={m.settings_group_company_help()}
            links={links().company}
          />
          <LinkGroup
            id="settings-data"
            title={m.settings_group_data()}
            help={m.settings_group_data_help()}
            links={links().data}
          />
          <LinkGroup
            id="settings-account"
            title={m.settings_group_account()}
            help={m.settings_group_account_help()}
            links={links().account}
          />
          <SettingsGroup
            id="settings-devices"
            title={m.settings_group_devices()}
            help={m.settings_group_devices_help()}
          >
            <div class={cardClass()}>
              <Row label={m.settings_add_device()} help={m.settings_add_device_help()}>
                <Button class="h-11 md:h-8" onClick={() => props.onAddDevice()}>
                  <Icon icon={Plus} /> {m.settings_add_device()}
                </Button>
              </Row>
            </div>
            <div class="grid gap-4">{props.devices?.()}</div>
          </SettingsGroup>
          <SettingsGroup
            id="settings-danger"
            title={m.settings_group_danger()}
            help={m.settings_group_danger_help()}
            danger
          >
            <div class={cardClass(true)}>
              <Row label={m.lock()} help={m.settings_lock_help()}>
                <Button
                  class="h-11 border-danger/40 text-danger hover:bg-danger/10 md:h-8"
                  onClick={() => props.onLock()}
                >
                  <Icon icon={Lock} /> {m.lock()}
                </Button>
              </Row>
            </div>
          </SettingsGroup>
        </div>
      </div>
    </section>
  );
};

/** A page under the settings: a way back to them above it, on a phone the way out of the drill */
export const SettingsChild = (props: { nav: Navigation; children: JSX.Element }) => (
  <main class="flex min-h-0 flex-1 flex-col">
    <Link
      nav={props.nav}
      href="/settings"
      class="flex min-h-11 w-fit items-center gap-1 px-4 pt-2 text-[15px] text-muted-foreground transition-colors hover:text-foreground md:min-h-0 md:px-8 md:pt-4 md:text-[13px]"
    >
      <Icon icon={ArrowLeft} /> {m.nav_settings()}
    </Link>
    <div class="flex min-h-0 flex-1">{props.children}</div>
  </main>
);
