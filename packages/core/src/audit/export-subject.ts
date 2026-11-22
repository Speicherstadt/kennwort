/**
 * The subject of an `export` audit event (K-504, P-19, P-20): what was exported and in which
 * format, plus an ID the client picks once, so the signed event says who (the actor), what and
 * when (the server's time) without a new field in the chain:
 *
 *   subject = <format> "/" ("all" | "vault:" vault-ID) "/" export-ID     (IDs: 16 bytes, base64url)
 *
 * The server reads it to let only owners and admins export; every check of the chain still
 * verifies the client's signature over it (chain.ts).
 */
export const EXPORT_FORMATS = ["kennwort-json", "csv", "kdbx"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
/** Every vault the device opens, or one vault by its ID in base64url */
export type ExportScope = { kind: "all" } | { kind: "vault"; vaultId: string };
export type ExportSubject = { format: ExportFormat; scope: ExportScope; id: string };

/** 16 bytes in base64url without padding */
const ID = "[A-Za-z0-9_-]{21}[AQgw]";
const SUBJECT = new RegExp(`^(${EXPORT_FORMATS.join("|")})/(all|vault:(${ID}))/(${ID})$`);

export const exportSubject = ({ format, scope, id }: ExportSubject): string =>
  `${format}/${scope.kind === "all" ? "all" : `vault:${scope.vaultId}`}/${id}`;

/** The parts of a subject, or undefined for one no client of this version writes */
export const parseExportSubject = (subject: string): ExportSubject | undefined => {
  const match = SUBJECT.exec(subject);
  if (!match) return undefined;
  const [, format, , vaultId, id] = match as unknown as [
    string,
    ExportFormat,
    string,
    string | undefined,
    string,
  ];
  return { format, scope: vaultId ? { kind: "vault", vaultId } : { kind: "all" }, id };
};
