/**
 * The recovery kit as a printable page (P-12): server address, account ID, Secret Key and Recovery
 * Key, and a QR code that signs a new device in. The QR code holds address, account ID and Secret
 * Key only, never the Recovery Key, and puts them in the link's fragment, which no server sees.
 */
import { encode } from "uqr";
import { A4, type Mark, pdfDocument } from "./pdf.ts";

export type KitTexts = {
  title: string;
  intro: string;
  server: string;
  account: string;
  secretKey: string;
  recoveryKey: string;
  created: string;
  qr: string;
  keep: string;
};

export type KitContent = {
  server: string;
  accountId: string;
  secretKey: string;
  recoveryKey: string;
  created: string;
  texts: KitTexts;
};

const MARGIN = 56;
const QR_SIZE = 150;

/** The link the QR code opens: the unlock page of this server, prefilled from the fragment */
export const deviceLink = (server: string, accountId: string, secretKey: string) =>
  `${server.replace(/\/+$/, "")}/unlock#${new URLSearchParams({ account: accountId, secret: secretKey })}`;

/** Breaks text into lines of at most `width` characters at spaces (Helvetica, roughly) */
export const wrap = (text: string, width: number) => {
  const lines: string[] = [];
  for (const word of text.split(" ")) {
    const last = lines.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= width)
      lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
};

const paragraph = (text: string, top: number, size: number): Mark[] =>
  wrap(text, Math.floor((A4.width - 2 * MARGIN) / (size * 0.5))).map((line, index) => ({
    kind: "text",
    x: MARGIN,
    y: top - index * size * 1.4,
    size,
    font: "sans",
    text: line,
  }));

const field = (label: string, value: string, top: number): Mark[] => [
  { kind: "text", x: MARGIN, y: top, size: 9, font: "sans-bold", text: label },
  { kind: "text", x: MARGIN, y: top - 17, size: 12, font: "mono", text: value },
];

/** Dark modules as one rectangle per run in a row: fewer marks, no seams between neighbours */
export const qrMarks = (text: string, x: number, top: number, size: number): Mark[] => {
  const qr = encode(text, { ecc: "M", border: 2 });
  const module = size / qr.size;
  return qr.data.flatMap((row, r) =>
    runs(row).map(
      ([start, length]): Mark => ({
        kind: "rect",
        x: x + start * module,
        y: top - (r + 1) * module,
        width: length * module,
        height: module,
        gray: 0,
      }),
    ),
  );
};

/** [start, length] of each run of dark modules */
export const runs = (row: readonly boolean[]) => {
  const found: [number, number][] = [];
  row.forEach((dark, index) => {
    if (!dark) return;
    const last = found.at(-1);
    if (last && last[0] + last[1] === index) last[1] += 1;
    else found.push([index, 1]);
  });
  return found;
};

export const kitMarks = (kit: KitContent): Mark[] => {
  const { texts } = kit;
  const top = A4.height - MARGIN;
  const intro = paragraph(texts.intro, top - 40, 10);
  const fieldsTop = (intro.at(-1)?.y ?? top) - 40;
  const fields = [
    [texts.server, kit.server],
    [texts.account, kit.accountId],
    [texts.secretKey, kit.secretKey],
    [texts.recoveryKey, kit.recoveryKey],
    [texts.created, kit.created],
  ].flatMap(([label = "", value = ""], index) => field(label, value, fieldsTop - index * 46));
  const qrTop = fieldsTop - 5 * 46 - 10;
  return [
    { kind: "text", x: MARGIN, y: top, size: 22, font: "sans-bold", text: texts.title },
    ...intro,
    ...fields,
    ...qrMarks(deviceLink(kit.server, kit.accountId, kit.secretKey), MARGIN, qrTop, QR_SIZE),
    ...paragraph(texts.qr, qrTop - QR_SIZE - 18, 9),
    ...paragraph(texts.keep, MARGIN + 40, 9),
  ];
};

export const kitPdf = (kit: KitContent) => pdfDocument(kitMarks(kit), kit.texts.title);
