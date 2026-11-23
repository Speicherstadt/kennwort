/**
 * Files only the owner may read (K-606): folder 0700, file 0600, written whole under a new name and
 * moved into place, so a crash leaves the old file or the new one, never half of one. Reading
 * refuses a file others may read or write, as ssh refuses such a private key, and anything that is
 * not a plain file (a link someone put there).
 */
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export type PrivateRead =
  | { ok: true; value: string | undefined }
  | { ok: false; error: "insecure" | "damaged" };

const isMissing = (error: unknown) => (error as { code?: string }).code === "ENOENT";

/** The file's text; undefined when there is none */
export const readPrivate = (path: string): PrivateRead => {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile()) return { ok: false, error: "damaged" };
    if ((stat.mode & 0o077) !== 0) return { ok: false, error: "insecure" };
    return { ok: true, value: readFileSync(path, "utf8") };
  } catch (error) {
    return isMissing(error) ? { ok: true, value: undefined } : { ok: false, error: "damaged" };
  }
};

/** Written whole or not at all; false when it could not be written */
export const writePrivate = (path: string, text: string): boolean => {
  const folder = dirname(path);
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    chmodSync(folder, 0o700);
    writeFileSync(temporary, text, { mode: 0o600, flag: "wx" });
    renameSync(temporary, path);
    return true;
  } catch {
    rmSync(temporary, { force: true });
    return false;
  }
};

/** Gone; true also when there was none */
export const removePrivate = (path: string): boolean => {
  try {
    rmSync(path, { force: true });
    return true;
  } catch {
    return false;
  }
};
