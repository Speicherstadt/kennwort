---
title: Anmeldedienst und Deep Links
description: >-
  Kennwort mit einem vorhandenen Anmeldedienst verbinden (OpenID Connect): Keycloak, Authentik,
  Entra ID. Neue Personen aufnehmen, Gruppen übernehmen, warum der Anmeldedienst nie einen Schlüssel
  bekommt – und wie andere Apps per Deep Link auf Tresore und Einträge verweisen.
---

# Anmeldedienst und Deep Links

Hat deine Firma schon einen Anmeldedienst – Keycloak, Authentik, Entra ID oder in der
Speicherstadt-Suite Kontext –, kann Kennwort ihn nutzen. Das ist ein Zusatz: Kennwort hat weiter
eigene Konten mit Passphrase, Secret Key und Passkey.

## Was der Anmeldedienst darf – und was nicht

Kennwort verschlüsselt Ende-zu-Ende. Daran ändert der Anmeldedienst nichts:

- Er bestätigt nur, **wer** sich anmeldet, und meldet die **Gruppen** der Person.
- Er bekommt nie einen Schlüssel und gibt nie einen heraus. Entsperrt wird immer mit deiner
  Passphrase und deinem Secret Key, die der Anmeldedienst nie sieht.
- Meldest du dich über ihn an, obwohl du schon ein Konto hast, gibt er dir **keine Sitzung**: Du
  landest beim Entsperren und meldest dich wie immer an. Auch ein gekaperter Anmeldedienst kommt so
  weder an Geheimtexte noch an Admin-Rechte in Kennwort.
- Eine neue Person bekommt über ihn nur ein Konto **ohne Tresor**. Erst wenn eine Inhaberin oder
  ein Admin den Code ihrer Schlüssel mit ihr verglichen hat, ist sie bestätigt.
- Eine neue Gruppe beim Anmeldedienst ist in Kennwort nur eine **Zugriffsanfrage**. Zugriff gibt
  erst ein Verwalter des Tresors.

Wie das im Einzelnen geschützt ist, steht im [Sicherheitsdesign](sicherheitsdesign.md#p-25-anmeldung-uber-openid-connect-und-gruppen).

## Für alle: Konto verknüpfen

Unter **Einstellungen → Anmeldedienst** verknüpfst du dein Konto mit deiner Anmeldung beim
Anmeldedienst. Danach folgen deine Gruppen in Kennwort denen beim Anmeldedienst, jedes Mal, wenn du
dich über **Mit … anmelden** anmeldest. Kennwort erkennt dich am festen Kennzeichen des
Anmeldedienstes (`sub`), nie an deiner Mail-Adresse.

## Neue Personen aufnehmen

1. Eine Inhaberin oder ein Admin schaltet unter **Einstellungen → Anmeldedienst** „Neue Personen
   über … aufnehmen“ ein und gibt den **Link zum Beitreten** weiter.
2. Die neue Person öffnet den Link, meldet sich beim Anmeldedienst an, legt ihre Passphrase fest
   und sichert ihr Recovery-Kit – wie bei einer Einladung.
3. Danach zeigt Kennwort ihr zwei Codes: **Dein Code** und den **Code der Firma**. Sie findet beide
   später unter **Mitglieder → Dein Code**.
4. In der Mitgliederliste steht sie mit „Code vergleichen“. Die Inhaberin oder der Admin öffnet das,
   liest den Code der Firma vor und vergleicht den Code der Person, am besten persönlich oder am
   Telefon. Stimmt jede Ziffer, bestätigt sie mit **Code stimmt**.

Bis dahin hat die neue Person keinen Tresor der Firma und kann keinen bekommen. Ein Konto, das
jemand anderes untergeschoben hat, hätte einen anderen Code.

## Gruppen

Eine Gruppe in Kennwort folgt der Gruppe **gleichen Namens** beim Anmeldedienst (ein führender
Schrägstrich, wie ihn Keycloak schreibt, zählt nicht). Unter **Einstellungen → Anmeldedienst**
sehen Inhaber und Admins, aus welchem Claim die Gruppen kommen und wie viele Personen über den
Anmeldedienst in jeder Gruppe sind.

- Kommt jemand beim Anmeldedienst in eine Gruppe, die mit einem Tresor verknüpft ist, bekommt der
  Verwalter des Tresors eine **Zugriffsanfrage** und eine Mitteilung. Er gibt sie frei oder lehnt
  sie ab.
- Verlässt jemand die Gruppe beim Anmeldedienst, fällt eine offene Anfrage weg. Ist die Person
  schon im Tresor, bekommt der Verwalter eine Mitteilung und entfernt sie dort selbst – mit dem
  Schlüsselwechsel, den nur sein Gerät machen kann.
- Gruppen, die ein Admin in Kennwort von Hand vergeben hat, ändert der Anmeldedienst nicht – auch
  dann nicht, wenn die Person schon über den Anmeldedienst in der Gruppe war.

Kennwort gleicht die Gruppen bei jeder Anmeldung über den Anmeldedienst ab. Wer beim Anmeldedienst
gesperrt wird, kommt mit Passphrase weiter in Kennwort: Entferne die Person unter **Mitglieder**
aus der Firma.

## Für Betreiber: Einstellungen

Den Anmeldedienst stellt der Betreiber des Servers ein:

| Einstellung | Bedeutung |
| --- | --- |
| `KENNWORT_OIDC_ISSUER` | Adresse des Anmeldedienstes (Issuer), mit `https://`; ohne sie ist die Anmeldung über OpenID Connect aus |
| `KENNWORT_OIDC_CLIENT_ID` | Client-ID, die du beim Anmeldedienst angelegt hast |
| `KENNWORT_OIDC_CLIENT_SECRET` | Client-Geheimnis (vertraulicher Client); ohne es meldet sich Kennwort als öffentlicher Client mit PKCE an |
| `KENNWORT_OIDC_SCOPES` | Scopes, Vorgabe `openid profile`; muss `openid` enthalten, für Gruppen oft zusätzlich `groups` |
| `KENNWORT_OIDC_GROUPS_CLAIM` | Name des Claims mit den Gruppen im ID-Token, Vorgabe `groups` |
| `KENNWORT_OIDC_NAME` | Beschriftung des Knopfs „Mit … anmelden“, Vorgabe „OpenID Connect“ |

Beim Anmeldedienst legst du einen Client vom Typ „Authorization Code“ an, mit der
Weiterleitungsadresse `https://<deine Kennwort-Adresse>/auth/oidc/callback` (aus
`KENNWORT_PUBLIC_URL`). Kennwort verlangt PKCE (S256) und ein signiertes ID-Token (RS256, PS256,
ES256 oder EdDSA). Das Client-Geheimnis steht nie im Log und geht nie an einen Browser.

### Keycloak

- Client anlegen: *Client authentication* an, *Standard flow* an, *Valid redirect URIs* wie oben,
  unter *Advanced* „Proof Key for Code Exchange Code Challenge Method“ auf `S256`.
- Gruppen: unter *Client scopes → <client>-dedicated → Add mapper → Group Membership*, Token Claim
  Name `groups`, *Full group path* an oder aus (Kennwort entfernt den führenden Schrägstrich), *Add
  to ID token* an.
- `KENNWORT_OIDC_ISSUER=https://sso.example.de/realms/<realm>`

### Authentik

- *Applications → Providers → OAuth2/OpenID Provider*, *Client type* „Confidential“, Redirect URI
  wie oben, Signierschlüssel auswählen (sonst signiert Authentik mit HS256, das Kennwort ablehnt).
- Der Scope `profile` enthält bei Authentik schon den Claim `groups`.
- `KENNWORT_OIDC_ISSUER=https://auth.example.de/application/o/<slug>/` (mit Schrägstrich am Ende,
  genau wie in der Discovery).

### Microsoft Entra ID

- *App registrations → New registration*, Plattform „Web“, Redirect URI wie oben; unter
  *Certificates & secrets* ein Client-Geheimnis.
- Gruppen: *Token configuration → Add groups claim*, „Security groups“, im ID-Token. Entra ID
  schickt die **Objekt-IDs** der Gruppen, keine Namen: Benenne die Gruppen in Kennwort mit diesen
  IDs oder wähle unter „Group claims“ das Format `sAMAccountName` für synchronisierte Gruppen.
- `KENNWORT_OIDC_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0`

## Deep Links

Andere Apps können auf einen Tresor oder Eintrag verweisen, nur über seine ID:

- `https://<deine Kennwort-Adresse>/vaults/<tresor-id>` und `/vaults/<tresor-id>/<eintrag-id>`
- `web+kennwort://vault/<tresor-id>/entry/<eintrag-id>` öffnet die installierte Web-App;
  `web+kennwort://entry/<eintrag-id>` geht auch.

Ein Link trägt nie ein Geheimnis und öffnet nichts von selbst: Ist Kennwort gesperrt, kommt zuerst
das Entsperren, und danach siehst du nur, was du ohnehin lesen darfst.

## Noch nicht da

**SCIM** zum Anlegen und Entfernen von Konten aus dem Anmeldedienst ist zurückgestellt. Kennwort
könnte ein Konto ohnehin nicht selbst entfernen, denn den Schlüsselwechsel macht das Gerät eines
Admins.
