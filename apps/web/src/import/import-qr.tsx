/**
 * The QR step of the import (K-503): Google Authenticator exports its accounts as one or more QR
 * codes. Each is scanned with the camera or read from a screenshot, or the links are pasted; the
 * step says how many of how many codes it has and hands all links on as text. Nothing of them
 * goes to the server.
 */
import { Button, m, panelClass, panelTitleClass, TextArea } from "@kennwort/ui";
import { createSignal, createUniqueId, Show } from "solid-js";
import { type QrKind, QrScanDialog } from "../qr/qr-scan-dialog.tsx";
import { Alert } from "./import-steps.tsx";
import { qrProgress, withLink } from "./qr-links.ts";
import type { VendorChoice } from "./vendors.ts";

const MIGRATION: QrKind = {
  accepts: (text) => withLink([], text) !== undefined,
  intro: () => m.import_qr_intro(),
  wrong: () => m.import_qr_not_migration(),
};

/** How many codes are read, for a screen reader too as it changes */
const Progress = (props: { links: string[] }) => {
  const progress = () => qrProgress(props.links);
  return (
    <p role="status" class="text-[13px]">
      {progress().read === 0
        ? m.import_qr_none()
        : m.import_qr_read({ read: progress().read, count: progress().total })}
    </p>
  );
};

export const QrStep = (props: {
  choice: VendorChoice;
  busy: boolean;
  error: string | undefined;
  onLinks: (text: string) => void;
  onBack: () => void;
}) => {
  const id = createUniqueId();
  const [links, setLinks] = createSignal<string[]>([]);
  const [pasted, setPasted] = createSignal("");
  const [scanning, setScanning] = createSignal(false);
  const [empty, setEmpty] = createSignal(false);
  const submit = () => {
    const text = [...links(), pasted()].join("\n");
    if (text.trim() === "") return setEmpty(true);
    props.onLinks(text);
  };
  return (
    <>
      <form
        class={`${panelClass} gap-4`}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <h2 class={panelTitleClass}>{props.choice.label()}</h2>
        <section aria-labelledby={`${id}-howto`} class="rounded-xl border border-border p-3.5">
          <h3 id={`${id}-howto`} class="mb-1 text-xs font-medium">
            {m.import_howto_title()}
          </h3>
          <p class="text-[13px]">{props.choice.howTo()}</p>
        </section>
        <div class="grid gap-1.5">
          <Button type="button" class="w-fit" onClick={() => setScanning(true)}>
            {m.qr_scan()}
          </Button>
          <Progress links={links()} />
        </div>
        <TextArea
          label={m.import_qr_paste()}
          value={pasted()}
          spellcheck={false}
          autocomplete="off"
          class="font-mono text-xs"
          onInput={(event) => {
            setPasted(event.currentTarget.value);
            setEmpty(false);
          }}
        />
        <p class="text-xs text-muted-foreground">
          {props.busy ? m.import_reading() : m.import_qr_hint()}
        </p>
        <Alert text={empty() ? m.import_qr_empty() : props.error} />
        <div class="flex gap-2">
          <Button type="button" onClick={() => props.onBack()}>
            {m.import_back()}
          </Button>
          <Button type="submit" variant="primary" disabled={props.busy}>
            {m.import_next()}
          </Button>
        </div>
      </form>
      {/* Outside the form: no button of the dialog may submit it */}
      <Show when={scanning()}>
        <QrScanDialog
          kind={MIGRATION}
          onFound={(link) => {
            setLinks(withLink(links(), link) ?? links());
            setEmpty(false);
            setScanning(false);
          }}
          onClose={() => setScanning(false)}
        />
      </Show>
    </>
  );
};
