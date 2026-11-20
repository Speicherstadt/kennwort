// Every component of packages/ui on one page, for the end-to-end tests (keyboard, axe) and to look
// at; built only with KENNWORT_SHOWCASE=1 (vite.config.ts), and kept outside src/ because it is no
// part of the app. Texts come from the test data of Weber
// Haustechnik (DESIGN.md, Testdaten), not from the app's messages.
import "@kennwort/ui/styles.css";
import {
  Badge,
  Button,
  Combobox,
  createToasts,
  Dialog,
  getLocale,
  Icon,
  IconButton,
  Input,
  List,
  Menu,
  Popover,
  SearchInput,
  Tabs,
  Toaster,
  Tooltip,
} from "@kennwort/ui";
import { Copy, Ellipsis, Pencil, Trash2 } from "@kennwort/ui/icons";
import { render } from "@solidjs/web";
import { createSignal } from "solid-js";

const entries = [
  { id: "bank", label: "Sparkasse", description: "weber-haustechnik" },
  { id: "mail", label: "Mail info@", description: "info@weber-haustechnik.test" },
  { id: "wlan", label: "WLAN Büro", description: "Büro" },
];

const Section = (props: { title: string; children: unknown }) => (
  <section class="grid gap-3 border-b border-border pb-6">
    <h2 class="text-[11px] font-semibold tracking-[.04em] text-muted-foreground uppercase">
      {props.title}
    </h2>
    <div class="flex flex-wrap items-start gap-3">{props.children as never}</div>
  </section>
);

const Showcase = () => {
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [selected, setSelected] = createSignal("bank");
  const [vault, setVault] = createSignal("");
  const [chosen, setChosen] = createSignal("");
  const toasts = createToasts();
  return (
    <main class="mx-auto grid max-w-3xl gap-6 p-6">
      <h1 class="text-lg font-semibold">Komponenten</h1>
      <Section title="Knöpfe">
        <Button variant="primary">Speichern</Button>
        <Button>Teilen</Button>
        <Button variant="ghost">Abbrechen</Button>
        <IconButton label="Passwort kopieren" onClick={() => toasts.show("Passwort kopiert")}>
          <Icon icon={Copy} />
        </IconButton>
        <Badge tone="warning">ändern</Badge>
        <Badge>3</Badge>
      </Section>
      <Section title="Eingabe">
        <div class="grid w-72 gap-3">
          <Input label="Benutzername" hint="So wie auf der Website" />
          <SearchInput label="Einträge durchsuchen" placeholder="Suchen" shortcut="/" />
          <Combobox
            label="Tresor"
            options={["Persönlich", "Büro", "Buchhaltung", "Kunden-Zugänge", "Baustellen-Tablets"]}
            onChange={setVault}
          />
          <p data-testid="vault">{vault()}</p>
        </div>
      </Section>
      <Section title="Schwebend">
        <Button onClick={() => setDialogOpen(true)}>Eintrag löschen …</Button>
        <Dialog
          open={dialogOpen()}
          onClose={() => setDialogOpen(false)}
          title="Eintrag löschen?"
          description="Sparkasse wird für alle im Tresor Büro gelöscht."
        >
          <div class="flex justify-end gap-2">
            <Button onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button variant="danger" onClick={() => setDialogOpen(false)}>
              Löschen
            </Button>
          </div>
        </Dialog>
        <Menu
          label="Aktionen"
          trigger={<Icon icon={Ellipsis} />}
          items={[
            { label: "Bearbeiten", icon: Pencil, onSelect: () => setChosen("Bearbeiten") },
            { label: "Kopieren", icon: Copy, onSelect: () => setChosen("Kopieren") },
            { label: "Löschen", icon: Trash2, danger: true, onSelect: () => setChosen("Löschen") },
          ]}
        />
        <p data-testid="chosen">{chosen()}</p>
        <Popover trigger="Zugriff">
          <p class="w-56">Jonas, Anna und Sandra können diesen Eintrag sehen.</p>
        </Popover>
        <Tooltip text="Mitgliedschaft signiert · Kette geprüft">
          {(trigger) => (
            <button type="button" class="rounded-md border border-border px-3 py-1.5" {...trigger}>
              Geprüft
            </button>
          )}
        </Tooltip>
      </Section>
      <Section title="Listen">
        <div class="w-80 rounded-xl border border-border">
          <List label="Einträge" items={entries} selected={selected()} onSelect={setSelected} />
        </div>
        <Tabs
          label="Eintrag"
          tabs={[
            {
              id: "fields",
              label: "Felder",
              content: () => <p>Benutzername, Passwort, Website</p>,
            },
            { id: "access", label: "Zugriff", content: () => <p>Jonas, Anna, Sandra</p> },
            { id: "history", label: "Verlauf", content: () => <p>Geändert von Anna</p> },
          ]}
        />
      </Section>
      <Toaster toasts={toasts} />
    </main>
  );
};

const root = document.getElementById("root");
if (root) {
  document.documentElement.lang = getLocale();
  render(() => <Showcase />, root);
}
