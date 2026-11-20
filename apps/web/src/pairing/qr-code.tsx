/** A QR code drawn as an SVG path, dark on light whatever the theme, so every camera reads it */
import { qrPath } from "./qr.ts";

export const QrCode = (props: { text: string; label: string }) => {
  const qr = () => qrPath(props.text);
  return (
    <svg
      role="img"
      aria-label={props.label}
      viewBox={`0 0 ${qr().size} ${qr().size}`}
      class="size-56 rounded-lg bg-white"
      shape-rendering="crispEdges"
    >
      <path d={qr().d} fill="#000" />
    </svg>
  );
};
