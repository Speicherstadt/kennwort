/**
 * The bell (K-602): a link to the notifications with the unread count, in the rail on the desktop
 * and as the fifth tab on a phone. Its name says the count, the badge only shows it. Until the
 * first load it shows without a count.
 */
import { CountDot, cn, Icon, m } from "@kennwort/ui";
import { Bell } from "@kennwort/ui/icons";
import { useQuery } from "@tanstack/solid-query";
import { Loading, Show } from "solid-js";
import { Link } from "../frame/link.tsx";
import type { Navigation } from "../navigation.ts";
import { type NotificationsDeps, notificationsQuery } from "./notifications-query.ts";

type Variant = "rail" | "tab";

const linkClass = (variant: Variant, current: boolean) =>
  cn(
    variant === "rail"
      ? "grid size-9 place-items-center rounded-lg"
      : "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]",
    current && variant === "rail" && "bg-accent text-foreground",
    current && variant === "tab" && "text-foreground",
    !current && "text-muted-foreground",
    !current && variant === "rail" && "hover:bg-accent",
  );

const BellLink = (props: { nav: Navigation; variant: Variant; unread: number }) => {
  const current = () => props.nav.route().page === "notifications";
  return (
    <Link
      nav={props.nav}
      href="/notifications"
      current={current()}
      class={linkClass(props.variant, current())}
    >
      <span class="relative" aria-hidden="true">
        <Icon icon={Bell} size={props.variant === "rail" ? 18 : 22} />
        <Show when={props.unread > 0}>
          <CountDot count={props.unread} />
        </Show>
      </span>
      <Show when={props.variant === "tab"}>
        <span aria-hidden="true">{m.nav_notifications()}</span>
      </Show>
      {/* The name from the content, not aria-label: the tab's visible word stays part of it */}
      <span class="sr-only">
        {props.unread > 0
          ? m.nav_notifications_unread({ count: props.unread })
          : m.nav_notifications()}
      </span>
    </Link>
  );
};

export const NotificationBell = (props: {
  nav: Navigation;
  deps: NotificationsDeps;
  variant: Variant;
}) => {
  const list = useQuery(notificationsQuery(props.deps));
  return (
    <Loading fallback={<BellLink nav={props.nav} variant={props.variant} unread={0} />}>
      <BellLink nav={props.nav} variant={props.variant} unread={list.data?.unread ?? 0} />
    </Loading>
  );
};
