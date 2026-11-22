/**
 * Bitwarden's password-protected JSON export written with node:crypto, independently of the code
 * under test, so the tests can change one part at a time: PBKDF2-SHA256, HKDF-Expand with "enc"
 * and "mac", EncStrings of type 2 (AES-256-CBC, then HMAC-SHA256 over IV ‖ ciphertext). As in
 * bitwarden/clients base-vault-export.service.ts (buildPasswordExport) and
 * packages/crypto/vectors/generate-bitwarden.py.
 */
import { createCipheriv, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

export type TestKey = { encKey: Buffer; macKey: Buffer };

/** HKDF-Expand (RFC 5869) for one block of SHA-256: HMAC(prk, info ‖ 0x01) */
const expand = (prk: Buffer, info: string) =>
  createHmac("sha256", prk)
    .update(Buffer.concat([Buffer.from(info), Buffer.of(1)]))
    .digest();

export const testKey = (password: string, salt: string, iterations: number): TestKey => {
  const material = pbkdf2Sync(Buffer.from(password), Buffer.from(salt), iterations, 32, "sha256");
  return { encKey: expand(material, "enc"), macKey: expand(material, "mac") };
};

/** An EncString of type 2 of the text */
export const encString = (key: TestKey, plain: string | Buffer, iv = randomBytes(16)) => {
  const cipher = createCipheriv("aes-256-cbc", key.encKey, iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  const mac = createHmac("sha256", key.macKey).update(iv).update(data).digest();
  return `2.${iv.toString("base64")}|${data.toString("base64")}|${mac.toString("base64")}`;
};

export const TEST_PASSWORD = "Weber-Haustechnik-2026";
export const TEST_SALT = "MDEyMzQ1Njc4OTo7PD0+Pw==";
/** The cheapest PBKDF2 Bitwarden imports, so the tests stay quick */
export const TEST_ITERATIONS = 5000;

/** The export's fields; the parts given replace the ones written */
export const protectedExport = (
  plain: string,
  parts: Record<string, unknown> = {},
  password = TEST_PASSWORD,
) => {
  const key = testKey(password, TEST_SALT, TEST_ITERATIONS);
  return {
    encrypted: true,
    passwordProtected: true,
    salt: TEST_SALT,
    kdfType: 0,
    kdfIterations: TEST_ITERATIONS,
    encKeyValidation_DO_NOT_EDIT: encString(key, "4f7e2c0a-9b1d-4e8f-a3c5-6d7e8f9a0b1c"),
    data: encString(key, plain),
    ...parts,
  };
};

/** The export as the bytes of its file */
export const exportBytes = (doc: object) => new TextEncoder().encode(JSON.stringify(doc));
