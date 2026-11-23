/**
 * The security headers of every answer from Kennwort's origin (docs/sicherheitsdesign.md, P-16,
 * "CSP und Sicherheits-Kopfzeilen"):
 * the server sends them with the web app's files and with its own answers, and the service worker
 * puts them on the verified files it serves from its caches (P-16), whose stored copies carry no
 * headers of the network. One table, so the server and the worker cannot drift apart.
 */
export type Transport = {
  secure: boolean;
};
/** upgrade-insecure-requests only behind https: over http on localhost it would break every load */
export declare const appPolicy: ({ secure }: Transport) => string;
/** The server's own answers (JSON, redirects): opened as a page they run nothing, in a sandbox */
export declare const API_POLICY = "default-src 'none'; frame-ancestors 'none'; sandbox";
export declare const PERMISSIONS_POLICY: string;
/** A year, without includeSubDomains: other hosts under the operator's domain may lack https */
export declare const HSTS = "max-age=31536000";
/**
 * The web app's files. HSTS only behind https, and never from the service worker: browsers take
 * it only from the network.
 */
export declare const appHeaders: ({
  secure,
  hsts,
}: Transport & {
  hsts?: boolean;
}) => Record<string, string>;
/** The server's own answers */
export declare const apiHeaders: ({ secure }: Transport) => Record<string, string>;
