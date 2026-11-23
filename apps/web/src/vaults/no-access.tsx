/**
 * A link to a vault this account is not a member of (K-305 part 4): nothing of the vault shows,
 * only the way to ask its managers for access (P-05 step 4)
 */
import { Button, Icon, m, pageClass } from "@kennwort/ui";
import { Lock } from "@kennwort/ui/icons";
import { createSignal, Match, Show, Switch } from "solid-js";

type Asked = "no" | "busy" | "sent" | "failed";

export const NoAccess = (props: { onRequest: () => Promise<boolean> }) => {
  const [asked, setAsked] = createSignal<Asked>("no");
  const ask = async () => {
    setAsked("busy");
    setAsked((await props.onRequest()) ? "sent" : "failed");
  };
  return (
    <section aria-labelledby="page-title" class={pageClass()}>
      <h1 id="page-title" class="mb-4 flex items-center gap-2 text-[28px] font-semibold md:text-lg">
        <Icon icon={Lock} /> {m.no_access_title()}
      </h1>
      <p class="mb-4 max-w-prose text-muted-foreground">{m.no_access_intro()}</p>
      <Switch>
        <Match when={asked() === "sent"}>
          <p role="status">{m.no_access_sent()}</p>
        </Match>
        <Match when={asked() !== "sent"}>
          <Button disabled={asked() === "busy"} onClick={ask}>
            {m.no_access_request()}
          </Button>
          <Show when={asked() === "failed"}>
            <p class="mt-2 text-[13px] text-danger" role="alert">
              {m.no_access_failed()}
            </p>
          </Show>
        </Match>
      </Switch>
    </section>
  );
};
