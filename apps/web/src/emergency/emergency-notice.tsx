/**
 * The grantor's notice of a request for emergency access (K-307 part d, P-14): the server shows the
 * request, and the app says so on every page until the grantor answers or the waiting time is over,
 * with a link to object. It loads when the account opens, with the page and every five minutes. At the top like the rotation notice; only its link takes clicks.
 */
import { Icon, m } from "@kennwort/ui";
import { TriangleExclamationPoint } from "@kennwort/ui/icons";
import { useQuery } from "@tanstack/solid-query";
import { For, Loading, Show } from "solid-js";
import { Link } from "../frame/link.tsx";
import type { Navigation } from "../navigation.ts";
import type { Session } from "../session/session.ts";
import { dateText } from "../vaults/day.ts";
import { emergencyQuery, waitingRequests } from "./emergency.ts";
import type { EmergencyPageApi } from "./emergency-page.tsx";

const REFRESH_MS = 5 * 60_000;

export const EmergencyNotice = (props: {
  api: EmergencyPageApi;
  session: Session;
  nav: Navigation;
}) => {
  // Loaded when the account opens, with the page, and every few minutes while the app stays open
  const query = emergencyQuery(props.api, props.session);
  const overview = useQuery(() => ({ ...query(), refetchInterval: REFRESH_MS }));
  const waiting = () => waitingRequests(overview.data?.given ?? [], Math.floor(Date.now() / 1000));
  return (
    <div role="status" aria-live="polite">
      <Loading>
        <Show when={waiting().length > 0 && props.nav.route().page !== "emergency"}>
          <ul class="pointer-events-none fixed top-2 right-4 left-4 z-50 grid gap-2 md:right-auto md:left-1/2 md:w-[28rem] md:-translate-x-1/2">
            <For each={waiting()}>
              {(given) => (
                <li class="flex items-start gap-3 rounded-xl border border-warning bg-background p-3 text-[13px] shadow-lg">
                  <span class="text-warning">
                    <Icon icon={TriangleExclamationPoint} size={18} />
                  </span>
                  <p class="flex-1 text-foreground">
                    {m.emergency_request_notice({
                      name: given.grantee?.name ?? m.vault_members_unnamed(),
                      date: dateText(given.releaseAt ?? 0),
                    })}{" "}
                    <Link nav={props.nav} href="/emergency" class="pointer-events-auto underline">
                      {m.emergency_notice_link()}
                    </Link>
                  </p>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Loading>
    </div>
  );
};
