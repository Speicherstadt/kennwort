---
title: Mitteilungen
description: >-
  Wie Kennwort dir Bescheid sagt, wenn etwas zu tun ist: die Glocke in der App, Push-Mitteilungen
  aufs Handy oder den Rechner, welche Arten du bekommst – und was Server und Push-Dienste dabei
  sehen. Für Betreiber: VAPID und die Einstellungen des Servers.
---

# Mitteilungen

Kennwort sagt dir Bescheid, wenn jemand auf dich wartet: Anna bittet um Zugriff auf einen Tresor,
eine Einladung wurde angenommen, jemand möchte Notfallzugriff auf dein Konto oder einer deiner
Einmal-Links wurde abgerufen.

## In der App

Die **Glocke** steht am Rechner in der Leiste links, am Handy als fünfter Reiter unten. Die Zahl an
ihr sagt, wie viele Mitteilungen du noch nicht gelesen hast. Neue kommen sofort, solange die App
offen ist.

Unter **Mitteilungen** steht jede mit Datum. Ein Tipp auf den Text führt dorthin, wo du etwas tun
kannst – zur Mitgliederliste, zu den Tresoren, zum Notfallzugriff – und zählt die Mitteilung als
gelesen. **Gelesen** und **Alle gelesen** tun das, ohne die Seite zu wechseln; der Papierkorb
löscht eine Mitteilung. Kennwort hebt für jedes Konto die neuesten 200 auf.

| Mitteilung | Bekommst du, wenn … |
| --- | --- |
| „Anna bittet um Zugriff auf Büro.“ | du einen Tresor verwaltest und jemand Zugriff anfragt |
| „Jonas hat dich in Büro aufgenommen.“ | ein Verwalter dich in einen Tresor aufnimmt |
| „Jonas hat einen Eintrag mit dir geteilt.“ | dir jemand einen einzelnen Eintrag teilt |
| „Anna hat deine Einladung angenommen.“ | jemand deine Einladung annimmt – vergleiche den Code und bestätige die Person |
| „Anna hat neue Schlüssel.“ | du Inhaber oder Admin bist und jemand neue Schlüssel erstellt hat |
| „Jonas hat den Firmenschlüssel gewechselt.“ | der Inhaber den Firmenschlüssel wechselt – bestätige den Wechsel |
| „Anna bittet um Notfallzugriff.“ | jemand, dem du Notfallzugriff gegeben hast, ihn anfragt – widersprich in der Wartezeit, wenn du das nicht willst |
| „Jonas hat auf deine Bitte um Notfallzugriff geantwortet.“ / „… hat dir Notfallzugriff gegeben.“ | du Vertrauensperson bist |
| „Jonas hat dein Konto auf einem neuen Gerät wiederhergestellt.“ | ein Inhaber dein Konto über die Firmen-Recovery wiederherstellt |
| „Einer deiner Einmal-Links wurde abgerufen.“ | jemand einen deiner Einmal-Links öffnet |
| „Sandra hat sich über den Anmeldedienst angemeldet und wartet auf den Code-Vergleich.“ | du Inhaber oder Admin bist und jemand über den [Anmeldedienst](anmeldedienst.md) beigetreten ist |
| „Eine neuere Version von Kennwort ist erschienen. …“ | du Inhaber oder Admin bist und ein neues Release erschienen ist; einmal je Release, abschaltbar für den ganzen Server ([Updates](updates.md)) |

Die Namen setzt deine App selbst ein, aus dem, was sie geprüft hat; der Server schickt nur IDs.
Kennt sie jemanden noch nicht, steht dort „Jemand“.

Eine Mitteilung ist ein Hinweis, kein Beweis: Kennwort prüft, was sie nennt, erst dort, wo du es
öffnest – genau wie ohne Mitteilung.

## Push-Mitteilungen

Unter **Mitteilungen → Push-Mitteilungen auf diesem Gerät** schaltest du Push für das Gerät ein, das
du gerade benutzt. Erst dann fragt der Browser, ob Kennwort dir Mitteilungen schicken darf. Am
iPhone geht das, wenn du Kennwort zum Home-Bildschirm hinzugefügt hast.

Eine Push-Mitteilung sagt immer nur **„Neue Mitteilung in Kennwort“**. Was passiert ist, siehst du
erst, wenn du die App öffnest und entsperrst. Darunter wählst du, welche Arten als Push kommen; in
der App erscheinen immer alle.

**Ausschalten** geht dort ebenso; beim Abmelden eines Geräts endet sein Push von selbst.

## Was Server und Push-Dienste sehen

- **Der Server** speichert je Mitteilung die Art, IDs (Tresor, Eintrag, Konto, Link), die Zeit und
  ob du sie gelesen hast – keine Namen von Tresoren oder Einträgen, die kennt er ohnehin nicht.
- **Der Push-Dienst deines Browsers** (Google bei Chrome und Android, Mozilla bei Firefox, Apple bei
  Safari, Microsoft bei Edge) bekommt einen leeren Push. Er sieht, dass und wann Kennwort deinem
  Gerät etwas schickt, aber nicht, was, von wem oder zu welchem Tresor.

Einzelheiten stehen im [Sicherheitsdesign, P-24](sicherheitsdesign.md#p-24-mitteilungen-und-web-push).

## Mail

Mitteilungen per Mail gibt es noch nicht. Kennwort kennt keine Mail-Adressen; sie kämen als neue
persönliche Daten dazu. Das ist für später vorgemerkt.

## Für Betreiber

Push braucht nichts weiter: Beim ersten Start erzeugt der Server seinen **VAPID-Schlüssel**
(RFC 8292) und legt ihn in seiner Datenbank ab. Er sagt den Push-Diensten, welcher Server schickt;
er öffnet nichts. Wer die Datenbank sichert, sichert ihn mit; geht er verloren, schalten die Geräte
Push einmal neu ein.

Der Server muss die Push-Dienste über HTTPS erreichen können (ausgehend, Port 443).

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `KENNWORT_PUSH` | `true` | `false` schaltet Push ab; Mitteilungen in der App bleiben |
| `KENNWORT_PUSH_SUBJECT` | `KENNWORT_PUBLIC_URL` | Kontakt für die Push-Dienste, `mailto:it@firma.example` oder eine `https://`-Adresse |
| `KENNWORT_PUSH_HOSTS` | – | weitere Push-Dienste neben denen der üblichen Browser, Host-Namen mit Komma getrennt, z. B. ein eigener Mozilla-Autopush |

An andere Adressen schickt der Server keine Pushes, damit ein Gerät ihn nicht in sein eigenes Netz
rufen lassen kann.
