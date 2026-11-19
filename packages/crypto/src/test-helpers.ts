// Shared by the tests of packages/crypto (excluded from the mutation run)
export const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");
export const fromHex = (text: string): Uint8Array => Uint8Array.from(Buffer.from(text, "hex"));
