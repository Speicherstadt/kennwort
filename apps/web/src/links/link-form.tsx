/**
 * The parts of making a one-time link (K-601) that the entry's dialog and the page „Einmal-Links“
 * share: how long and how often, an optional passphrase, and the address once it is made.
 */
import { LINK_EXPIRIES, LINK_LIMITS } from "@kennwort/core";
import { Button, getLocale, Icon, Input, m, selectClass } from "@kennwort/ui";
import { Copy } from "@kennwort/ui/icons";
import type { JSX } from "@solidjs/web";
import { createSignal, createUniqueId, For, Show } from "solid-js";
import type { LinkOptions, MadeLink, MakeError } from "./links.ts";

const HOUR = 3_600_000;
const expiryLabel = (ms: number) =>
  ms === HOUR ? m.link_expiry_hour() : m.link_expiry_days({ count: ms / (24 * HOUR) });
const fetchCounts = Array.from(
  { length: LINK_LIMITS.maxFetches - LINK_LIMITS.minFetches + 1 },
  (_, i) => LINK_LIMITS.minFetches + i,
);

export const dateTime = (time: number) =>
  new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium", timeStyle: "short" }).format(time);

export const makeErrorText = (error: MakeError): string =>
  error === "too-large" ? m.link_too_large() : m.link_failed();

const Select = (props: {
  label: string;
  value: number;
  options: { value: number; label: string }[];
  onChange: (value: number) => void;
}) => {
  const id = createUniqueId();
  return (
    <div class="grid gap-1.5">
      <label for={id} class="text-xs font-medium">
        {props.label}
      </label>
      <select
        id={id}
        class={selectClass}
        value={String(props.value)}
        onChange={(event) => props.onChange(Number(event.currentTarget.value))}
      >
        <For each={props.options}>
          {(option) => <option value={String(option.value)}>{option.label}</option>}
        </For>
      </select>
    </div>
  );
};

/**
 * Expiry (a day by default), fetches (one by default) and a passphrase, then „Link erstellen“;
 * `children` come first, for what the link carries
 */
export const LinkOptionsForm = (props: {
  busy: boolean;
  onSubmit: (options: LinkOptions) => void;
  children?: JSX.Element;
}) => {
  const [expiresInMs, setExpiresInMs] = createSignal(24 * HOUR);
  const [maxFetches, setMaxFetches] = createSignal(1);
  const [passphrase, setPassphrase] = createSignal("");
  return (
    <form
      class="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit({
          expiresInMs: expiresInMs(),
          maxFetches: maxFetches(),
          passphrase: passphrase(),
        });
      }}
    >
      {props.children}
      <div class="grid grid-cols-2 gap-3">
        <Select
          label={m.link_expiry()}
          value={expiresInMs()}
          options={LINK_EXPIRIES.map((ms) => ({ value: ms, label: expiryLabel(ms) }))}
          onChange={setExpiresInMs}
        />
        <Select
          label={m.link_fetches()}
          value={maxFetches()}
          options={fetchCounts.map((n) => ({ value: n, label: String(n) }))}
          onChange={setMaxFetches}
        />
      </div>
      <Input
        label={m.link_passphrase()}
        hint={m.link_passphrase_hint()}
        type="password"
        autocomplete="new-password"
        value={passphrase()}
        onInput={(event) => setPassphrase(event.currentTarget.value)}
      />
      <Button type="submit" variant="primary" disabled={props.busy}>
        {props.busy ? m.working() : m.link_create()}
      </Button>
    </form>
  );
};

/** The address, shown once: the secret in it is nowhere else, not even on the server */
export const MadeLinkView = (props: { made: MadeLink; onDone: () => void }) => {
  const [copied, setCopied] = createSignal(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.made.address);
      setCopied(true);
    } catch {
      // No clipboard (insecure context or denied): the address stays on screen to copy by hand
    }
  };
  return (
    <div class="grid gap-3">
      <Input
        label={m.link_address()}
        readonly
        value={props.made.address}
        class="font-mono"
        onFocus={(event) => event.currentTarget.select()}
      />
      <p class="text-xs text-muted-foreground">
        {m.link_made_note({ date: dateTime(props.made.expiresAt) })}
      </p>
      <Show when={copied()}>
        <p role="status" class="text-xs text-success">
          {m.link_copied()}
        </p>
      </Show>
      <div class="flex gap-2">
        <Button variant="primary" onClick={() => void copy()}>
          <Icon icon={Copy} /> {m.link_copy()}
        </Button>
        <Button onClick={() => props.onDone()}>{m.link_done()}</Button>
      </div>
    </div>
  );
};
