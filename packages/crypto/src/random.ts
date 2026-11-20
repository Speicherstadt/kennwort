// Random bytes from the platform's CSPRNG (crypto.getRandomValues) through @noble/hashes, so the
// other packages need no @noble import of their own
export { randomBytes } from "@noble/hashes/utils.js";
