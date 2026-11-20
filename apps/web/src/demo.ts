/**
 * The entries the frame shows until it reads the real ones (K-303 to K-306): Weber Haustechnik as
 * in DESIGN.md, Testdaten. Data, not texts: it lives in demo.json, names stay as a company typed them.
 */
import data from "./demo.json";

export type DemoEntry = {
  id: string;
  title: string;
  username: string;
  password: string;
  website: string;
  vault: string;
  favorite: boolean;
  weak: boolean;
  changedAt: number;
  changedBy: string;
  access: string[];
};

export const company: { name: string; user: string } = data.company;
export const vaults: { id: string; name: string }[] = data.vaults;
export const groups: { id: string; name: string; members: number }[] = data.groups;
export const entries: DemoEntry[] = data.entries;

export const vaultName = (id: string) => vaults.find((vault) => vault.id === id)?.name ?? id;
