/**
 * fetch with the offline copy behind it (K-308 part b): a read the app needs offline that the
 * server answers with 200 is kept, and served from the copy when the server cannot be reached.
 * The app then checks it exactly as it checks the server – the copy is one more untrusted server.
 * Every other request goes out unchanged: the account's keys, the records (kept only once checked,
 * local-copy.ts), sign-in and every write. reachable() says whether the last request got an answer.
 */
import { createSignal } from "solid-js";
import type { CopyScope } from "./copy-scope.ts";
import type { KeyValue } from "./key-value.ts";

const READS = [
  /^\/api\/vaults$/,
  /^\/api\/vaults\/[\w-]+\/(log|keys)$/,
  /^\/api\/company$/,
  /^\/api\/members$/,
  /^\/api\/shared(\/[\w-]+\/[\w-]+)?$/,
];

const pathOf = (input: string | URL | Request) =>
  new URL(input instanceof Request ? input.url : String(input), "http://copy").pathname;
const methodOf = (input: string | URL | Request, init?: RequestInit) =>
  (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

export const parseJson = (text: string | undefined): unknown => {
  try {
    return text === undefined ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
};

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A member's name is no ciphertext: the copy keeps the members without it */
const withoutNames = (path: string, text: string) => {
  if (path !== "/api/members") return text;
  const parsed = parseJson(text);
  const members = isObject(parsed) ? parsed.members : undefined;
  if (!Array.isArray(members) || !members.every(isObject)) return undefined;
  return JSON.stringify({ members: members.map((member) => ({ ...member, name: null })) });
};

export const createCopyFetch = (store: KeyValue, scope: CopyScope) => {
  const [reachable, setReachable] = createSignal(true);
  const keep = (path: string, text: string) =>
    scope.forCurrent(async () => {
      const kept = withoutNames(path, text);
      if (kept === undefined) return;
      await store.set(`read:${path}`, kept);
      if (path === "/api/vaults") await scope.synced();
    }, undefined);
  const kept = (path: string) => scope.forCurrent(() => store.get(`read:${path}`), undefined);
  const wrap =
    (send: typeof fetch): typeof fetch =>
    async (input, init) => {
      const path = pathOf(input);
      const readable = methodOf(input, init) === "GET" && READS.some((r) => r.test(path));
      let response: Response;
      try {
        response = await send(input, init);
      } catch (error) {
        setReachable(false);
        const copy = readable ? await kept(path) : undefined;
        if (copy === undefined) throw error;
        return new Response(copy, { headers: { "content-type": "application/json" } });
      }
      setReachable(true);
      if (readable && response.status === 200) await keep(path, await response.clone().text());
      return response;
    };
  return { reachable, fetch: wrap };
};
