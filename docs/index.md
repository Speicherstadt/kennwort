---
title: Kennwort – der Passwortmanager für dein Team
og_title: "Kennwort: Die Zugänge deines Teams. Nur für euch lesbar."
description: >-
  Kennwort: der selbst gehostete, Ende-zu-Ende-verschlüsselte Passwortmanager für Teams in kleinen
  Betrieben. Web-App, Browser-Extension, App und Kommandozeile; der Server speichert nur
  Verschlüsseltes. Ein Rundgang in Bildern.
image: assets/screenshots/entry-desktop-light.webp
hide:
  - navigation
  - toc
---

<!-- The page to send to customers: what Kennwort does, in pictures. The details live in
     ueberblick.md. -->

<div class="showcase-hero" markdown>

<p class="showcase-kicker">Passwortmanager für kleine Betriebe, selbst gehostet</p>

# Die Zugänge deines Teams. Nur für euch lesbar.

<p class="showcase-claim">Tresore fürs Team, eine Browser-Extension, die erst nach deinem Klick
ausfüllt, eine Web-App fürs Handy und eine Kommandozeile. Verschlüsselt wird auf dem Gerät – dein
Server speichert nur Geheimtext.</p>

[Demo ausprobieren](https://kennwort.app/demo/){ .md-button .md-button--primary } [Rundgang starten](#rundgang){ .md-button } [Alle Funktionen im Detail](ueberblick.md){ .md-button }

</div>

!!! warning "Version 0.1: zum Ausprobieren, noch nicht extern geprüft"
    Die Kryptografie folgt offenen Standards, die Angriffe der ETH-Studie laufen als Tests – ein
    externer Audit fehlt aber noch, und Tests finden nicht jede Schwachstelle. Wer Kennwort schon
    nutzt, behält bitte eine zweite Kopie seiner Passwörter. Die App für Android wird gebaut, ist aber
    noch auf keinem Gerät erprobt; der Code für iOS liegt bereit. Die Demo läuft ganz im Browser mit
    Testdaten; die Passphrase ist `weber-haustechnik`.

<!-- On a phone the phone's own screen, so nothing has to be read at a quarter of its size. -->
<div class="showcase-shot showcase-cover" markdown>
[![Kennwort im Browser: die Einträge von Weber Haustechnik, daneben der Eintrag Sparkasse](assets/screenshots/entry-desktop-light.webp#only-light){ .showcase-cover-wide width="2560" height="1600" }](https://kennwort.app/demo/)
[![Kennwort im Browser im dunklen Design: die Einträge, daneben der Eintrag Sparkasse](assets/screenshots/entry-desktop-dark.webp#only-dark){ .showcase-cover-wide width="2560" height="1600" }](https://kennwort.app/demo/)
[![Kennwort am Handy: die Liste der Einträge mit Tab-Leiste](assets/screenshots/entries-phone-light.webp#only-light){ .showcase-cover-phone width="824" height="1678" }](https://kennwort.app/demo/)
[![Kennwort am Handy im dunklen Design: die Liste der Einträge](assets/screenshots/entries-phone-dark.webp#only-dark){ .showcase-cover-phone width="824" height="1678" }](https://kennwort.app/demo/)
</div>

<div class="showcase-feature" id="rundgang" markdown>
<div markdown>
<span class="showcase-kicker">Tresore</span>

## Jeder sieht, was er braucht

Ein persönlicher Tresor für jeden, geteilte Tresore für Büro, Baustelle oder Buchhaltung. Rollen
und Zugriff auf Zeit.
</div>
<div class="showcase-shot" markdown>
![Die Tresore der Firma mit der Zahl ihrer Personen](assets/screenshots/vaults-desktop-light.webp#only-light){ width="2560" height="1600" loading="lazy" }
![Die Tresore der Firma, dunkles Design](assets/screenshots/vaults-desktop-dark.webp#only-dark){ width="2560" height="1600" loading="lazy" }
</div>
</div>

<div class="showcase-feature showcase-feature--flip" markdown>
<div markdown>
<span class="showcase-kicker">Einträge</span>

## Mehr als Passwörter

Logins, Notizen, WLAN, Karten, SSH- und API-Schlüssel, Einmal-Codes und Passkeys. Für Externe ein
[Einmal-Link](einmal-links.md), der abläuft und sich nur so oft öffnen lässt, wie du wählst.
</div>
<div class="showcase-shot" markdown>
![Liste der Einträge mit Suche und Filtern](assets/screenshots/entries-desktop-light.webp#only-light){ width="2560" height="1600" loading="lazy" }
![Liste der Einträge, dunkles Design](assets/screenshots/entries-desktop-dark.webp#only-dark){ width="2560" height="1600" loading="lazy" }
</div>
</div>

<div class="showcase-feature" markdown>
<div markdown>
<span class="showcase-kicker">Team</span>

## Niemand kommt heimlich dazu

Jede Mitgliedschaft ist unterschrieben, und jedes Gerät prüft die Unterschriften. Ein Server, der
einen Fremden in einen Tresor schmuggeln will, fällt auf.
</div>
<div class="showcase-shot" markdown>
![Mitglieder mit Rollen und bestätigten Schlüsseln](assets/screenshots/members-desktop-light.webp#only-light){ width="2560" height="1600" loading="lazy" }
![Mitglieder, dunkles Design](assets/screenshots/members-desktop-dark.webp#only-dark){ width="2560" height="1600" loading="lazy" }
</div>
</div>

<div class="showcase-feature showcase-feature--flip" markdown>
<div markdown>
<span class="showcase-kicker">Sicherheit</span>

## Schwache Passwörter auf einen Blick

Schwache, doppelte und geleakte Passwörter der Tresore, die du siehst, in einer Liste – mit dem
Weg zum Ändern.
</div>
<div class="showcase-shot" markdown>
![Sicherheit: schwache und mehrfach verwendete Passwörter](assets/screenshots/security-desktop-light.webp#only-light){ width="2560" height="1600" loading="lazy" }
![Sicherheit, dunkles Design](assets/screenshots/security-desktop-dark.webp#only-dark){ width="2560" height="1600" loading="lazy" }
</div>
</div>

<div class="showcase-feature" markdown>
<div markdown>
<span class="showcase-kicker">Mitteilungen</span>

## Du erfährst, was sich ändert

Anna bittet um Zugriff auf einen Tresor, eine Einladung wurde angenommen, ein Einmal-Link wurde
abgerufen: Kennwort sagt dir Bescheid, wenn jemand auf dich wartet.
</div>
<div class="showcase-shot" markdown>
![Mitteilungen der Firma](assets/screenshots/notifications-desktop-light.webp#only-light){ width="2560" height="1600" loading="lazy" }
![Mitteilungen, dunkles Design](assets/screenshots/notifications-desktop-dark.webp#only-dark){ width="2560" height="1600" loading="lazy" }
</div>
</div>

<div class="showcase-feature showcase-feature--flip" markdown>
<div markdown>
<span class="showcase-kicker">Browser-Extension</span>

## Ausfüllen erst nach deinem Klick

Treffer nur für den exakten Host, nie in fremde iFrames. Neue Logins speichern, Passkeys nutzen,
eine Warnung, wenn du ein gespeichertes Passwort auf einer Seite eintippst, die nicht zu ihm passt.
</div>
<div class="showcase-shot showcase-popup" markdown>
![Das Popup der Extension mit dem Login für die Seite](assets/screenshots/popup-extension-light.webp#only-light){ width="720" height="1200" loading="lazy" }
![Das Popup der Extension, dunkles Design](assets/screenshots/popup-extension-dark.webp#only-dark){ width="720" height="1200" loading="lazy" }
</div>
</div>

<div class="showcase-center" markdown>
<span class="showcase-kicker">Am Handy</span>

## Am Handy ein Bildschirm nach dem anderen

Die Web-App lässt sich installieren, mit Tab-Leiste unten. Die App für Android füllt in anderen
Apps aus (noch auf keinem Gerät erprobt); der Code für iOS liegt bereit.

<div class="showcase-phones" markdown>
![Liste der Einträge am Handy](assets/screenshots/entries-phone-light.webp#only-light){ width="824" height="1678" loading="lazy" }
![Liste der Einträge am Handy, dunkel](assets/screenshots/entries-phone-dark.webp#only-dark){ width="824" height="1678" loading="lazy" }
![Ein Eintrag am Handy](assets/screenshots/entry-phone-light.webp#only-light){ width="824" height="1678" loading="lazy" }
![Ein Eintrag am Handy, dunkel](assets/screenshots/entry-phone-dark.webp#only-dark){ width="824" height="1678" loading="lazy" }
![Tresore am Handy](assets/screenshots/vaults-phone-light.webp#only-light){ width="824" height="1678" loading="lazy" }
![Tresore am Handy, dunkel](assets/screenshots/vaults-phone-dark.webp#only-dark){ width="824" height="1678" loading="lazy" }
![Sicherheit am Handy](assets/screenshots/security-phone-light.webp#only-light){ width="824" height="1678" loading="lazy" }
![Sicherheit am Handy, dunkel](assets/screenshots/security-phone-dark.webp#only-dark){ width="824" height="1678" loading="lazy" }
</div>
</div>

<div class="showcase-center" markdown>

## Gebaut gegen einen bösartigen Server

</div>

<div class="showcase-cards" markdown>
<div markdown>
**Nur Geheimtext auf dem Server**

Verschlüsselt wird auf deinem Gerät. Passphrase und Schlüssel verlassen es nie.
</div>
<div markdown>
**Post-Quanten-Schutz**

Schlüssel für Personen mit X-Wing: X25519 und ML-KEM-768 zusammen ([Kryptografie](kryptografie.md)).
</div>
<div markdown>
**Die ETH-Studie als Tests**

Alle 27 Angriffe des eigenen Katalogs nach der ETH-Studie zu Passwortmanagern mit bösartigem
Server laufen als Tests.
</div>
<div markdown>
**Signierte Updates**

Die installierte Web-App nimmt nur vom Projekt signierte Versionen an, auch wenn dein Server etwas
anderes ausliefert.
</div>
<div markdown>
**Passkey oder Passphrase**

Entsperren mit Passkey (WebAuthn PRF) oder Passphrase und Secret Key; dazu Recovery-Kit und
Notfallzugriff ([Konto](konto.md)).
</div>
<div markdown>
**Umzug auf dem Gerät**

Import aus Bitwarden, 1Password, LastPass, KeePass, Passbolt und den Browsern, ohne Umweg über den
Server ([Import](import-export.md)).
</div>
<div markdown>
**Kommandozeile**

Zugänge in Skripten und auf Servern abrufen ([CLI](cli.md)).
</div>
<div markdown>
**Open Source, ohne Kosten pro Kopf**

AGPL-3.0, reproduzierbare Builds, ein Container auf deinem Server ([Installation](installation.md)).
</div>
</div>

<div class="showcase-hero" markdown>

## Für Handwerk, Büros und IT-Dienstleister

<p class="showcase-claim">QR-Etiketten für Geräte, Übergabe an den Kunden, mehrere Firmen in einem
Konto: <a href="handwerk.html">Handwerk und IT-Dienstleister</a>.</p>

[Alle Funktionen im Detail](ueberblick.md){ .md-button .md-button--primary } [Installieren](installation.md){ .md-button } [Sicherheitsdesign](sicherheitsdesign.md){ .md-button }

</div>
