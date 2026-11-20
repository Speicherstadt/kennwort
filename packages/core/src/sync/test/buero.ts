// The vault Büro on a sync server, with its signed log (K-305): Jonas manages, Anna edits, Max
// reads; records and the live stream are for the vault's members only
import { encodeBytes } from "../bytes.ts";
import { toWire } from "../wire.ts";
import type { Target } from "./contract.ts";
import { logEntries, vaultId } from "./fixtures.ts";

/** Version, X-Wing ciphertext and the box around the vault key (F-02): the server checks only the length */
const WRAPPED_KEY = encodeBytes(new Uint8Array(1 + 1120 + 1 + 24 + 32 + 16));

const vault = encodeBytes(vaultId);
const postAsJonas = (t: Target, path: string, body: unknown) => {
  const c = t.connect("t-jonas");
  return c.fetch(`${c.baseUrl}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
};

/** Posts one entry of the log (0: Jonas creates, 1: adds Anna, 2: adds Max) */
export const postLogEntry = async (t: Target, index: number) => {
  const entry = logEntries[index];
  if (!entry) throw new Error(`no log entry ${index}`); // i18n-ignore: for developers
  const answer = await postAsJonas(t, `/api/vaults/${vault}/log`, {
    entry: toWire(entry),
    wrappedKey: WRAPPED_KEY,
  });
  if (answer.status !== 201) throw new Error(`log: ${answer.status}`); // i18n-ignore: for developers
};

/** Creates the vault and posts its log up to `entries` (1: Jonas, 2: + Anna, 3: + Max) */
export const openBuero = async (t: Target, entries = logEntries.length) => {
  await postAsJonas(t, "/api/vaults", { id: vault });
  for (let index = 0; index < entries; index++) await postLogEntry(t, index);
};
