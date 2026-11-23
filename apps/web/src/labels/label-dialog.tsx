/**
 * „Etikett drucken“ on an entry (K-605): a QR label for the device or installation the entry is
 * for, with a caption the person chooses, in the size of their label printer. The code holds only
 * the entry's address (label.ts); the print shows the label alone, on a page of the label's size
 * (label.css), drawn on this device.
 */
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import { Button, Dialog, Icon, Input, m, selectClass } from "@kennwort/ui";
import { Printer } from "@kennwort/ui/icons";
import { Portal } from "@solidjs/web";
import { createSignal, createUniqueId, For, Show, untrack } from "solid-js";
import { qrPath } from "../pairing/qr.ts";
import { CAPTION_MAX, caption, LABEL_SIZES, type LabelSize, labelLink } from "./label.ts";
import "./label.css";

/** The label itself: the code, the caption beside it and where it leads */
const LabelView = (props: { link: string; caption: string; size: LabelSize }) => {
  const qr = () => qrPath(props.link);
  return (
    <div class={`kennwort-label label-${props.size}`} data-testid="label">
      <svg
        role="img"
        aria-label={m.label_code()}
        viewBox={`0 0 ${qr().size} ${qr().size}`}
        shape-rendering="crispEdges"
        data-link={props.link}
      >
        <rect width={qr().size} height={qr().size} fill="#fff" />
        <path d={qr().d} fill="#000" />
      </svg>
      <div class="kennwort-label-text">
        <strong>{props.caption}</strong>
        <span>{m.label_hint()}</span>
      </div>
    </div>
  );
};

export const LabelDialog = (props: {
  entry: ShownEntry;
  origin: string;
  onClose: () => void;
  /** The browser's print dialog; tests pass their own */
  print?: () => void;
}) => {
  // Deliberately read once: the caption starts from the title, then it is the person's text
  const [text, setText] = createSignal(caption(untrack(() => props.entry.title)));
  const [size, setSize] = createSignal<LabelSize>("62x29");
  const sizeId = createUniqueId();
  const link = () => labelLink(props.origin, props.entry.vault, props.entry.id);
  return (
    <Dialog open onClose={props.onClose} title={m.label_title()} description={m.label_intro()}>
      <div class="grid gap-3 p-4 pt-2">
        <Input
          label={m.label_caption()}
          value={text()}
          maxlength={CAPTION_MAX}
          onInput={(event) => setText(caption(event.currentTarget.value))}
        />
        <div class="grid gap-1.5">
          <label for={sizeId} class="text-xs font-medium">
            {m.label_size()}
          </label>
          <select
            id={sizeId}
            class={selectClass}
            value={size()}
            onChange={(event) => setSize(event.currentTarget.value as LabelSize)}
          >
            <For each={LABEL_SIZES}>
              {(option) => (
                <option value={option.id}>
                  {m.label_size_mm({ width: option.width, height: option.height })}
                </option>
              )}
            </For>
          </select>
        </div>
        <Show
          when={link()}
          fallback={<p class="text-[13px] text-danger">{m.label_unavailable()}</p>}
        >
          {(shown) => (
            <>
              <div class="overflow-auto rounded-lg border border-border bg-muted p-3">
                <LabelView link={shown()} caption={text()} size={size()} />
              </div>
              <p class="text-xs text-muted-foreground">{m.label_no_secret()}</p>
              <Button variant="primary" class="w-fit" onClick={() => (props.print ?? print)()}>
                <Icon icon={Printer} /> {m.label_print()}
              </Button>
              {/* What the printer gets: the label alone, outside the app (label.css) */}
              <Portal mount={document.body}>
                <div class="kennwort-print">
                  <LabelView link={shown()} caption={text()} size={size()} />
                </div>
              </Portal>
            </>
          )}
        </Show>
      </div>
    </Dialog>
  );
};
