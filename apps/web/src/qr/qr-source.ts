/**
 * Where a QR code comes from (K-306 part 4b): an image someone chose or pasted, or the frames of
 * a camera, each drawn on a canvas to read its pixels; nothing leaves the device
 */
import type { Pixels } from "./qr.ts";

const pixelsOf = (source: CanvasImageSource, width: number, height: number): Pixels | undefined => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || width === 0 || height === 0) return undefined;
  context.drawImage(source, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
};

/** The pixels of an image file; undefined for a file the browser cannot read as an image */
export const pixelsOfImage = async (file: Blob): Promise<Pixels | undefined> => {
  const bitmap = await createImageBitmap(file).catch(() => undefined);
  if (!bitmap) return undefined;
  const pixels = pixelsOf(bitmap, bitmap.width, bitmap.height);
  bitmap.close();
  return pixels;
};

export const pixelsOfVideo = (video: HTMLVideoElement) =>
  pixelsOf(video, video.videoWidth, video.videoHeight);

export const hasCamera = () =>
  typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";

/** The camera that faces away from the person, as phones have it; any camera on a desktop */
export const openCamera = () =>
  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
    .catch(() => undefined);
