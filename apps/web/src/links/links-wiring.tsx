/**
 * What the opened app does with one-time links (K-601, P-18): „Einmal-Link“ on an entry opens the
 * dialog, the rail's „Einmal-Links“ the page. Both make links with the session's token on the
 * app's own origin.
 */
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import type { LinkApi } from "@kennwort/client/session/links-api.ts";
import { createSignal, Show } from "solid-js";
import type { Session } from "../session/session.ts";
import { LinkDialog } from "./link-dialog.tsx";
import { LinksPage } from "./links-page.tsx";

export const createLinks = (api: LinkApi, session: Session) => {
  const [linking, setLinking] = createSignal<ShownEntry>();
  const deps = () => ({ api, token: session.opened()?.token ?? "", origin: location.origin });
  return {
    start: (entry: ShownEntry) => setLinking(entry),
    dialog: () => (
      <Show when={linking()} keyed>
        {(entry) => (
          <LinkDialog entry={entry} deps={deps()} onClose={() => setLinking(undefined)} />
        )}
      </Show>
    ),
    page: () => <LinksPage deps={deps()} />,
  };
};
