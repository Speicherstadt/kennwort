/**
 * Two rules of the i18n check in firsttris/workflows (`bunx checks`): every message is used by the
 * code, and German and English have the same keys. That check cannot run in the agents' sandbox
 * (its package comes from GitHub), so `bun run lint` runs this copy first.
 */
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The keys no code names as a whole word (`m.key()`, `m["key"]`) */
export const unusedMessages = (keys: readonly string[], code: string) =>
  keys.filter((key) => key !== "$schema" && !new RegExp(`\\b${escapeRegExp(key)}\\b`).test(code));

/** The keys that only one of the two languages has, sorted */
export const missingKeys = (de: Record<string, unknown>, en: Record<string, unknown>) => {
  const inDe = new Set(Object.keys(de));
  const inEn = new Set(Object.keys(en));
  return [...inDe, ...inEn].filter((key) => !(inDe.has(key) && inEn.has(key))).sort();
};
