/**
 * The two keys after an account is made (P-01 step 3, P-12): shown once on this device, the user
 * confirms keeping them, next to the account ID, before the account is used; the printable PDF
 * holds the same and a QR code for a new device.
 */

import { encodeBytes } from "@kennwort/core";
import { formatRecoveryKey, formatSecretKey } from "@kennwort/crypto";
import { Button, getLocale, Icon, m } from "@kennwort/ui";
import { Download } from "@kennwort/ui/icons";
import { createSignal } from "solid-js";
import { kitPdf } from "../kit/kit-pdf.ts";
import { saveFile } from "../kit/save.ts";
import type { NewKeys } from "../session/session.ts";
import { Card } from "./form.tsx";

/** The printable kit for these keys, in the language the app speaks */
const savePdf = (keys: NewKeys) =>
  saveFile(
    kitPdf({
      server: location.origin,
      accountId: encodeBytes(keys.accountId),
      secretKey: formatSecretKey(keys.secretKey),
      recoveryKey: formatRecoveryKey(keys.recoveryKey),
      created: new Date().toLocaleDateString(getLocale()),
      texts: {
        title: m.kit_pdf_title(),
        intro: m.kit_text(),
        server: m.kit_server(),
        account: m.unlock_account(),
        secretKey: m.kit_secret_key(),
        recoveryKey: m.kit_recovery_key(),
        created: m.kit_created(),
        qr: m.kit_qr(),
        keep: m.kit_keep(),
      },
    }),
    "kennwort-recovery-kit.pdf",
    "application/pdf",
  );

export const Kit = (props: { keys: NewKeys; onDone: () => void }) => {
  const [saved, setSaved] = createSignal(false);
  return (
    <Card title={m.kit_title()}>
      <p class="text-[13px] text-muted-foreground">{m.kit_text()}</p>
      <dl class="grid gap-3">
        <div class="grid gap-1">
          <dt class="text-xs font-medium">{m.unlock_account()}</dt>
          <dd
            class="rounded-lg bg-muted px-3 py-2 font-mono text-[13px] break-all"
            data-testid="account-id"
          >
            {encodeBytes(props.keys.accountId)}
          </dd>
        </div>
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
      <Button class="w-fit" onClick={() => savePdf(props.keys)}>
        <Icon icon={Download} /> {m.kit_download()}
      </Button>
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
