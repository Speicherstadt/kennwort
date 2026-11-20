/**
 * KeePass as CSV. KeePassXC (Database → Export → CSV) writes `Group,Title,Username,Password,URL,
 * Notes,TOTP,Icon,Last Modified,Created`, every cell quoted, the group as the path from the root
 * group down (`Root/Banking`); source: keepassxreboot/keepassxc, src/format/CsvExporter.cpp. The
 * root's name is left out of the folder, and the recycle bin (`Recycle Bin`, in German KeePassXC
 * `Papierkorb`) stays out. KeePass 2 writes the KeePass 1.x layout `Account,Login Name,Password,
 * Web Site,Comments`.
 */
import { tableParser } from "./table.ts";

const RECYCLE_BINS = new Set(["Recycle Bin", "Papierkorb"]);

/** The path below the root group */
const belowRoot = (path: string) => path.split("/").slice(1);

export const parseKeePassXcCsv = tableParser({
  columns: {
    folder: "Group",
    title: "Title",
    username: "Username",
    password: "Password",
    url: "URL",
    notes: "Notes",
    totp: "TOTP",
  },
  required: ["Group", "Title", "Username", "Password", "URL", "Notes"],
  folder: (path) => belowRoot(path).join("/"),
  skip: (row) => RECYCLE_BINS.has(`${belowRoot(row("Group"))[0]}`),
});

export const parseKeePassCsv = tableParser({
  columns: {
    title: "Account",
    username: "Login Name",
    password: "Password",
    url: "Web Site",
    notes: "Comments",
  },
  required: ["Account", "Login Name", "Password", "Web Site", "Comments"],
});
