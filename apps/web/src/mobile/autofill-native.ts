/**
 * The webview's side of the Android autofill (K-802, docs/plan.md, Entscheidungen "Autofill unter
 * Android"): the Kotlin service holds what the system asked for in memory, and the Rust commands
 * hand it here as the JSON of the bridge (packages/client/src/autofill/bridge.ts). Everything that
 * comes in is parsed and refused if unexpected; what goes out is a fill response for exactly the
 * pending request, or a cancel.
 */
import {
  type FillRequest,
  type FillResponse,
  parseFillRequest,
  parseSaveProposal,
  type SaveProposal,
} from "@kennwort/client/autofill/bridge.ts";
import { appAddress } from "@kennwort/client/autofill/choose.ts";
import type { LoginInput } from "@kennwort/client/entries/entries.ts";
import type { Invoke } from "./native-send.ts";

export type NativeAutofill = {
  /** The request the service is waiting on, if any */
  pending: () => Promise<FillRequest | undefined>;
  respond: (response: FillResponse) => Promise<void>;
  /** A login the person chose to save in Android's own dialog, taken once */
  takeSave: () => Promise<SaveProposal | undefined>;
};

const parsedJson = (text: unknown): unknown => {
  if (typeof text !== "string") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

// Outside Android (desktop dev, iOS for now) the commands fail: then there is nothing to fill
const quiet = <T>(call: Promise<T>) => call.catch(() => undefined);

export const nativeAutofill = (invoke: Invoke): NativeAutofill => ({
  pending: async () => {
    const parsed = parseFillRequest(parsedJson(await quiet(invoke<unknown>("autofill_pending"))));
    return parsed.ok ? parsed.value : undefined;
  },
  respond: async (response) => {
    await quiet(invoke("autofill_respond", { response: JSON.stringify(response) }));
  },
  takeSave: async () => {
    const parsed = parseSaveProposal(
      parsedJson(await quiet(invoke<unknown>("autofill_take_save"))),
    );
    return parsed.ok ? parsed.value : undefined;
  },
});

/** The editor's start for a login to save: the page's https address or the app's package */
export const loginToSave = (proposal: SaveProposal): LoginInput => ({
  title: proposal.target.kind === "web" ? proposal.target.host : proposal.target.id,
  username: proposal.username,
  password: proposal.password,
  website:
    proposal.target.kind === "web"
      ? `https://${proposal.target.host}`
      : appAddress(proposal.target.id),
});
