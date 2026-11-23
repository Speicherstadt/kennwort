/** What the account screens share: the card they sit on, error texts and the passphrase rule */
import { Icon, m } from "@kennwort/ui";
import { Lock } from "@kennwort/ui/icons";
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
    "wrong-recovery-key": m.error_wrong_recovery_key(),
    unreachable: m.error_unreachable(),
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

/** The brand mark above every account card: the lock that Kennwort stands for */
const Mark = () => (
  <div
    aria-hidden="true"
    class="mx-auto grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"
  >
    <Icon icon={Lock} />
  </div>
);

export const Card = (props: {
  title: string;
  children: JSX.Element;
  error?: string | undefined;
}) => (
  <main class="grid min-h-dvh place-items-center bg-muted px-4 py-10">
    <div class="grid w-full max-w-sm gap-6">
      <section
        aria-labelledby="card-title"
        class="grid gap-5 rounded-xl border border-border bg-background p-6 shadow-sm md:p-8"
      >
        <div class="grid gap-3 text-center">
          <Mark />
          <h1 id="card-title" class="text-xl font-semibold tracking-tight">
            {props.title}
          </h1>
        </div>
        <Show when={props.error}>
          <p role="alert" class="rounded-lg border border-danger px-3 py-2 text-[13px] text-danger">
            {props.error}
          </p>
        </Show>
        {props.children}
      </section>
      <p class="text-center text-xs text-muted-foreground">{m.card_tagline()}</p>
    </div>
  </main>
);
