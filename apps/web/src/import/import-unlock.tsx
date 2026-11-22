/**
 * The file step for an encrypted file (K-502 Teil 3): KeePass's database (KDBX) needs its master
 * password and, if it has one, its key file. Both stay on the device: the password is read from
 * its field when the form is sent, handed to core's reader and never kept in the page's state;
 * the field is emptied right after, so the form holds it no longer than the reader needs it.
 */
import { Button, Input, m } from "@kennwort/ui";
import { createSignal, createUniqueId } from "solid-js";
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

export const UnlockStep = (props: {
  choice: VendorChoice;
  busy: boolean;
  error: string | undefined;
  onUnlock: (request: UnlockRequest) => void;
  onBack: () => void;
}) => {
  const id = createUniqueId();
  const [missing, setMissing] = createSignal(false);
  const submit = (form: HTMLFormElement) => {
    const elements = form.elements;
    const file = picked(elements.namedItem("database") as HTMLInputElement | null);
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
      class="grid max-w-xl gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit(event.currentTarget);
      }}
    >
      <h2 class="font-semibold">{props.choice.label()}</h2>
      <section aria-labelledby={`${id}-howto`} class="rounded-xl border border-border p-3.5">
        <h3 id={`${id}-howto`} class="mb-1 text-xs font-medium">
          {m.import_howto_title()}
        </h3>
        <p class="text-[13px]">{props.choice.howTo()}</p>
      </section>
      <FilePicker
        id={`${id}-database`}
        name="database"
        label={m.import_kdbx_file()}
        accept={props.choice.accept}
        disabled={props.busy}
      />
      <Input
        name="password"
        label={m.import_kdbx_password()}
        type="password"
        autocomplete="off"
        disabled={props.busy}
      />
      <FilePicker
        id={`${id}-key`}
        name="key-file"
        label={m.import_kdbx_key_file()}
        disabled={props.busy}
      />
      <p class="text-xs text-muted-foreground" role="status">
        {props.busy ? m.import_kdbx_opening() : m.import_kdbx_hint()}
      </p>
      <Alert text={missing() ? m.import_kdbx_no_file() : props.error} />
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
          {m.import_kdbx_open()}
        </Button>
      </div>
    </form>
  );
};
