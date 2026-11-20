/**
 * Solid 1.x patterns that have no place in this repository (docs/solid-2.0/MIGRATION.md, "Quick
 * rename / removal map"): `bun run lint` fails on any of them in the Solid code. Names count only
 * where they come from Solid, so a crypto `unwrap` or Hono's `onError` stays allowed.
 */

export type Finding = { line: number; rule: string };

/** Removed or renamed in 2.0, with what replaces it (MIGRATION.md) */
const REMOVED: Record<string, string> = {
  createResource: "an async createMemo (or createStore(fn)) under <Loading>",
  createComputed: "createMemo, a split createEffect or createSignal(fn)",
  createMutable: "createStore with draft setters",
  modifyMutable: "createStore with draft setters",
  createSelector: "createProjection or createStore(fn)",
  createDynamic: "the dynamic(source) factory",
  Dynamic: "the dynamic(source) factory",
  indexArray: "mapArray with keyed: false",
  resetErrorBoundaries: "nothing: error boundaries heal by themselves",
  enableScheduling: "nothing: removed",
  startTransition: "built-in transitions, isPending, Loading and the optimistic APIs",
  useTransition: "built-in transitions, isPending, Loading and the optimistic APIs",
  batch: "default microtask batching; flush() where a synchronous point is needed",
  on: "a split createEffect(source, fn)",
  onError: "<Errored> or the effect's error option",
  catchError: "<Errored> or the effect's error option",
  produce: "the draft-first store setter",
  unwrap: "snapshot",
  mergeProps: "merge",
  splitProps: "omit",
  onMount: "onSettled",
  equalFn: "isEqual",
  getListener: "getObserver",
  Suspense: "<Loading>",
  SuspenseList: "<Reveal>",
  ErrorBoundary: "<Errored>",
  Index: "<For keyed={false}>",
  observable: "a createEffect pushing to the subscriber",
  writeSignal: "nothing: removed",
  sharedConfig: "nothing: not public",
  clearDelegatedEvents: "disposing the render root",
};

const SOLID_MODULES = new Set(["solid-js", "@solidjs/web"]);

/** Patterns that are wrong wherever they appear in Solid code */
const TEXT_RULES: { pattern: RegExp; rule: string }[] = [
  {
    pattern: /from\s+["']solid-js\/(web|store|h|html|universal|jsx-runtime|jsx-dev-runtime)["']/,
    rule: "1.x subpath import: use @solidjs/web, solid-js or the @solidjs/* package",
  },
  { pattern: /\bclassList\s*=/, rule: "classList: use class with an object or array" },
  {
    pattern: /\s(use|attr|bool|on|oncapture):[\w-]+\s*=/,
    rule: "removed JSX namespace (use:, attr:, bool:, on:, oncapture:): use ref factories, plain attributes or onClick",
  },
  {
    pattern: /<\w+\.Provider\b/,
    rule: "Context.Provider: the context is the provider (<Ctx value>)",
  },
  {
    pattern: /\/\*\s*@once\s*\*\//,
    rule: "/*@once*/ is gone: use untrack for a deliberate one-time read",
  },
];

/** A name Solid exports, as this file calls it: `effect` for `createEffect as effect`, `S.onMount` */
type Imported = { name: string; local: string };

const importedFromSolid = (source: string): Imported[] => {
  const names: Imported[] = [];
  for (const match of source.matchAll(
    /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g,
  )) {
    if (!SOLID_MODULES.has(match[2] as string)) continue;
    for (const part of (match[1] as string).split(",")) {
      const [name, alias] = part
        .replace(/^\s*type\s+/, "")
        .split(/\s+as\s+/)
        .map((word) => word.trim());
      if (name) names.push({ name, local: alias || name });
    }
  }
  // A namespace import hides nothing: each `S.name` it is used with counts as imported
  for (const match of source.matchAll(/import\s*\*\s*as\s+(\w+)\s+from\s*["']([^"']+)["']/g)) {
    if (!SOLID_MODULES.has(match[2] as string)) continue;
    const space = match[1] as string;
    for (const use of source.matchAll(new RegExp(`\\b${space}\\.(\\w+)`, "g")))
      names.push({ name: use[1] as string, local: `${space}.${use[1]}` });
  }
  return [...new Map(names.map((imported) => [imported.local, imported])).values()];
};

const lineOf = (source: string, index: number) => source.slice(0, index).split("\n").length;

/**
 * Walks from the bracket at `open` to its partner, skipping strings; calls `onComma` for each comma
 * directly inside it. Returns the partner's index, or -1 if there is none
 */
const bracketEnd = (source: string, open: number, onComma: (at: number) => void = () => {}) => {
  let depth = 0;
  let quote: string | undefined;
  for (let i = open; i < source.length; i++) {
    const c = source[i] as string;
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) {
      depth--;
      if (depth === 0) return i;
    } else if (c === "," && depth === 1) onComma(i);
  }
  return -1;
};

/** The arguments of the call whose "(" is at `open`, split at top-level commas */
export const callArguments = (source: string, open: number): string[] => {
  const commas: number[] = [];
  const end = bracketEnd(source, open, (at) => commas.push(at));
  if (end < 0) return [];
  const bounds = [open, ...commas, end];
  return bounds
    .slice(1)
    .map((to, i) => source.slice((bounds[i] as number) + 1, to))
    .filter((arg) => arg.trim() !== "");
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** createEffect with one function (1.x) and createMemo with an initial value */
const callRules = (source: string, imported: Imported[]): Finding[] =>
  imported
    .filter(({ name }) => ["createEffect", "createMemo", "createRenderEffect"].includes(name))
    .flatMap(({ name, local }) =>
      [
        ...source.matchAll(new RegExp(`(?<![\\w.$])${escapeRegExp(local)}\\s*(<[^(]*>)?\\(`, "g")),
      ].flatMap((match): Finding[] => {
        const args = callArguments(source, (match.index ?? 0) + match[0].length - 1);
        const line = lineOf(source, match.index ?? 0);
        if (name !== "createMemo" && args.length === 1)
          return [
            { line, rule: `${name} with one function (1.x): split it into compute and apply` },
          ];
        const second = name === "createMemo" ? args[1] : undefined;
        if (second !== undefined && !second.trim().startsWith("{"))
          return [
            { line, rule: "createMemo's second argument is options now, not an initial value" },
          ];
        return [];
      }),
    );

/** onCleanup inside a ref callback: refs are unowned in 2.0, the cleanup never runs */
const refRules = (source: string): Finding[] =>
  [...source.matchAll(/\bref=\{\s*(?:async\s+)?(?:function\b|\(|\w+\s*=>)/g)].flatMap((match) => {
    const open = (match.index ?? 0) + match[0].indexOf("{");
    const body = source.slice(open, Math.max(open, bracketEnd(source, open)));
    return /\bonCleanup\s*\(/.test(body)
      ? [
          {
            line: lineOf(source, match.index ?? 0),
            rule: "onCleanup in a ref callback: refs are unowned; use onSettled or a ref factory",
          },
        ]
      : [];
  });

/**
 * The opening tags of DOM elements (lowercase names), with what stands inside `{}` and quotes
 * blanked out, so an attribute matches wherever the formatter puts it, also on its own line
 */
const elementTags = (source: string): { start: number; text: string }[] =>
  [...source.matchAll(/<[a-z][\w-]*/g)].flatMap((match) => {
    const start = match.index ?? 0;
    let text = "";
    for (let i = start; i < source.length; i++) {
      const c = source[i] as string;
      if (c === ">") return [{ start, text }];
      if (c === "{" || c === '"' || c === "'") {
        const end = c === "{" ? bracketEnd(source, i) : source.indexOf(c, i + 1);
        if (end < 0) return [];
        text += c + source.slice(i + 1, end).replace(/[^\n]/g, " ") + source[end];
        i = end;
      } else text += c;
    }
    return [];
  });

/** A lowercase on* on an element: in 2.0 an attribute holding the function's text, no handler */
const handlerRules = (source: string): Finding[] =>
  elementTags(source).flatMap(({ start, text }) =>
    [...text.matchAll(/\son[a-z]+\s*=\s*\{/g)].map((match) => ({
      line: lineOf(source, start + (match.index ?? 0) + 1),
      rule: "lowercase on* on an element is an attribute in 2.0: use camelCase (onClick)",
    })),
  );

export const solid2Findings = (source: string): Finding[] => {
  const imported = importedFromSolid(source);
  const removed = [...new Map(imported.map((i) => [i.name, i])).values()]
    .filter(({ name }) => name in REMOVED)
    .map(({ name, local }) => ({
      line: lineOf(source, source.search(new RegExp(`\\b${escapeRegExp(local)}\\b`))),
      rule: `${name} is gone in Solid 2.0: use ${REMOVED[name]}`,
    }));
  const text = source.split("\n").flatMap((text, i) =>
    TEXT_RULES.filter(({ pattern }) => pattern.test(text)).map(({ rule }) => ({
      line: i + 1,
      rule,
    })),
  );
  return [
    ...removed,
    ...text,
    ...callRules(source, imported),
    ...refRules(source),
    ...handlerRules(source),
  ].sort((a, b) => a.line - b.line);
};
