/**
 * The two keys after an account is made (P-01 step 3, P-12): shown once on this device, the user
 * confirms keeping them before the account is used. The printable PDF follows (K-303 part 3).
 */

import { formatRecoveryKey, formatSecretKey } from "@kennwort/crypto";
import { Button, m } from "@kennwort/ui";
import { createSignal } from "solid-js";
import type { NewKeys } from "../session/session.ts";
import { Card } from "./form.tsx";

export const Kit = (props: { keys: NewKeys; onDone: () => void }) => {
  const [saved, setSaved] = createSignal(false);
  return (
    <Card title={m.kit_title()}>
      <p class="text-[13px] text-muted-foreground">{m.kit_text()}</p>
      <dl class="grid gap-3">
        <div class="grid gap-1">
          <dt class="text-xs font-medium">{m.kit_secret_key()}</dt>
          <dd
            class="rounded-lg bg-muted px-3 py-2 font-mono text-[13px] break-all"
            data-testid="secret-key"
          >
            {formatSecretKey(props.keys.secretKey)}
          </dd>
        </div>
        <div class="grid gap-1">
          <dt class="text-xs font-medium">{m.kit_recovery_key()}</dt>
          <dd
            class="rounded-lg bg-muted px-3 py-2 font-mono text-[13px] break-all"
            data-testid="recovery-key"
          >
            {formatRecoveryKey(props.keys.recoveryKey)}
          </dd>
        </div>
      </dl>
      <label class="flex items-start gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={saved()}
          onChange={(event) => setSaved(event.currentTarget.checked)}
        />
        {m.kit_saved()}
      </label>
      <Button variant="primary" disabled={!saved()} onClick={() => props.onDone()}>
        {m.kit_continue()}
      </Button>
    </Card>
  );
};
