/** What the account screens share: the card they sit on, error texts and the passphrase rule */
import { m } from "@kennwort/ui";
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";
import type { SessionError } from "../session/session.ts";

export const errorText = (
  error: SessionError | "passphrase-mismatch" | "passphrase-short",
): string =>
  ({
    "wrong-code": m.error_wrong_code(),
    "invalid-invitation": m.error_invalid_invitation(),
    "too-many-requests": m.error_too_many(),
    "wrong-passphrase": m.error_wrong_passphrase(),
    unexpected: m.error_unexpected(),
    "passphrase-mismatch": m.error_passphrase_mismatch(),
    "passphrase-short": m.error_passphrase_short(),
  })[error];

/** At least four words or 16 characters (DESIGN.md, Texte: a hint, not a strength meter yet) */
export const passphraseProblem = (passphrase: string, repeated: string) =>
  passphrase.trim().split(/\s+/).length < 4 && passphrase.length < 16
    ? ("passphrase-short" as const)
    : passphrase !== repeated
      ? ("passphrase-mismatch" as const)
      : undefined;

export const Card = (props: {
  title: string;
  children: JSX.Element;
  error?: string | undefined;
}) => (
  <main class="grid min-h-dvh place-items-center bg-muted p-4">
    <section
      aria-labelledby="card-title"
      class="grid w-full max-w-md gap-4 rounded-xl border border-border bg-background p-6"
    >
      <h1 id="card-title" class="text-lg font-semibold">
        {props.title}
      </h1>
      <Show when={props.error}>
        <p role="alert" class="rounded-lg border border-danger px-3 py-2 text-[13px] text-danger">
          {props.error}
        </p>
      </Show>
      {props.children}
    </section>
  </main>
);
