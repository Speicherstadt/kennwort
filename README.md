<div align="center">

<h1>Kennwort: der Passwortmanager für dein Team, selbst gehostet</h1>

**Gemeinsame Zugänge für kleine Betriebe – Ende-zu-Ende-verschlüsselt, auf deinem eigenen Server.**<br>
Bank, Lieferantenportale, WLAN und Kundengeräte an einem Ort, im Browser, als Extension und am Handy.<br>
Open Source, ohne Kosten pro Benutzer, sicher auch dann, wenn der Server selbst angegriffen wird.

![Status: in Entwicklung](https://img.shields.io/badge/Status-in%20Entwicklung-orange)
[![Lizenz: AGPL-3.0](https://img.shields.io/badge/Lizenz-AGPL--3.0-blue)](LICENSE)
[![Doku](https://img.shields.io/badge/Doku-kennwort.app-4f46e5?logo=zensical&logoColor=white)](https://kennwort.app/)

[Warum?](#warum-kennwort) •
[Funktionen](#funktionen) •
[Sicherheit](#sicherheit) •
[Alternativen](#kennwort-und-die-alternativen) •
[FAQ](#faq) •
[Dokumentation](https://kennwort.app/)

</div>

> [!WARNING]
> **In Entwicklung:** Kennwort ist noch nicht veröffentlicht. Bitte noch keine echten Passwörter damit verwalten.

## Warum Kennwort?

In vielen Betrieben liegen die gemeinsamen Zugänge in einer Excel-Liste, auf Zetteln oder in einem Abo-Tool, das pro
Kopf kostet. Kennwort ist die Open-Source-Alternative zu Team Password Manager, Bitwarden und Passbolt, die du auf
deinem eigenen Server betreibst.

- **Nur ihr könnt es lesen**: Ende-zu-Ende-verschlüsselt, mit Post-Quanten-Schutz; der Server sieht nur
  Verschlüsseltes und kann niemandem heimlich Zugriff geben.
- **Entsperren mit dem Finger**: Passkey statt Master-Passwort, die Passphrase bleibt der Notweg.
- **Für Teams gebaut**: Tresore, Gruppen, Rechte, Zugriff auf Zeit, Freigabe durch Verwalter, Audit-Log.
- **Für Handwerk und IT-Dienstleister**: QR-Etiketten für Geräte, Übergabe der Zugänge an den Kunden, mehrere
  Firmen in einem Konto.
- **Keine Kosten pro Kopf**: zehn Mitarbeiter kosten so viel wie einer; bezahlt wird nur der Server.

## Funktionen

| Bereich | Was Kennwort kann |
|---|---|
| 🔑 Konto | Firma mit Einrichtungs-Code anlegen, Mitglieder per Einladungslink einladen und bestätigen, Rollen (Inhaber, Admin, Mitarbeiter), signierte Firmen-Richtlinien (Sperrzeit), Recovery-Kit als PDF, Entsperren mit Passphrase, Passphrase vergessen mit dem Recovery Key, alle Schlüssel erneuern, wenn das Recovery-Kit in fremde Hände geraten ist (neues Kit, Bestätigung per Vergleichscode, neue Tresor-Schlüssel), Firmen-Recovery (Zugang über einen Inhaber wiederherstellen), Notfallzugriff mit Wartezeit für eine Person des Vertrauens (Ansehen ausgewählter Tresore oder Vollzugriff, Widerspruch bis zum Ende der Wartezeit), neues Gerät per QR-Code, Geräteliste und Gerät abmelden, automatisches Sperren |
| 🔐 Tresore und Einträge | Logins, Notizen, WLAN, Karten, SSH- und API-Schlüssel, Anhänge, TOTP, Passkeys; Generator für Passwörter und Passphrasen; frühere Passwörter, Favoriten, Tags und Suche über alles |
| 👥 Team | Gruppen, Rollen, Zugriff anfragen, Zugriff auf Zeit, einzelnen Eintrag teilen, aus Tresor oder Firma entfernen mit Schlüsselwechsel, „Zum Ändern“ für alles, was die Person lesen konnte, Austritts-Bericht und ein neuer Firmenschlüssel, wenn ein Inhaber oder Admin geht (jedes Mitglied übernimmt ihn erst nach dem Vergleichscode) |
| 🧩 Browser-Extension | Chrome, Edge, Firefox (auch Android) und Safari; Popup zum Entsperren mit Treffern für die Seite (exakter Host), Suche, Favoriten, Kopieren und Generator; Inline-Menü unter Login-Feldern, das erst nach Klick oder Enter ausfüllt, nur auf dem exakten Host, nie in fremde iFrames und nicht, wenn eine Seite das Menü verdeckt; bietet nach dem Anmelden an, ein neues Login zu speichern oder ein geändertes Passwort zu aktualisieren (das alte bleibt unter „Frühere Passwörter“), mit „Nie für diese Seite“; Phishing-Warnung, wenn du ein gespeichertes Passwort auf einer anderen Seite eintippst als der, für die es gespeichert ist – ohne dass das Passwort die Seite im Klartext verlässt; Passkey-Anbieter: Passkeys für Websites in Kennwort speichern und damit anmelden, erst nach deinem Klick, mit „Anderes Gerät verwenden“ für das WebAuthn des Browsers |
| 📱 Handy | Web-App zum Installieren (PWA), die nur signierte und geprüfte Updates annimmt und ohne Verbindung entsperrt und liest, und App für Android und iOS mit systemweitem Ausfüllen |
| 🔁 Umzug | Import aus Bitwarden, LastPass, 1Password, KeePass (auch die KDBX-Datenbank mit Master-Passwort und Schlüsseldatei), Team Password Manager, Passbolt, den Browsern, jeder Tabelle und Authenticator-Apps (Google Authenticator per QR-Code, Aegis, 2FAS): Anbieter wählen, Anleitung, Vorschau ohne Geheimnisse, Duplikate überspringen, schwache Passwörter gleich unter „Zum Ändern“ |
| 📤 Export | Inhaber und Admins exportieren einen Tresor oder alle als verschlüsseltes JSON (wieder importierbar, mit allem), als KeePass-Datenbank (KDBX 4) oder als CSV für andere Passwortmanager; die Datei entsteht nur auf dem Gerät, jeder Export steht im Audit-Log |
| 🛡️ Sicherheit im Alltag | Sicherheits-Übersicht, Prüfung gegen Datenlecks, „Zum Ändern“-Liste, Einmal-Links für Externe |

## Sicherheit

Kennwort verschlüsselt auf deinem Gerät, bevor etwas den Server erreicht: XChaCha20-Poly1305, X25519 kombiniert
mit ML-KEM-768 (Post-Quanten-Schutz), Ed25519-Signaturen und Argon2id. Jede Mitgliedschaft in einem Tresor ist
signiert, jeder Geheimtext an seinen Eintrag gebunden; so kann auch ein gehackter Server niemandem Zugriff
verschaffen. Die Details stehen im [Sicherheitsdesign](https://kennwort.app/sicherheitsdesign.html); Lücken bitte
privat melden, siehe [SECURITY.md](SECURITY.md).

## Kennwort und die Alternativen

| | Was es ist | Wo Kennwort anders ist |
|---|---|---|
| [Bitwarden](https://bitwarden.com/) | verbreiteter Open-Source-Passwortmanager | für kleine Teams einfacher, Post-Quanten-Schutz, gegen einen bösartigen Server gebaut |
| [Passbolt](https://www.passbolt.com/) | Team-Passwortmanager mit Extension, PHP | ein Container mit Bun und SQLite, moderne Kryptografie statt OpenPGP, alles ohne Pro-Version |
| [Team Password Manager](https://teampasswordmanager.com/) | Team-Passwortmanager zum Selbsthosten | Open Source, Ende-zu-Ende-verschlüsselt, mit Extension und App |

## FAQ

### Gibt es einen selbst gehosteten Passwortmanager für kleine Firmen?
Ja, dafür ist Kennwort gemacht: ein Container auf deinem Server, Tresore und Gruppen fürs Team, ohne Kosten pro Benutzer.

### Kann ich von Bitwarden, LastPass oder 1Password umziehen?
Ja. Kennwort liest deren Exporte direkt auf deinem Gerät; die Datei wird nie hochgeladen.

### Brauche ich einen Anmeldedienst wie Keycloak?
Nein. Kennwort hat eigene Konten mit Passkey; OpenID Connect ist ein Zusatz für Firmen, die schon einen haben.

## Entwicklung

Bun, Hono, Drizzle und SQLite auf dem Server; Solid, Tailwind und die `@noble`-Bibliotheken im Client; Tauri für die
App. Hinweise für Mitwirkende und Agenten stehen in [CLAUDE.md](CLAUDE.md).

---

<div align="center">

<sub>Lizenz: <a href="LICENSE">AGPL-3.0</a> · © Tristan Teufel und Mitwirkende<br>
Veränderte Versionen, die du weitergibst oder für andere betreibst, müssen ihren Quellcode unter der AGPL anbieten; eine kommerzielle Lizenz ohne diese Pflichten gibt es über <a href="https://teufel-it.de">teufel-it.de</a>.<br>
Kennwort steht in keiner Verbindung zu Bitwarden, Passbolt, Team Password Manager oder den anderen genannten Produkten.</sub>

</div>
