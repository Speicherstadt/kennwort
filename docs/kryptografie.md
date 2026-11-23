---
title: Kryptografie
description: >-
  Wie Kennwort verschlüsselt, in Klartext erklärt: Post-Quanten-Schutz mit X-Wing,
  XChaCha20-Poly1305, Argon2id mit Secret Key, signierte Mitgliedschaften, ein Vergleich mit
  Bitwarden, 1Password und Passbolt und die Grenzen.
---

# Kryptografie

Diese Seite erklärt, was an Kennworts Verschlüsselung besonders ist, und warum. Sie fasst das
[Sicherheitsdesign](sicherheitsdesign.md) zusammen, das die Formate und Protokolle verbindlich
festlegt; wo hier eine Kennung wie F-02 oder P-06 steht, findest du dort die Einzelheiten.

!!! warning "Noch nicht extern geprüft"
    Kennwort ist noch nicht veröffentlicht, und kein unabhängiges Audit hat den Code geprüft. Ein
    externes Audit steht vor der Veröffentlichung an. Alles unten beschreibt, wie Kennwort gebaut
    ist und wie es sich selbst prüft, nicht das Urteil eines Prüfers.

## Die Leitidee: Der Server ist nicht vertrauenswürdig

Die meisten Passwortmanager verschlüsseln Ende-zu-Ende. Die Studie der ETH Zürich und der USI
(Scarlata, Torrisi, Backendal, Paterson: „Zero Knowledge (About) Encryption“, USENIX Security 2026)
hat aber gezeigt, dass das allein nicht reicht: Ein gehackter oder böswilliger Server konnte bei
Bitwarden, LastPass, Dashlane und 1Password trotzdem Schlüssel unterschieben, Mitglieder aufnehmen,
Felder vertauschen oder alte, schwächere Verfahren erzwingen
([Bericht bei iTnews](https://www.itnews.com.au/news/researchers-find-critical-vulnerabilities-in-cloud-based-password-managers-623661)).

Kennwort ist von Anfang an gegen genau diesen Server gebaut. Er speichert nur Geheimtexte,
signierte Einträge und öffentliche Schlüssel; alles, was über Zugriff entscheidet, prüft dein Gerät
selbst. Aus der Studie und Kennworts eigenen Funktionen entstand ein Katalog von 27 Angriffen
(E-01 bis E-27), und jeder davon läuft als Test gegen einen Testserver, der absichtlich lügt
([Angriffe als Tests](sicherheitsdesign.md#angriffe-als-tests)).

## Die Verfahren

Nur standardisierte Verfahren, nichts selbst erfunden:

| Wofür | Verfahren | Standard |
| --- | --- | --- |
| Einträge und Schlüssel verschlüsseln | XChaCha20-Poly1305 (256-Bit-Schlüssel, 192-Bit-Nonce) | RFC 8439, draft-irtf-cfrg-xchacha |
| Schlüssel an Personen verpacken | X-Wing: X25519 und ML-KEM-768 zusammen | draft-connolly-cfrg-xwing-kem, FIPS 203 |
| Unterschreiben | Ed25519, streng nach RFC 8032 geprüft | RFC 8032 |
| Aus der Passphrase ableiten | Argon2id (64 MiB, 3 Durchläufe), dazu der Secret Key | RFC 9106 |
| Schlüssel ableiten | HKDF-SHA-512 | RFC 5869 |
| Hashes | SHA-512, SHA-512/256 | FIPS 180-4 |
| Passkeys für Websites | ECDSA P-256 (ES256), deterministisch nach RFC 6979 | FIPS 186-5, WebAuthn Level 3 |

Alle stammen aus den `@noble`-Bibliotheken von Paul Miller (`@noble/ciphers`, `@noble/curves`,
`@noble/hashes`, `@noble/post-quantum`): reines TypeScript ohne weitere Abhängigkeiten. Eine
eigene Implementierung eines Verfahrens gibt es in Kennwort nicht ([Bausteine](sicherheitsdesign.md#bausteine)).

## Was daran gut ist

### Post-Quanten-Schutz gegen „jetzt speichern, später entschlüsseln“

Wer heute verschlüsselte Daten mitschneidet oder eine Datenbank stiehlt, kann sie aufheben, bis es
einen Quantenrechner gibt, der X25519 oder RSA bricht. Bei einem Passwortmanager ist das kein
Gedankenspiel: Viele Zugänge gelten jahrelang.

Kennwort verpackt jeden Tresor-Schlüssel und jeden Schlüssel, den es an eine Person gibt, mit
**X-Wing**, einer Kombination aus dem bewährten X25519 und dem Post-Quanten-Verfahren
**ML-KEM-768** (FIPS 203). Die Verpackung ist so sicher wie der stärkere der beiden Teile: Ist
ML-KEM eines Tages doch angreifbar, schützt weiter X25519, und gegen einen Quantenrechner schützt
ML-KEM ([F-02](sicherheitsdesign.md#f-02-an-einen-offentlichen-schlussel-verpackt-v1)). Die
symmetrische Verschlüsselung mit 256-Bit-Schlüsseln gilt ohnehin als quantensicher genug.

Nicht quantensicher sind die Signaturen (Ed25519): Ein künftiger Quantenrechner könnte Signaturen
fälschen, aber keine Daten nachträglich lesen, die heute verschlüsselt werden. Das ist die Gefahr,
gegen die „jetzt speichern, später entschlüsseln“ zielt.

### XChaCha20-Poly1305 mit Bindung an den Ort (AAD)

Jeder Geheimtext ist authentisiert: Wer ein Bit ändert, bekommt einen Fehler statt veränderter
Daten. Die lange Nonce von XChaCha20 (192 Bit) lässt sich gefahrlos zufällig wählen. Dazu bindet
jeder Geheimtext seinen Ort in die Prüfung ein, die **AAD**: bei einem Eintrag Tresor, Eintrag und
Version. Schiebt der Server einen Geheimtext in einen anderen Eintrag, einen anderen Tresor oder an
eine alte Version, lässt er sich dort nicht öffnen
([F-01](sicherheitsdesign.md#f-01-geheimtext-v1), [P-09](sicherheitsdesign.md#p-09-eintrage-speichern-und-lesen)).

Alle Felder eines Eintrags, auch Titel und Adresse, liegen in **einem** Geheimtext. Es gibt kein
Feld, das der Server einzeln lesen oder gegen ein anderes tauschen könnte, und keine Adresse im
Klartext, die er auf seine eigene Domain umbiegen könnte (E-11, E-14).

### Argon2id und der Secret Key

Aus deiner Passphrase leitet Kennwort mit **Argon2id** einen Schlüssel ab und mischt dann den
**Secret Key** dazu: 128 zufällige Bit, die nur auf deinen Geräten und im Recovery-Kit stehen, nie
auf dem Server ([F-05](sicherheitsdesign.md#f-05-ableitung-aus-der-passphrase-v1)). Wer die
Datenbank stiehlt, muss deshalb nicht nur die Passphrase raten, sondern auch 128 Bit Zufall, also
praktisch unmöglich viel. Das Verfahren folgt der Idee, die 1Password als „Two-Secret Key
Derivation“ eingeführt hat.

Die Parameter von Argon2id gehören fest zur Formatversion und stehen nicht in der Datenbank. Ein
Server kann sie also nicht heimlich senken, um das Raten leichter zu machen (E-18), anders als in
der ETH-Studie bei Produkten, die sich die Iterationszahl vom Server sagen ließen.

Beim Anmelden bekommt der Server weder Passphrase noch Secret Key noch einen Schlüssel daraus, nur
eine Signatur mit einem eigenen Anmeldeschlüssel (E-24).

### Unterschriebene Mitgliedschaften

Wer in einem Tresor ist, steht in einem **Mitgliedschafts-Log**: einer Hash-Kette, in der jeder
Eintrag von einem Verwalter mit Ed25519 unterschrieben ist. Dein Gerät prüft bei jedem Abruf die
ganze Kette: lückenlos, richtige Reihenfolge, jede Unterschrift gültig, jeder Unterzeichner zu
diesem Zeitpunkt Verwalter ([P-06](sicherheitsdesign.md#p-06-mitgliedschafts-log)). Der Server kann
deshalb niemanden heimlich aufnehmen, keinen Eintrag weglassen und verschiedenen Mitgliedern keine
verschiedenen Stände zeigen, ohne dass es auffällt (E-06, E-07, E-08).

Öffentliche Schlüssel nimmt Kennwort nie roh vom Server, sondern nur aus einem Zertifikat, das der
**Firmen-Wurzelschlüssel** unterschrieben hat. So kann der Server beim Teilen nicht seinen eigenen
Schlüssel unterschieben (E-05, E-10;
[P-07](sicherheitsdesign.md#p-07-firmen-wurzelschlussel-und-zertifikate)). Den Wurzelschlüssel
lernt ein Gerät beim ersten Kontakt (TOFU); einen Wechsel danach bestätigen alle Mitglieder mit
einem Vergleichscode.

### Kein Zurückspielen alter Stände

Ein Server, der nicht fälschen kann, könnte versuchen, einen alten, echten Stand zu zeigen: ein
Passwort von vor der Änderung, ein Log von vor dem Austritt eines Kollegen. Dagegen merkt sich
jedes Gerät die höchste Version je Eintrag und den zuletzt gesehenen Kontozustand und lehnt
Älteres ab, auch nach einem Neuladen und offline (E-07, E-13, E-15;
[P-21](sicherheitsdesign.md#p-21-sync), [P-22](sicherheitsdesign.md#p-22-offline-kopie)). Auch
die Web-App selbst nimmt nur ein neueres Release an als das, das sie schon geprüft hat.

Ehrlich gesagt: Einen ganz neuen Eintrag, den ein Gerät nie gesehen hat, kann der Server diesem
Gerät vorenthalten; das kann kein Client bemerken.

### Keine Rückwärtskompatibilität, die schwächt

Jedes Format beginnt mit einer Versionsnummer, und ein Client fällt nie auf eine ältere zurück,
weil der Server es verlangt. Eine unbekannte Version ist ein Fehler, keine Einladung zum Ausweichen
(E-17, E-19; [Formate](sicherheitsdesign.md#formate)).

### Signierte, nachbaubare Web-App

Eine Web-App hat ein Grundproblem: Der Server, dem man nicht traut, liefert auch den Code. Kennwort
löst das mit einem Service Worker: Jedes Release hat ein Manifest mit dem SHA-256 jeder Datei,
unterschrieben mit dem Release-Schlüssel. Der Service Worker aktiviert ein Update erst, wenn
Unterschrift und alle Hashes stimmen und das Release neuer ist als das bisherige
([P-16](sicherheitsdesign.md#p-16-ausgelieferter-code), [Updates](updates.md)). Der Build ist
reproduzierbar: Jeder kann einen Commit nachbauen und mit `bun run reproducible` Byte für Byte mit
dem veröffentlichten Manifest vergleichen. Die Extension und die App bringen ihren Code ohnehin im
signierten Paket mit.

### Entsperren mit Passkey (PRF)

In der Web-App kann ein Passkey statt der Passphrase entsperren. Dafür nutzt Kennwort die
**PRF-Erweiterung** von WebAuthn Level 3: Der Passkey liefert für ein zufälliges Salt einen geheimen
Wert, aus dem dein Gerät den Schlüssel ableitet, unter dem dein Kontoschlüssel liegt
([P-03](sicherheitsdesign.md#p-03-entsperren)). Der Server bekommt nur den so verschlüsselten
Kontoschlüssel und die ID des Passkeys, nie den PRF-Wert. Passphrase und Secret Key funktionieren
daneben weiter ([Konto und Entsperren](konto.md)).

### Wenige, geprüfte Bausteine und strenge Tests

- **Nur `@noble/*`** in `packages/crypto`. `@noble/ciphers`, `@noble/curves` und `@noble/hashes`
  wurden von Cure53 und anderen geprüft; Argon2 in `@noble/hashes` lag laut deren README außerhalb
  des Prüfumfangs, und `@noble/post-quantum` ist nach eigener Angabe noch nicht unabhängig
  geprüft. ML-KEM ist deshalb mit X25519 kombiniert, nicht allein im Einsatz.
- **Testvektoren**, die unabhängig vom geprüften Code entstehen: etwa mit libsodium und
  `node:crypto`, X-Wing gegen die Vektoren des Entwurfs, Ed25519 gegen RFC 8032.
- **Property-Tests**, die zufällige Eingaben durchspielen (etwa: was verpackt wurde, packt sich
  wieder aus; jede Änderung am Geheimtext scheitert).
- **Mutation-Tests mit 100 %** für `packages/crypto` und `packages/core` (Stryker, nachts): Jede
  kleine Änderung am Code, die kein Test bemerkt, lässt den Lauf scheitern.
- **27 Angriffe als Tests**, und ein Test schlägt fehl, wenn einer im Katalog fehlt.

## Im Vergleich

Die anderen sind ausgereifte, viel genutzte Produkte mit externen Audits; Kennwort hat noch keins.
Der Vergleich stützt sich auf deren öffentliche Unterlagen (Stand 23.11.2026) und betrifft nur die
Kryptografie.

| | Kennwort | Bitwarden | 1Password | Passbolt |
| --- | --- | --- | --- | --- |
| Symmetrisch | XChaCha20-Poly1305 | AES-256-CBC mit HMAC-SHA256 | AES-256-GCM | OpenPGP |
| Schlüssel an Personen | X-Wing (X25519 + ML-KEM-768) | RSA-2048 | RSA | OpenPGP (RSA oder ECC) |
| Post-Quanten-Schutz der Daten | ja, für jeden geteilten Schlüssel | keine Angabe gefunden | hybrides ML-KEM im TLS-Transport, nicht für die Tresorschlüssel | keine Angabe gefunden |
| Passphrase | Argon2id und 128-Bit-Secret-Key | PBKDF2-SHA256 (Standard) oder Argon2id | PBKDF2-HMAC-SHA256 und 128-Bit-Secret-Key | OpenPGP-Passphrase des privaten Schlüssels |
| Bösartiger Server (ETH-Studie) | alle 27 Angriffe des eigenen Katalogs als Tests | Angriffe gefunden | Angriffe gefunden | nicht untersucht |
| Externes Audit | noch keins | ja, regelmäßig | ja, regelmäßig | ja (Cure53) |

- **Bitwarden** verschlüsselt mit AES-256-CBC und HMAC, leitet standardmäßig mit PBKDF2 ab
  (Argon2id auf Wunsch) und teilt Organisationsschlüssel über RSA-2048
  ([Verschlüsselung bei Bitwarden](https://bitwarden.com/help/what-encryption-is-used/),
  [White Paper](https://bitwarden.com/help/bitwarden-security-white-paper/)). Gleichwertig: Ende-zu-Ende,
  Open Source, selbst zu hosten. Die ETH-Studie fand bei Bitwarden die meisten Angriffe eines
  bösartigen Servers.
- **1Password** hat den Secret Key erfunden; hier ist Kennwort gleichauf, nicht besser
  ([Security Design](https://agilebits.github.io/security-design/1Password_Security_Design.pdf)).
  1Password schützt seit 2026 die Verbindung hybrid mit ML-KEM
  ([Blog](https://1password.com/blog/post-quantum-cryptography)) und bietet ML-DSA-Passkeys an
  ([Blog](https://1password.com/blog/post-quantum-passkeys)). 1Password ist nicht Open Source und
  nicht selbst zu hosten.
- **Passbolt** setzt auf OpenPGP, seit Version 5 auch für verschlüsselte Metadaten
  ([White Paper v5.10](https://www.passbolt.com/docs/files/security_white_paper_-_passbolt_pro_edition_v5.10_-_(march_2026_-_rev10).pdf),
  [verschlüsselte Metadaten](https://www.passbolt.com/docs/development/resources/v5-encrypted-metadata/)).
  OpenPGP ist alt und bewährt, aber groß und mit vielen Varianten; Kennwort nutzt wenige, moderne
  Verfahren mit festen Parametern. Passbolt ist Open Source, selbst zu hosten und extern geprüft.

## Grenzen

- **Kein externes Audit.** Bis dahin bitte keine echten Passwörter.
- **Die App fürs Handy ist früh.** Die Android-App baut auf einer Alpha von Tauri 3, hat noch kein
  Release, und die iOS-App ist nicht gebaut ([Handy und App](handy.md)).
- **Signaturen sind nicht quantensicher** (Ed25519), siehe oben.
- **Erster Kontakt (TOFU):** Den Firmen-Wurzelschlüssel lernt ein Gerät beim ersten Kontakt mit dem
  Server.
- **Neue Einträge vorenthalten:** Was ein Gerät nie gesehen hat, kann der Server verschweigen.
- **Außerhalb des Modells:** Schadsoftware auf dem entsperrten Gerät, ein Angreifer mit dem
  entsperrten Gerät in der Hand, ein kompromittierter Browser oder ein kompromittiertes
  Betriebssystem ([Bedrohungsmodell](sicherheitsdesign.md#bedrohungsmodell)).
- **Release-Schlüssel:** Bis zur Veröffentlichung signieren die Builds mit einem Test-Schlüssel.
