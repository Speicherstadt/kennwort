// QR codes for the e2e tests (K-306 part 4b): drawn from the module rows in fixtures/qr-codes.json
// (made once with uqr), as a PNG for an upload and as a Y4M video for Chromium's fake camera
import type { Browser } from "@playwright/test";
import codes from "./fixtures/qr-codes.json" with { type: "json" };

export const QR = codes;
const QUIET = 4;

/** A PNG of the code, eight pixels a module, drawn on a canvas in a page of its own */
export const qrPng = async (browser: Browser, rows: string[], scale = 8) => {
  const page = await browser.newPage();
  const size = (rows.length + 2 * QUIET) * scale;
  await page.setContent(`<canvas id="qr" width="${size}" height="${size}"></canvas>`);
  await page.evaluate(
    ({ rows, scale, quiet }) => {
      const canvas = document.getElementById("qr") as HTMLCanvasElement;
      const context = canvas.getContext("2d") as CanvasRenderingContext2D;
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#000";
      rows.forEach((row, y) => {
        [...row].forEach((on, x) => {
          if (on === "1") context.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
        });
      });
    },
    { rows, scale, quiet: QUIET },
  );
  const png = await page.locator("#qr").screenshot();
  await page.close();
  return png;
};

/** A Y4M video (4:2:0, 320 × 240) whose frames show the code, for --use-file-for-fake-video-capture */
export const qrY4m = (rows: string[], frames = 3) => {
  const width = 320;
  const height = 240;
  const scale = Math.floor(200 / (rows.length + 2 * QUIET));
  const left = Math.floor((width - (rows.length + 2 * QUIET) * scale) / 2);
  const top = Math.floor((height - (rows.length + 2 * QUIET) * scale) / 2);
  const luma = Buffer.alloc(width * height, 255);
  rows.forEach((row, y) => {
    [...row].forEach((on, x) => {
      if (on !== "1") return;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++)
          luma[(top + (y + QUIET) * scale + dy) * width + left + (x + QUIET) * scale + dx] = 0;
    });
  });
  const chroma = Buffer.alloc((width / 2) * (height / 2) * 2, 128);
  const frame = Buffer.concat([Buffer.from("FRAME\n"), luma, chroma]);
  const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F30:1 Ip A1:1 C420jpeg\n`);
  return Buffer.concat([header, ...Array.from({ length: frames }, () => frame)]);
};
