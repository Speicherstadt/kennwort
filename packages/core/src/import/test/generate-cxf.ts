/**
 * Writes fixtures/cxf.json: a Credential Exchange Format export (FIDO Alliance, CXF v1.0 Proposed
 * Standard, structure as in bitwarden/credential-exchange, credential-exchange-format/src) of
 * Weber Haustechnik. The passkeys' private keys are PKCS#8 from node:crypto, so the parser's
 * reading of them is checked against an independent encoder. Run: bun src/import/test/generate-cxf.ts
 */
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";

const b64url = (bytes: Uint8Array | string) =>
  Buffer.from(typeof bytes === "string" ? Buffer.from(bytes) : bytes).toString("base64url");
const pkcs8 = (type: "ec" | "ed25519", namedCurve?: string) =>
  b64url(
    generateKeyPairSync(type as "ec", { namedCurve: namedCurve ?? "" }).privateKey.export({
      type: "pkcs8",
      format: "der",
    }),
  );
const field = (fieldType: string, value: string, label?: string) => ({
  id: b64url(`f-${value}`),
  fieldType,
  value,
  ...(label && { label }),
});
const passkey = (rpId: string, username: string, key: string) => ({
  type: "passkey",
  credentialId: b64url(`cred-${rpId}`),
  rpId,
  username,
  userDisplayName: username,
  userHandle: b64url(`user-${username}`),
  key,
});
const item = (id: string, title: string, credentials: object[], more: object = {}) => ({
  id: b64url(id),
  creationAt: 1_767_225_600,
  modifiedAt: 1_767_225_600,
  title,
  credentials,
  ...more,
});

const items = [
  item(
    "datev",
    "DATEV Unternehmen online",
    [
      {
        type: "basic-auth",
        username: field("string", "anna.weber"),
        password: field("concealed-string", "Kessel-Rohr-Ventil-26"),
      },
      {
        type: "totp",
        secret: "JBSWY3DPEHPK3PXP",
        period: 30,
        digits: 6,
        username: "anna.weber",
        algorithm: "sha1",
        issuer: "DATEV",
      },
      { type: "note", content: field("string", "Mandant 4711\nBerater: Steuerbüro Kranz") },
    ],
    {
      favorite: true,
      tags: ["Steuern"],
      scope: { urls: ["https://www.datev.de"], androidApps: [{ bundleId: "de.datev.uo" }] },
    },
  ),
  item("karte", "Sparkasse Firmenkarte", [
    {
      type: "credit-card",
      number: field("concealed-string", "4111111111111111"),
      fullName: field("string", "Jonas Weber"),
      cardType: field("string", "Visa"),
      verificationNumber: field("concealed-string", "123"),
      pin: field("concealed-string", "4711"),
      expiryDate: field("year-month", "2028-09"),
    },
  ]),
  item("wlan", "Lager-WLAN", [
    {
      type: "wifi",
      ssid: field("string", "Weber-Lager"),
      networkSecurityType: field("wifi-network-security-type", "wpa2-personal"),
      passphrase: field("concealed-string", "Rohr-Zange-Lager-2026"),
      hidden: field("boolean", "false"),
    },
  ]),
  item(
    "portal",
    "Großhandel-Portal",
    [passkey("shop.grosshandel.example", "max@weber-haustechnik.example", pkcs8("ec", "P-256"))],
    { scope: { urls: ["https://shop.grosshandel.example"], androidApps: [] } },
  ),
  item("server", "Server Lager", [
    {
      type: "ssh-key",
      keyType: "ssh-ed25519",
      privateKey: pkcs8("ed25519"),
      keyComment: "sandra@lager",
    },
  ]),
  item("hersteller", "Heizungs-Hersteller", [
    passkey("partner.heizung.example", "sandra", pkcs8("ed25519")),
    {
      type: "basic-auth",
      username: field("string", "sandra"),
      password: field("concealed-string", "Pumpe-Ventil-2026"),
    },
  ]),
  item("berater", "Steuerberater", [passkey("kanzlei.example", "jonas", pkcs8("ec", "P-384"))]),
  item("firma", "Firmendaten", [
    {
      type: "person-name",
      given: field("string", "Jonas"),
      surname: field("string", "Weber"),
    },
    {
      type: "address",
      streetAddress: field("string", "Hafenstraße 12"),
      postalCode: field("string", "20457"),
      city: field("string", "Hamburg"),
      country: field("country-code", "DE"),
      tel: field("string", "+49 40 123456"),
    },
    {
      type: "custom-fields",
      label: "Firma",
      fields: [
        field("string", "DE123456789", "USt-IdNr."),
        field("concealed-string", "998877", "Bank-PIN"),
        field("email", "buero@weber-haustechnik.example", "Kontakt"),
      ],
    },
  ]),
  item("wetter", "Wetter-API", [
    {
      type: "api-key",
      key: field("concealed-string", "wx_live_4711"),
      username: field("string", "weber-haustechnik"),
      keyType: field("string", "Bearer"),
      url: field("string", "https://api.wetter.example"),
      expiryDate: field("date", "2027-06-30"),
    },
  ]),
  item("alarm", "Alarmanlage", [
    {
      type: "basic-auth",
      username: field("string", "lager"),
      password: field("concealed-string", "Alarm-Lager-2026"),
    },
    { type: "totp", secret: "JBSWY3DPEHPK3PXP", period: 30, digits: 10, algorithm: "sha1" },
  ]),
  item("fuehrerschein", "Führerschein Max", [
    {
      type: "drivers-license",
      fullName: field("string", "Max Weber"),
      licenseNumber: field("string", "B072RRE2I55", "Führerscheinnummer"),
      licenseClass: field("string", "B, BE"),
      expiryDate: field("date", "2034-05-31"),
    },
  ]),
  item("ablage", "Ablage", [
    { type: "note", content: field("string", "Verträge liegen im Schrank.") },
    { type: "file", id: b64url("datei"), name: "vertrag.pdf", decryptedSize: 1, integrityHash: "" },
  ]),
];

const header = {
  version: { major: 1, minor: 0 },
  exporterRpId: "manager.example",
  exporterDisplayName: "Beispiel-Manager",
  timestamp: 1_767_225_600,
  accounts: [
    {
      id: b64url("jonas"),
      username: "jonas",
      email: "jonas@weber-haustechnik.example",
      fullName: "Jonas Weber",
      collections: [
        {
          id: b64url("buero"),
          title: "Büro",
          items: [{ item: b64url("datev") }, { item: b64url("ablage") }],
          subCollections: [
            {
              id: b64url("banken"),
              title: "Banken",
              items: [{ item: b64url("karte"), account: b64url("jonas") }],
            },
          ],
        },
        {
          id: b64url("technik"),
          title: "Technik",
          items: [{ item: b64url("wlan") }, { item: b64url("server") }],
        },
      ],
      items,
    },
  ],
};

writeFileSync(
  new URL("../fixtures/cxf.json", import.meta.url),
  `${JSON.stringify(header, null, 2)}\n`,
);
