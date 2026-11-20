/** Hands bytes to the browser as a download; nothing leaves the device */
export const saveFile = (
  bytes: Uint8Array,
  name: string,
  type: string,
  doc: Document = document,
) => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const link = doc.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // The click starts the download synchronously; the object URL is not needed afterwards
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
