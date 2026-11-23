/**
 * This server's version, the version of the release it comes from: the update notice (K-703)
 * compares it with the newest release. Read from the root package.json, the one place the bump
 * workflow raises and the release workflow checks against the tag.
 */
import rootPackage from "../../../package.json" with { type: "json" };

export const SERVER_VERSION: string = rootPackage.version;
