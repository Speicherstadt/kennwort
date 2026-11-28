/**
 * What the opened app does with notifications (K-602): the bell in the frame, the page, and the
 * live channel. Names come from the vaults' load on this device, never from the server's word.
 */
import type { NotificationApi } from "@kennwort/client/session/notifications-api.ts";
import { encodeBytes } from "@kennwort/core";
import type { Navigation } from "../navigation.ts";
import type { Session } from "../session/session.ts";
import type { VaultStore } from "../vaults/vault-store.ts";
import { NotificationBell } from "./bell.tsx";
import type { Names } from "./notification-text.ts";
import { NotificationsLive } from "./notifications-live.tsx";
import { NotificationsPage } from "./notifications-page.tsx";

/** The people and vault names as the vaults' load checked them; none before it */
const namesOf = (store: VaultStore): Names => {
  const ready = () => {
    const shown = store.shown();
    return shown.state === "ready" ? shown : undefined;
  };
  return {
    person: (id) => ready()?.people.find((p) => encodeBytes(p.accountId) === id)?.name ?? undefined,
    vault: (id) => ready()?.vaults.find((v) => v.idText === id)?.name ?? undefined,
  };
};

export const createNotifications = (
  props: { api: NotificationApi & { syncFetch: typeof fetch }; session: Session; nav: Navigation },
  store: VaultStore,
) => {
  const deps = { api: props.api, session: props.session };
  const names = namesOf(store);
  return {
    bell: (variant: "rail" | "header" | "tab") => (
      <NotificationBell nav={props.nav} deps={deps} variant={variant} />
    ),
    page: () => (
      <NotificationsPage
        nav={props.nav}
        deps={deps}
        names={names}
        onOpen={() => void store.reload()}
      />
    ),
    live: () => <NotificationsLive deps={deps} send={props.api.syncFetch} />,
  };
};

export type FrameNotifications = Pick<ReturnType<typeof createNotifications>, "bell" | "page">;
