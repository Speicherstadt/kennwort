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
    pattern: /<[a-z][\w-]*\b[^>]*\son[a-z]+\s*=\s*\{/,
    rule: "lowercase on* on an element is an attribute in 2.0: use camelCase (onClick)",
  },
  {
    pattern: /\/\*\s*@once\s*\*\//,
    rule: "/*@once*/ is gone: use untrack for a deliberate one-time read",
  },
];

const importedFromSolid = (source: string): Set<string> => {
  const names = new Set<string>();
  for (const match of source.matchAll(
    /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g,
  )) {
    if (!SOLID_MODULES.has(match[2] as string)) continue;
    for (const part of (match[1] as string).split(",")) {
      const name = part
        .replace(/^\s*type\s+/, "")
        .split(/\s+as\s+/)[0]
        ?.trim();
      if (name) names.add(name);
    }
  }
  return names;
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

/** createEffect with one function (1.x) and createMemo/createEffect with an initial value */
const callRules = (source: string, imported: Set<string>): Finding[] => {
  const findings: Finding[] = [];
  for (const match of source.matchAll(
    /\b(createEffect|createMemo|createRenderEffect)\s*(<[^(]*>)?\(/g,
  )) {
    const name = match[1] as string;
    if (!imported.has(name)) continue;
    const args = callArguments(source, (match.index ?? 0) + match[0].length - 1);
    const line = lineOf(source, match.index ?? 0);
    if (name !== "createMemo" && args.length === 1)
      findings.push({
        line,
        rule: `${name} with one function (1.x): split it into compute and apply`,
      });
    const second = name === "createMemo" ? args[1] : undefined;
    if (second !== undefined && !second.trim().startsWith("{"))
      findings.push({
        line,
        rule: "createMemo's second argument is options now, not an initial value",
      });
  }
  return findings;
};

/** onCleanup inside a ref callback: refs are unowned in 2.0, the cleanup never runs */
const refRules = (source: string): Finding[] =>
  [...source.matchAll(/ref=\{\s*\(?\s*\w*\s*\)?\s*=>\s*\{/g)].flatMap((match) => {
    const open = (match.index ?? 0) + match[0].length - 1;
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

export const solid2Findings = (source: string): Finding[] => {
  const imported = importedFromSolid(source);
  const removed = [...imported]
    .filter((name) => name in REMOVED)
    .map((name) => ({
      line: lineOf(source, source.search(new RegExp(`\\b${name}\\b`))),
      rule: `${name} is gone in Solid 2.0: use ${REMOVED[name]}`,
    }));
  const text = source.split("\n").flatMap((text, i) =>
    TEXT_RULES.filter(({ pattern }) => pattern.test(text)).map(({ rule }) => ({
      line: i + 1,
      rule,
    })),
  );
  return [...removed, ...text, ...callRules(source, imported), ...refRules(source)].sort(
    (a, b) => a.line - b.line,
  );
};
