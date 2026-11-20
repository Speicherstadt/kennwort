/**
 * Reading a QR code (K-306 part 4b): the setup QR code of a one-time code, from a camera frame or
 * an image, through jsQR, which is loaded only when someone scans
 */
export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

let decoder: Promise<typeof import("jsqr").default> | undefined;
const loadDecoder = () => {
  decoder ??= import("jsqr").then((module) => module.default);
  return decoder;
};

/** The text of the QR code in the pixels, if there is one; light on dark codes too */
export const readQr = async (pixels: Pixels): Promise<string | undefined> => {
  const decode = await loadDecoder();
  return decode(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" })
    ?.data;
};
