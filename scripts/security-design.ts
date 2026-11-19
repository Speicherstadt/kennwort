/**
 * Reads the security design and the project plan as data, so a test can hold them in step: every
 * threat and crypto rule of the plan has a protocol, every protocol names the attacks it stops.
 */

/** The lines of a Markdown section, from its heading to the next heading of the same level */
export const section = (markdown: string, heading: string): string[] => {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return [];
  const level = heading.split(" ")[0] ?? "";
  const end = lines.findIndex(
    (line, index) => index > start && line.startsWith(`${level} `) && !line.startsWith(`${level}#`),
  );
  return lines.slice(start + 1, end === -1 ? undefined : end);
};

/** The cells of the given column of every body row of the first table in the lines */
export const tableColumn = (lines: string[], column = 0): string[] => {
  const start = lines.findIndex((line) => line.startsWith("|"));
  if (start === -1) return [];
  const end = lines.findIndex((line, index) => index > start && !line.startsWith("|"));
  return lines
    .slice(start + 2, end === -1 ? undefined : end)
    .map((line) => line.split("|").map((cell) => cell.trim())[column + 1] ?? "")
    .map((cell) => cell.replace(/\*\*/g, ""));
};

/** The name of each bullet of the plan's crypto rules: its bold start, or the text up to a comma */
export const ruleNames = (lines: string[]): string[] =>
  lines
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2))
    .map((text) => text.match(/^\*\*(.+?)\*\*/)?.[1] ?? text.split(",")[0] ?? "")
    .map((name) => name.trim());

export type Protocol = { id: string; stops: string[] };

/** Every `### P-xx` section with the attacks of its "Wehrt ab" line */
export const protocols = (markdown: string): Protocol[] =>
  markdown
    .split(/^### /m)
    .filter((part) => /^P-\d+/.test(part))
    .map((part) => ({
      id: part.match(/^(P-\d+)/)?.[1] ?? "",
      stops: (part.match(/^\*\*Wehrt ab:\*\* (.+)$/m)?.[1] ?? "").match(/E-\d+/g) ?? [],
    }));
