/**
 * Einstellungen → „Firmen“ (K-605, P-27): the companies of the account, the switch between them,
 * and, from the own company, joining another one with an invitation link or setting one up with the
 * operator's setup code. Each company keeps its own account, keys and logs; the server cannot tell
 * that they belong together from anything but the requests of one device.
 */
import type { StateDeps } from "@kennwort/client/session/state-sync.ts";
import { Badge, Button, Icon, Input, m, pageClass } from "@kennwort/ui";
import { Building2 } from "@kennwort/ui/icons";
import type { JSX } from "@solidjs/web";
import { createSignal, For, Show } from "solid-js";
import { errorText } from "../account/form.tsx";
import type { LinkError } from "../session/companies.ts";
import type { Session } from "../session/session.ts";
import type { CompanySwitcher } from "./company-switch.ts";
import { parseInvitationLink } from "./invitation-link.ts";

const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";

const linkErrorText = (error: LinkError | "link") =>
  error === "link"
    ? m.companies_link_broken()
    : error === "name"
      ? m.companies_name_taken()
      : error === "not-home"
        ? m.companies_manage_at_home()
        : errorText(error);

type Done = { ok: true; value: string } | { ok: false; error: LinkError | "link" };

/** A form that links a company: its name and one more field, then the switch to it */
const LinkForm = (props: {
  title: string;
  field: string;
  hint: string;
  submit: string;
  onLink: (name: string, value: string) => Promise<Done>;
  onLinked: (accountId: string) => void;
}) => {
  const [name, setName] = createSignal("");
  const [value, setValue] = createSignal("");
  const [error, setError] = createSignal<LinkError | "link">();
  const [busy, setBusy] = createSignal(false);
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    setBusy(true);
    const done = await props.onLink(name(), value());
    setBusy(false);
    if (!done.ok) return setError(done.error);
    setError(undefined);
    props.onLinked(done.value);
  };
  return (
    <form class="grid max-w-md gap-2" onSubmit={submit}>
      <h2 class="font-semibold">{props.title}</h2>
      <Input
        label={m.companies_name()}
        hint={m.companies_name_hint()}
        maxlength={100}
        required
        onInput={(event) => setName(event.currentTarget.value)}
      />
      <Input
        label={props.field}
        hint={props.hint}
        autocomplete="off"
        required
        onInput={(event) => setValue(event.currentTarget.value)}
      />
      <Show when={error()}>
        {(e) => (
          <p role="alert" class={alertClass}>
            {linkErrorText(e())}
          </p>
        )}
      </Show>
      <Button type="submit" class="w-fit" disabled={busy()}>
        {busy() ? m.working() : props.submit}
      </Button>
    </form>
  );
};

const Row = (props: { name: string; active: boolean; children?: JSX.Element }) => (
  <li class="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
    <Icon icon={Building2} />
    <span class="min-w-0 flex-1 truncate">{props.name}</span>
    <Show when={props.active}>
      <Badge tone="success">{m.companies_active()}</Badge>
    </Show>
    {props.children}
  </li>
);

export const CompaniesPage = (props: {
  session: Session;
  api: StateDeps;
  switcher: CompanySwitcher;
}) => {
  const companies = () => props.session.companies;
  const join = async (name: string, link: string): Promise<Done> => {
    const invitation = parseInvitationLink(link);
    if (!invitation) return { ok: false, error: "link" };
    return companies().join(props.api, name, invitation);
  };
  const linked = (accountId: string) => void props.switcher.switchTo(accountId);
  return (
    <section aria-labelledby="page-title" class={pageClass()}>
      <h1 id="page-title" class="mb-4 text-[28px] font-semibold md:text-lg">
        {m.companies_title()}
      </h1>
      <p class="mb-4 max-w-prose text-muted-foreground">{m.companies_intro()}</p>
      <ul
        aria-label={m.companies_title()}
        class="mb-6 divide-y divide-border rounded-xl border border-border"
      >
        <For each={companies().companies()}>
          {(company) => {
            const active = () => companies().activeId() === company.accountId;
            const name = company.name ?? m.companies_home();
            return (
              <Row name={name} active={active()}>
                <Show when={!active()}>
                  <Button
                    disabled={props.switcher.busy()}
                    aria-label={m.companies_switch_to({ name })}
                    onClick={() => linked(company.accountId)}
                  >
                    {m.companies_switch_button()}
                  </Button>
                </Show>
                <Show when={!company.home && companies().atHome()}>
                  <Button
                    aria-label={m.companies_remove({ name })}
                    onClick={() => void companies().unlink(props.api, company.accountId)}
                  >
                    {m.companies_remove_button()}
                  </Button>
                </Show>
              </Row>
            );
          }}
        </For>
      </ul>
      <Show when={props.switcher.busy()}>
        <p class="mb-4 text-muted-foreground" role="status">
          {m.companies_switching()}
        </p>
      </Show>
      <Show when={props.switcher.error()}>
        {(e) => (
          <p role="alert" class={`mb-4 ${alertClass}`}>
            {errorText(e())}
          </p>
        )}
      </Show>
      <Show
        when={companies().atHome()}
        fallback={<p class="text-muted-foreground">{m.companies_manage_at_home()}</p>}
      >
        <div class="grid gap-8">
          <LinkForm
            title={m.companies_join_title()}
            field={m.companies_join_link()}
            hint={m.companies_join_hint()}
            submit={m.companies_join_submit()}
            onLink={join}
            onLinked={linked}
          />
          <LinkForm
            title={m.companies_setup_title()}
            field={m.setup_code()}
            hint={m.companies_setup_hint()}
            submit={m.companies_setup_submit()}
            onLink={(name, code) => companies().setUp(props.api, name, code)}
            onLinked={linked}
          />
        </div>
      </Show>
    </section>
  );
};
