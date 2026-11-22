/**
 * The file size rule of firsttris/workflows (`bunx checks`, checks.json): a source file past 400
 * lines fails CI. That check cannot run in the agents' sandbox (its package comes from GitHub), so
 * `bun run lint` runs this copy first and the agents see it before they push. Tests are exempt there
 * too.
 */
export const MAX_LINES = 400;

/** Lines as `wc -l` counts them, the way the shared check reports them */
export const lineCount = (text: string) => text.split("\n").length - 1;

const isTest = (path: string) => /\.test\.tsx?$/.test(path);

export const oversized = (files: { path: string; text: string }[]) =>
  files
    .filter((file) => !isTest(file.path))
    .map((file) => ({ path: file.path, lines: lineCount(file.text) }))
    .filter((file) => file.lines > MAX_LINES);
