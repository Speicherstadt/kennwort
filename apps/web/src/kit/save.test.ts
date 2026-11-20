import { afterEach, describe, expect, it, vi } from "vitest";
import { saveFile } from "./save.ts";

afterEach(() => vi.restoreAllMocks());

describe("saveFile", () => {
  it("downloads the bytes under the name and frees the object URL afterwards", async () => {
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return "blob:kit";
    });
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });
    saveFile(new Uint8Array([37, 80, 68, 70]), "kit.pdf", "application/pdf");
    expect(clicked[0]?.download).toBe("kit.pdf");
    expect(clicked[0]?.href).toBe("blob:kit");
    expect(blobs[0]?.type).toBe("application/pdf");
    expect(new Uint8Array(await (blobs[0] as Blob).arrayBuffer())).toEqual(
      new Uint8Array([37, 80, 68, 70]),
    );
    expect(revoke).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(revoke).toHaveBeenCalledWith("blob:kit");
  });
});
