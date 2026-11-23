/**
 * Settings → Anmeldedienst (K-604, P-25), shown only when the server has an identity provider.
 * Everyone links their account to their person of the provider here; then their groups follow the
 * provider's groups claim, as access requests only. Owners and admins open enrolment for new people,
 * copy the link to join, and see which groups follow the provider (a group of the same name).
 */
import type { OidcApi } from "@kennwort/client/session/oidc-api.ts";
import type { OidcStatus } from "@kennwort/core";
import { Button, m, panelClass, panelTitleClass, Switch as Toggle } from "@kennwort/ui";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Loading, Show } from "solid-js";
import { queryKeys } from "../queries.ts";

const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";

type Admin = {
  name: string;
  enrolment: boolean;
  enrolmentUrl: string;
  groupsClaim: string;
  groups: NonNullable<OidcStatus["groups"]>;
};
/** What only owners and admins are shown; undefined for everyone else */
const adminOf = ({ name, enrolment, enrolmentUrl, groupsClaim, groups }: OidcStatus) =>
  enrolment !== undefined && enrolmentUrl && groupsClaim && groups
    ? ({ name, enrolment, enrolmentUrl, groupsClaim, groups } satisfies Admin)
    : undefined;

const Groups = (props: { status: Admin }) => (
  <div class="grid gap-1">
    <h3 class="text-xs font-medium">{m.oidc_groups({ claim: props.status.groupsClaim })}</h3>
    <p class="text-xs text-muted-foreground">{m.oidc_groups_text()}</p>
    <Show
      when={props.status.groups.length > 0}
      fallback={<p class="text-xs text-muted-foreground">{m.oidc_groups_none()}</p>}
    >
      <ul class="divide-y divide-border rounded-xl border border-border" data-testid="oidc-groups">
        <For each={props.status.groups}>
          {(group) => (
            <li class="flex items-center justify-between gap-3 px-3.5 py-2 text-[13px]">
              <span class="font-medium">{group.name}</span>
              <span class="text-xs text-muted-foreground">
                {m.oidc_group_count({ count: String(group.viaIdp) })}
              </span>
            </li>
          )}
        </For>
      </ul>
    </Show>
  </div>
);

const Enrolment = (props: { status: Admin; busy: boolean; onToggle: (open: boolean) => void }) => (
  <div class="grid gap-2">
    <label class="flex min-h-11 items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5 text-[13px] font-medium">
      {m.oidc_enrolment({ name: props.status.name })}
      <Toggle
        checked={props.status.enrolment}
        disabled={props.busy}
        onChange={(event) => {
          // The server holds the setting: the box shows it until the change is saved and loaded
          const open = event.currentTarget.checked;
          event.currentTarget.checked = props.status.enrolment;
          props.onToggle(open);
        }}
      />
    </label>
    <p class="text-xs text-muted-foreground">{m.oidc_enrolment_text()}</p>
    <Show when={props.status.enrolment}>
      <p class="text-xs font-medium">{m.oidc_enrolment_url()}</p>
      <p
        class="rounded-lg bg-muted px-3 py-2 font-mono text-xs break-all select-all"
        data-testid="oidc-enrolment-url"
      >
        {props.status.enrolmentUrl}
      </p>
    </Show>
  </div>
);

export const OidcSection = (props: {
  token: string;
  api: Pick<OidcApi, "oidcStatus" | "setEnrolment" | "linkOidc">;
  /** Where the browser goes to link: the provider's address (location.assign in the app) */
  go?: (url: string) => void;
}) => {
  const client = useQueryClient();
  // null without a provider: a query holds a value, never undefined
  const status = useQuery(() => {
    const token = props.token;
    return {
      queryKey: queryKeys.oidc,
      queryFn: async () => (await props.api.oidcStatus(token)) ?? null,
    };
  });
  const [busy, setBusy] = createSignal(false);
  const [problem, setProblem] = createSignal<string>();
  const toggle = async (open: boolean) => {
    setBusy(true);
    setProblem(undefined);
    const saved = await props.api.setEnrolment(props.token, open);
    setBusy(false);
    if (!saved) setProblem(m.oidc_enrolment_failed());
    await client.invalidateQueries({ queryKey: queryKeys.oidc });
  };
  const link = async () => {
    setBusy(true);
    setProblem(undefined);
    const url = await props.api.linkOidc(props.token);
    setBusy(false);
    if (!url) return setProblem(m.oidc_link_failed());
    (props.go ?? ((to) => location.assign(to)))(url);
  };
  return (
    <Loading>
      <Show when={status.data}>
        {(shown) => (
          <section aria-labelledby="oidc-title" class={panelClass}>
            <h2 id="oidc-title" class={panelTitleClass}>
              {m.oidc_section_title()}
            </h2>
            <Show
              when={shown().linked}
              fallback={
                <div class="grid gap-1">
                  <Button class="w-fit" disabled={busy()} onClick={() => void link()}>
                    {m.oidc_link({ name: shown().name })}
                  </Button>
                  <p class="text-xs text-muted-foreground">{m.oidc_link_text()}</p>
                </div>
              }
            >
              <p class="text-[13px]">{m.oidc_linked({ name: shown().name })}</p>
            </Show>
            <Show when={adminOf(shown())}>
              {(admin) => (
                <>
                  <Enrolment
                    status={admin()}
                    busy={busy()}
                    onToggle={(open) => void toggle(open)}
                  />
                  <Groups status={admin()} />
                </>
              )}
            </Show>
            <Show when={problem()}>
              <p role="alert" class={alertClass}>
                {problem()}
              </p>
            </Show>
          </section>
        )}
      </Show>
    </Loading>
  );
};
