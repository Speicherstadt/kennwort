/**
 * The one contract between the native autofill code and the shared TypeScript (K-801 lays it out,
 * K-802 fills it; docs/plan.md, Entscheidungen "Autofill-Brücke der App"). Android's
 * AutofillService (Kotlin) and, later, iOS's Credential Provider (Swift) only collect what the
 * system asks for and fill what comes back; unlocking, the exact-host match and the choice of entry
 * run here, in the webview, on the same packages as the web app and the extension. Both platforms
 * send the same JSON, so neither carries its own copy of the logic.
 *
 * A request carries no secret, only where to fill. A response carries the secret only after the
 * person unlocked and picked an entry in the app: never without a user action (CLAUDE.md, Never).
 */
import type { Result } from "@kennwort/crypto";

const ok = <T>(value: T) => ({ ok: true as const, value });
const err = <E extends string>(error: E) => ({ ok: false as const, error });

export const BRIDGE_VERSION = 1;

/** Where the system wants to fill: a web page (its host) or a native app (package / service id) */
export type FillTarget = { kind: "web"; host: string } | { kind: "app"; id: string };

export type FillField = "username" | "password" | "totp";
const FIELDS: readonly FillField[] = ["username", "password", "totp"];

export type FillRequest = {
  version: typeof BRIDGE_VERSION;
  requestId: string;
  target: FillTarget;
  fields: FillField[];
};

export type FillResponse =
  | {
      version: typeof BRIDGE_VERSION;
      requestId: string;
      kind: "fill";
      values: Partial<Record<FillField, string>>;
    }
  | { version: typeof BRIDGE_VERSION; requestId: string; kind: "cancel" };

export type BridgeError =
  | "not-an-object"
  | "wrong-version"
  | "bad-request-id"
  | "bad-target"
  | "bad-fields";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Ids the native side mints itself (a UUID); bounded so a broken caller cannot flood the webview
const REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/;
// A lower-case host as Android's ViewNode.webDomain and URL parsing give it; the exact match itself
// stays with the shared matcher (matches.ts, moved here from the extension in K-802)
const HOST = /^[a-z0-9.-]{1,253}$/;
// An Android package name or an iOS service identifier
const APP_ID = /^[A-Za-z][A-Za-z0-9_.]{0,254}$/;

const parseTarget = (value: unknown): FillTarget | undefined => {
  if (!isRecord(value)) return undefined;
  if (value.kind === "web" && typeof value.host === "string" && HOST.test(value.host))
    return { kind: "web", host: value.host };
  if (value.kind === "app" && typeof value.id === "string" && APP_ID.test(value.id))
    return { kind: "app", id: value.id };
  return undefined;
};

const parseFields = (value: unknown): FillField[] | undefined => {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const fields = value.filter((field): field is FillField => FIELDS.includes(field as FillField));
  return fields.length === value.length ? [...new Set(fields)] : undefined;
};

/** Reads what the native side sent; anything unexpected is refused, never guessed */
export const parseFillRequest = (raw: unknown): Result<FillRequest, BridgeError> => {
  if (!isRecord(raw)) return err("not-an-object");
  if (raw.version !== BRIDGE_VERSION) return err("wrong-version");
  if (typeof raw.requestId !== "string" || !REQUEST_ID.test(raw.requestId))
    return err("bad-request-id");
  const target = parseTarget(raw.target);
  if (!target) return err("bad-target");
  const fields = parseFields(raw.fields);
  if (!fields) return err("bad-fields");
  return ok({ version: BRIDGE_VERSION, requestId: raw.requestId, target, fields });
};

/** The answer to a request: only the fields it asked for, so nothing more leaves the webview */
export const fillResponse = (
  request: FillRequest,
  values: Partial<Record<FillField, string>>,
): FillResponse => ({
  version: BRIDGE_VERSION,
  requestId: request.requestId,
  kind: "fill",
  values: Object.fromEntries(
    request.fields.flatMap((field) =>
      values[field] === undefined ? [] : [[field, values[field]]],
    ),
  ),
});

export const cancelResponse = (request: FillRequest): FillResponse => ({
  version: BRIDGE_VERSION,
  requestId: request.requestId,
  kind: "cancel",
});

/**
 * A login the system offered to save after the person typed it into another app or page and
 * confirmed Android's own "Save to Kennwort?" (K-802). It opens the app's editor filled in; only a
 * second confirmation there saves it, so nothing is written on the native side's word alone.
 */
export type SaveProposal = {
  version: typeof BRIDGE_VERSION;
  requestId: string;
  target: FillTarget;
  username: string;
  password: string;
};

// What one form field may carry: bounded, so a broken caller cannot flood the webview
const MAX_VALUE = 4096;
const isValue = (value: unknown): value is string =>
  typeof value === "string" && value.length <= MAX_VALUE;

export const parseSaveProposal = (raw: unknown): Result<SaveProposal, BridgeError> => {
  if (!isRecord(raw)) return err("not-an-object");
  if (raw.version !== BRIDGE_VERSION) return err("wrong-version");
  if (typeof raw.requestId !== "string" || !REQUEST_ID.test(raw.requestId))
    return err("bad-request-id");
  const target = parseTarget(raw.target);
  if (!target) return err("bad-target");
  if (!isValue(raw.username) || !isValue(raw.password) || raw.password === "")
    return err("bad-fields");
  return ok({
    version: BRIDGE_VERSION,
    requestId: raw.requestId,
    target,
    username: raw.username,
    password: raw.password,
  });
};
