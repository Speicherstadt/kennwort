// Weber Haustechnik's vaults as an export holds them (K-504), shared by the export's tests
import type { ExportVault } from "../payload.ts";

export const BUERO: ExportVault = {
  name: "Büro",
  entries: [
    {
      type: "login",
      title: "Online-Banking Sparkasse",
      fields: [
        { id: "username", name: "Benutzername", value: "jonas.weber", kind: "text" },
        { id: "password", name: "Passwort", value: "Sp@rkasse-2026!", kind: "secret" },
        { id: "website", name: "Website", value: "https://banking.sparkasse.example", kind: "url" },
        { id: "website-2", name: "Website", value: "https://app.sparkasse.example", kind: "url" },
        {
          id: "totp",
          name: "Einmalcode",
          value: "otpauth://totp/Sparkasse:jonas?secret=JBSWY3DPEHPK3PXP&issuer=Sparkasse",
          kind: "totp",
        },
        { id: "field-1", name: "Kundennummer", value: "7788-1", kind: "text" },
        { id: "field-2", name: "PIN", value: "4711", kind: "secret" },
        {
          id: "note",
          name: "Notizen",
          value: 'TAN per App\nKontakt: Filiale "Mitte"',
          kind: "note",
        },
      ],
      tags: ["Bank", "Büro"],
      favorite: true,
      history: [
        { fieldId: "password", value: "Sp@rkasse-2025!", replacedAt: 1_760_000_000 },
        { fieldId: "password", value: "Sp@rkasse-2024!", replacedAt: 1_730_000_000 },
        { fieldId: "title", value: "Sparkasse", replacedAt: 1_700_000_000 },
      ],
    },
    {
      type: "note",
      title: "Alarmanlage Lager",
      fields: [
        {
          id: "note",
          name: "Notiz",
          value: "Code 2580, Ändern nach Personalwechsel",
          kind: "note",
        },
      ],
      tags: [],
      favorite: false,
      history: [],
    },
  ],
};

export const TECHNIK: ExportVault = {
  name: "Technik",
  entries: [
    {
      type: "wifi",
      title: "Werkstatt-WLAN",
      fields: [
        { id: "ssid", name: "SSID", value: "Weber-Werkstatt", kind: "text" },
        { id: "password", name: "Passwort", value: "Kupfer & <Rohr> 18", kind: "secret" },
        { id: "security", name: "Sicherheit", value: "WPA3", kind: "text" },
      ],
      tags: ["Netz"],
      favorite: false,
      history: [],
    },
    {
      type: "ssh-key",
      title: "Fernwartung Wärmepumpe",
      fields: [
        {
          id: "private-key",
          name: "Privater Schlüssel",
          value:
            "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjE=\n-----END OPENSSH PRIVATE KEY-----",
          kind: "secret",
        },
        { id: "passphrase", name: "Passphrase", value: "Wärme: Pumpe", kind: "secret" },
      ],
      tags: [],
      favorite: false,
      history: [],
    },
  ],
};

export const WEBER: ExportVault[] = [BUERO, TECHNIK];

/** Jonas's passkey for the wholesaler's shop (K-406), as the extension stores it */
export const PASSKEY_ENTRY: ExportVault["entries"][number] = {
  type: "passkey",
  title: "Großhandel Shop",
  fields: [
    { id: "rp-id", name: "rp-id", value: "shop.grosshandel.example", kind: "text" },
    { id: "username", name: "username", value: "jonas.weber", kind: "text" },
    { id: "display-name", name: "display-name", value: "Jonas Weber", kind: "text" },
    { id: "user-handle", name: "user-handle", value: "dXNlci1qb25hcw", kind: "text" },
    { id: "credential-id", name: "credential-id", value: "AAECAwQFBgcICQoLDA0ODw", kind: "text" },
    {
      id: "private-key",
      name: "private-key",
      value: "AVBhc3NrZXktUHJpdmF0ZS1LZXktV2ViZXI",
      kind: "secret",
    },
    { id: "counter", name: "counter", value: "0", kind: "text" },
  ],
  tags: [],
  favorite: false,
  history: [],
};
