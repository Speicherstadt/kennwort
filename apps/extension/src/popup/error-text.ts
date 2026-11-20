/** What the popup says when connecting or unlocking did not work (messages/*.json) */
import { m } from "@kennwort/ui";
import type { PopupError } from "../account/popup-account.ts";

export const errorText = (error: PopupError): string =>
  ({
    "wrong-code": m.error_unexpected(),
    "invalid-invitation": m.error_unexpected(),
    "too-many-requests": m.error_too_many(),
    "wrong-passphrase": m.error_wrong_passphrase(),
    "wrong-recovery-key": m.error_unexpected(),
    // The extension keeps no offline copy (K-308 part b is the web app's): it needs the server
    unreachable: m.error_server_unreachable(),
    unexpected: m.error_unexpected(),
    "invalid-server": m.error_invalid_server(),
    "insecure-server": m.error_insecure_server(),
    "invalid-account": m.error_invalid_account(),
    "storage-failed": m.error_storage_failed(),
  })[error];
