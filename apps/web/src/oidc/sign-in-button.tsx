/**
 * "Mit <Anmeldedienst> anmelden" (K-604): shown only when the server has an identity provider. A
 * plain link to the server's start: the browser leaves the app for the provider and comes back to
 * /oidc with a ticket in the fragment. The provider signs in; it never unlocks (P-25).
 */
import type { OidcApi } from "@kennwort/client/session/oidc-api.ts";
import { buttonClass, m } from "@kennwort/ui";
import { createSignal, onSettled, Show } from "solid-js";

/** The provider's name once the server told it; undefined while there is none */
export const createOidcName = (api: Pick<OidcApi, "oidcProvider">) => {
  const [name, setName] = createSignal<string>();
  onSettled(() => {
    void api.oidcProvider().then(setName);
  });
  return name;
};

export const OidcSignIn = (props: { name: string | undefined }) => (
  <Show when={props.name}>
    {(name) => (
      <a href="/auth/oidc/start" class={buttonClass({ variant: "outline" })}>
        {m.oidc_sign_in({ name: name() })}
      </a>
    )}
  </Show>
);
