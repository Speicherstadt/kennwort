/** Days for a time limit (K-305): picked as a date on this device, kept as Unix seconds */
import { getLocale } from "@kennwort/ui";

/** Today on this device as yyyy-mm-dd, the earliest day a time limit can end */
export const today = () => {
  const now = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
};

/** The end of the chosen day on this device, in Unix seconds; no day: no end (0) */
export const endOfDay = (day: string) => {
  if (!day) return 0;
  const end = new Date(`${day}T23:59:59`).getTime();
  return Number.isNaN(end) ? 0 : Math.floor(end / 1000);
};

export const dateText = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString(getLocale(), { dateStyle: "medium" });
