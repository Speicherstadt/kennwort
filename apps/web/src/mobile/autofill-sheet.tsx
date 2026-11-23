/**
 * Picking the entry for an Android autofill request (K-802). It is shown only inside the opened
 * account, so a request waits until the person unlocked the app the usual way; then it lists only
 * the logins stored for exactly the requested page or app (choose.ts) and fills nothing until one
 * is tapped. Closing the dialog answers with a cancel, so the other app fills nothing. A login the
 * person chose to save in Android's own dialog opens the editor filled in; saving there is the
 * second confirmation.
 */

import type { FillRequest } from "@kennwort/client/autofill/bridge.ts";
import { cancelResponse } from "@kennwort/client/autofill/bridge.ts";
import { answerFor, candidates } from "@kennwort/client/autofill/choose.ts";
import type { LoginInput, ShownEntry } from "@kennwort/client/entries/entries.ts";
import { Button, Dialog, m } from "@kennwort/ui";
import { createSignal, For, onSettled, Show } from "solid-js";
import type { AutofillHost } from "../app.tsx";
import { loginToSave, type NativeAutofill } from "./autofill-native.ts";

const targetName = (request: FillRequest) =>
  request.target.kind === "web" ? request.target.host : request.target.id;

export const AutofillSheet = (props: {
  native: NativeAutofill;
  entries: () => ShownEntry[];
  onSave: (login: LoginInput) => void;
}) => {
  const [request, setRequest] = createSignal<FillRequest>();
  const look = async () => {
    setRequest(await props.native.pending());
    const proposal = await props.native.takeSave();
    if (proposal) props.onSave(loginToSave(proposal));
  };
  // Asked when the account opens and each time the app comes back to the front: the service
  // brings the app forward for a new request while this frame may already be open
  onSettled(() => {
    void look();
    const onVisible = () => {
      if (document.visibilityState === "visible") void look();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  });
  const finish = (shown: FillRequest, pickedId?: string) => {
    const answer = pickedId ? answerFor(shown, props.entries(), pickedId) : undefined;
    setRequest(undefined);
    void props.native.respond(answer ?? cancelResponse(shown));
  };
  return (
    <Show when={request()} keyed>
      {(shown) => (
        <Dialog
          open
          onClose={() => finish(shown)}
          title={m.mobile_autofill_title({ target: targetName(shown) })}
          description={m.mobile_autofill_text()}
        >
          <div class="grid gap-2 p-4 pt-2">
            <For
              each={candidates(shown, props.entries())}
              fallback={
                <p class="text-[13px] text-muted-foreground">
                  {m.mobile_autofill_none({ target: targetName(shown) })}
                </p>
              }
            >
              {(entry) => (
                <Button variant="outline" onClick={() => finish(shown, entry.id)}>
                  <span class="truncate">
                    {entry.title}
                    <Show when={entry.username}>
                      {(name) => <span class="text-muted-foreground"> · {name()}</span>}
                    </Show>
                  </span>
                </Button>
              )}
            </For>
            <Button variant="ghost" onClick={() => finish(shown)}>
              {m.mobile_autofill_cancel()}
            </Button>
          </div>
        </Dialog>
      )}
    </Show>
  );
};

/** The picker as the opened account renders it (app.tsx, AutofillHost) */
export const autofillHost =
  (native: NativeAutofill): AutofillHost =>
  (deps) => <AutofillSheet native={native} entries={deps.entries} onSave={deps.onSave} />;
