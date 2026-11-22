/** Test helpers for the CXF parser: a file of one account, its items and fields */
import { parseCxfJson } from "../cxf-json.ts";
import { compact } from "./helpers.ts";

/** A CXF file of one account with these items and collections */
export const file = (items: object[], collections: object[] = [], major = 1) =>
  JSON.stringify({
    version: { major, minor: 0 },
    exporterRpId: "manager.example",
    exporterDisplayName: "Beispiel",
    timestamp: 0,
    accounts: [{ id: "YQ", username: "a", email: "a@b.example", collections, items }],
  });
export const item = (credentials: unknown[], more: object = {}) => ({
  id: "aXRlbQ",
  title: "Eintrag",
  credentials,
  ...more,
});
export const field = (fieldType: string, value: string, label?: string) => ({
  fieldType,
  value,
  label,
});
export const parse = (...items: object[]) => compact(parseCxfJson(file(items)));
