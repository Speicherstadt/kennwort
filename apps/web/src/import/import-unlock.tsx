/**
 * The file step for an encrypted file: KeePass's database (KDBX, K-502 Teil 3) needs its master
 * password and, if it has one, its key file; Kennwort's own export (K-504) its passphrase;
 * Bitwarden's password-protected JSON (K-502 Teil 4) its export password, for the file already
 * chosen in the file step. All stay on the device: the password is read from
 * its field when the form is sent, handed to core's reader and never kept in the page's state;
 * the field is emptied right after, so the form holds it no longer than the reader needs it.
 */
import { Button, Input, m, panelClass, panelTitleClass } from "@kennwort/ui";
import { createSignal, createUniqueId, Show } from "solid-js";
import { Alert } from "./import-steps.tsx";
import type { VendorChoice } from "./vendors.ts";

export type UnlockRequest = { file: File; password: string; keyFile?: File | undefined };

/** The file a picker holds, if any */
const picked = (input: HTMLInputElement | null | undefined) => input?.files?.[0];

const FilePicker = (props: {
  id: string;
  name: string;
  label: string;
  accept?: string;
  disabled: boolean;
}) => (
  <div class="grid gap-1.5">
    <label for={props.id} class="text-xs font-medium">
      {props.label}
    </label>
    <input
      id={props.id}
      name={props.name}
      type="file"
      accept={props.accept}
      disabled={props.disabled}
      class="text-[13px]"
    />
  </div>
);

type Texts = {
  password: () => string;
  open: () => string;
  opening: () => string;
  hint: () => string;
  /** The file picker and its hint when empty; a file already chosen needs neither */
  file?: () => string;
  noFile?: () => string;
  /** Only KeePass knows key files */
  keyFile?: true;
};

/** What the step says for each encrypted format; KeePass's database is the default */
const TEXTS: Record<"kdbx" | "kennwort-json" | "bitwarden-json", Texts> = {
  kdbx: {
    file: () => m.import_kdbx_file(),
    password: () => m.import_kdbx_password(),
    open: () => m.import_kdbx_open(),
    opening: () => m.import_kdbx_opening(),
    hint: () => m.import_kdbx_hint(),
    noFile: () => m.import_kdbx_no_file(),
    keyFile: true,
  },
  "kennwort-json": {
    file: () => m.import_kennwort_file(),
    password: () => m.import_kennwort_passphrase(),
    open: () => m.import_kennwort_open(),
    opening: () => m.import_kennwort_opening(),
    hint: () => m.import_kennwort_hint(),
    noFile: () => m.import_kennwort_no_file(),
  },
  "bitwarden-json": {
    password: () => m.import_bitwarden_password(),
    open: () => m.import_bitwarden_open(),
    opening: () => m.import_bitwarden_opening(),
    hint: () => m.import_bitwarden_hint(),
  },
};

const textsOf = (id: string): Texts =>
  id === "kennwort-json" || id === "bitwarden-json" ? TEXTS[id] : TEXTS.kdbx;

export const UnlockStep = (props: {
  choice: VendorChoice;
  /** The file the file step already read and found protected (Bitwarden's JSON) */
  file?: File | undefined;
  busy: boolean;
  error: string | undefined;
  onUnlock: (request: UnlockRequest) => void;
  onBack: () => void;
}) => {
  const id = createUniqueId();
  const [missing, setMissing] = createSignal(false);
  const text = () => textsOf(props.choice.id);
  const submit = (form: HTMLFormElement) => {
    const elements = form.elements;
    const file = props.file ?? picked(elements.namedItem("database") as HTMLInputElement | null);
    if (!file) return setMissing(true);
    const passwordField = elements.namedItem("password") as HTMLInputElement;
    const request = {
      file,
      password: passwordField.value,
      keyFile: picked(elements.namedItem("key-file") as HTMLInputElement | null),
    };
    // The pickers and the field let go at once: the request is all the flow keeps
    form.reset();
    props.onUnlock(request);
  };
  return (
    <form
      class={`${panelClass} gap-4`}
      onSubmit={(event) => {
        event.preventDefault();
        submit(event.currentTarget);
      }}
    >
      <h2 class={panelTitleClass}>{props.choice.label()}</h2>
      <section aria-labelledby={`${id}-howto`} class="rounded-xl border border-border p-3.5">
        <h3 id={`${id}-howto`} class="mb-1 text-xs font-medium">
          {m.import_howto_title()}
        </h3>
        <p class="text-[13px]">{props.choice.howTo()}</p>
      </section>
      <Show
        when={props.file}
        fallback={
          <FilePicker
            id={`${id}-database`}
            name="database"
            label={text().file?.() ?? ""}
            accept={props.choice.accept}
            disabled={props.busy}
          />
        }
      >
        {(file) => <p class="text-[13px]">{m.import_unlock_chosen({ name: file().name })}</p>}
      </Show>
      <Input
        name="password"
        label={text().password()}
        type="password"
        autocomplete="off"
        disabled={props.busy}
      />
      <Show when={text().keyFile}>
        <FilePicker
          id={`${id}-key`}
          name="key-file"
          label={m.import_kdbx_key_file()}
          disabled={props.busy}
        />
      </Show>
      <p class="text-xs text-muted-foreground" role="status">
        {props.busy ? text().opening() : text().hint()}
      </p>
      <Alert text={missing() ? text().noFile?.() : props.error} />
      <div class="flex gap-2">
        <Button type="button" onClick={() => props.onBack()}>
          {m.import_back()}
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={props.busy}
          onClick={() => setMissing(false)}
        >
          {text().open()}
        </Button>
      </div>
    </form>
  );
};
