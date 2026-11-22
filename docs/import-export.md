---
title: Import und Export
description: >-
  Wie du deine Zugänge aus einem anderen Passwortmanager, Browser, einer Tabelle oder einer
  Authenticator-App importierst – Anbieter, Vorschau, Duplikate, schwache Passwörter –, welche
  Exportdateien Kennwort liest, was daraus wird und wie die Datei auf dem Gerät bleibt; und wie
  Inhaber und Admins als verschlüsseltes JSON, KDBX oder CSV exportieren.
---

# Import und Export

Wer zu Kennwort wechselt, nimmt seine Zugänge mit: Logins, Notizen, Karten, Identitäten, WLAN und
SSH-Schlüssel, dazu Einmalcodes, mehrere Adressen, eigene Felder, Ordner, Favoriten und, wo die
Datei sie hat, frühere Passwörter.

Die Exportdatei liest Kennwort nur auf deinem Gerät. Sie wird nie hochgeladen; der Server bekommt
wie immer nur die fertig verschlüsselten Einträge.

## So importierst du

Unter **Einstellungen → Importieren**:

1. **Anbieter wählen**: jeder Manager, Browser und jede Authenticator-App aus der Tabelle unten oder
   „Andere Tabelle (CSV)“. Kennwort zeigt gleich, wo dort der Export ist.
2. **Datei wählen**: Kennwort liest sie auf dem Gerät; ein ZIP des Anbieters (1Passwords 1PUX,
   Dashlane, Proton Pass) wählst du, wie es ist, ohne es zu entpacken. Eine KeePass-Datenbank
   (`.kdbx`) öffnest du mit ihrem Master-Passwort und, falls sie eine hat, ihrer Schlüsseldatei
   (siehe [KeePass-Datenbanken](#keepass-datenbanken-kdbx)). Ist ein Bitwarden-Export
   passwortgeschützt, fragt Kennwort danach nach seinem Export-Passwort (siehe
   [Bitwardens verschlüsselter Export](#bitwardens-verschlusselter-export)). Passt die Datei nicht, sagt
   Kennwort, warum – etwa „Diese Datei ist verschlüsselt – exportiere unverschlüsselt“ oder dass
   sie zu einem anderen Anbieter gehört. Bei Google Authenticator gibt es keine Datei, sondern
   QR-Codes; wie das geht, steht unter [Authenticator-Apps](#authenticator-apps).
3. **Spalten zuordnen** (nur bei „Andere Tabelle“): Für Titel, Benutzername, Passwort, Adresse,
   Einmalcode, Notizen, Ordner und Tags wählst du die Spalte; Kennwort schlägt nach den Namen der
   Spalten schon eine Zuordnung vor. Die Tabelle braucht eine Kopfzeile und Kommas zwischen den
   Spalten.
4. **Vorschau**: wie viele Einträge welcher Art in der Datei stehen und jeden Eintrag mit Titel,
   Benutzername und Adresse – Passwörter und andere geheime Felder zeigt die Vorschau nie. Du
   wählst den Tresor (nur Tresore, in die du gerade schreiben darfst) und ob die Ordner des anderen
   Managers zu Tags werden.
    - **Doppelt** ist ein Eintrag, den es im gewählten Tresor schon gibt oder der weiter oben in der
      Datei schon steht: gleicher Titel, gleicher Benutzername und gleiche Adresse, ohne Groß- und
      Kleinschreibung und ohne `/` am Ende. Er wird übersprungen, außer du hakst „Trotzdem
      importieren“ an.
    - **Schwach** ist ein Passwort nach derselben Regel wie unter „Zum Ändern“ (siehe
      [Einträge](eintraege.md)).
5. **Importieren**: Kennwort verschlüsselt und signiert jeden Eintrag wie einen von Hand angelegten
   und schreibt sie in Stapeln, mit Fortschritt. Offline oder solange im Tresor ein
   Schlüsselwechsel aussteht, schreibt der Import nichts. Bricht er ab, sagt er, wie viele Einträge
   schon gespeichert sind; was nicht ankam, schickt Kennwort auch später nicht von selbst.
6. **Danach**: Lösche die Exportdatei, auch aus Downloads und Papierkorb – sie enthält jedes
   Passwort im Klartext. Schwache Passwörter findest du über den Link gleich unter „Zum Ändern“.

Der Klartext der Datei bleibt nur so lange im Speicher, wie Zuordnung und Vorschau ihn brauchen:
Nach dem Import oder wenn du die Seite verlässt, ist er weg, die gelesenen Bytes überschreibt
Kennwort mit Nullen.

## Formate

| Von | Datei | Was mitkommt |
| --- | --- | --- |
| Kennwort | verschlüsseltes JSON aus „Exportieren“, mit seiner Passphrase | alles, wie es war: alle Arten und Felder, Verlauf, Tags, Favoriten, Einmalcodes und Passkeys; der Name des Tresors wird der Ordner (siehe [Export](#export)) |
| Bitwarden / Vaultwarden | JSON (Tresor oder Organisation), unverschlüsselt oder passwortgeschützt mit seinem Export-Passwort | alle Arten (Login, Notiz, Karte, Identität, SSH-Schlüssel), eigene Felder, Ordner bzw. Sammlungen, Favoriten, frühere Passwörter |
| Bitwarden / Vaultwarden | CSV (Tresor oder Organisation) | Logins und Notizen, eigene Felder, mehrere Adressen, Ordner bzw. Sammlungen, Favoriten |
| LastPass | CSV aus dem Web-Tresor | Logins, sichere Notizen, Kreditkarten, Adressen als Identität, andere Notiz-Arten mit ihren Feldern, Ordner und geteilte Ordner, Favoriten |
| 1Password | 1PUX (1Password 8) | alle Kategorien: Logins, Passwörter, Server und Datenbanken als Login, Karten, Identitäten, WLAN-Router, API-Zugänge, SSH-Schlüssel, alles andere als Notiz mit seinen Feldern; Abschnitte als eigene Felder, Einmalcodes, mehrere Adressen, Tresore als Ordner, Tags, Favoriten, frühere Passwörter, archivierte Einträge; Anhänge und Häkchen aus Anmeldeformularen bleiben draußen |
| 1Password | CSV (1Password 8) | Logins mit Einmalcode, Tags, Favoriten |
| KeePass / KeePassXC / Passbolt | KDBX 4, die Datenbank selbst, mit Master-Passwort und auf Wunsch Schlüsseldatei | alles wie beim KeePass-2-XML (nächste Zeile); Anhänge bleiben draußen |
| KeePass / KeePassXC | KeePass-2-XML | Gruppen als Ordner, geschützte Felder als geheime Felder, Einmalcodes (KeePassXC und KeePass 2.47+), weitere Adressen, Tags, frühere Passwörter; der Papierkorb bleibt draußen |
| KeePassXC | CSV | Gruppen als Ordner, Einmalcodes; der Papierkorb bleibt draußen |
| KeePass 2 | CSV | Logins mit Notizen |
| Passbolt | CSV (KeePass-Layout) | Ordner, Einmalcodes |
| Dashlane | ZIP des CSV-Exports, so wie es geladen wird | alles aus den CSV-Dateien darin (siehe nächste Zeile); eine CSV-Datei einer Art, die Kennwort nicht kennt, bleibt draußen |
| Dashlane | CSV (jede Datei aus dem ZIP einzeln) | Zugangsdaten mit Einmalcode und Kategorie, sichere Notizen, Karten und Bankkonten, Ausweise und persönliche Daten |
| Proton Pass | ZIP des JSON-Exports, so wie es geladen wird | alles aus `Proton Pass/data.json` darin (siehe nächste Zeile); Anhänge bleiben draußen |
| Proton Pass | JSON (`data.json` aus dem ZIP) | alle Arten (Login, Alias, Karte, Notiz, Identität, SSH-Schlüssel, WLAN), eigene Felder und Abschnitte, Tresore als Ordner, Angeheftete als Favoriten; der Papierkorb bleibt draußen |
| Keeper | CSV | Ordner und geteilte Ordner, eigene Felder, Einmalcode |
| NordPass | CSV | Logins mit mehreren Adressen und eigenen Feldern, Karten, Identitäten, Notizen, Ordner |
| Enpass | JSON | Logins, Karten, Notizen, Identitäten, alle Felder, Ordner mit Unterordnern, Favoriten; der Papierkorb bleibt draußen |
| Chrome, Edge, Brave, Opera | CSV | Logins mit Notiz |
| Firefox | CSV | Logins; der Titel ist die Adresse |
| Safari / Apple Passwörter | CSV | Logins mit Notiz und Einmalcode |
| Beliebige Tabelle | CSV | du ordnest die Spalten zu: Titel, Benutzername, Passwort, Adresse, Einmalcode, Notizen, Ordner, Tags |
| Google Authenticator | Export-QR-Codes („Konten übertragen“), gescannt oder als Link eingefügt | Einmalcodes (TOTP) mit Aussteller, Konto, Algorithmus und Ziffern |
| Aegis | JSON, unverschlüsselt | Einmalcodes (TOTP) mit allen Einstellungen, Notiz, Favorit, Gruppen als Ordner |
| 2FAS | Backup-Datei (.2fas), ohne Passwort | Einmalcodes (TOTP) mit allen Einstellungen, Gruppen als Ordner |

Noch nicht dabei und als eigene Teile geplant:

- **Proton Pass' PGP-Export**: Kennwort erkennt ihn und sagt, dass er verschlüsselt ist.
- **Team Password Manager** und **FIDO Credential Exchange (CXF)**, sobald das Format stabil ist.
- **Einmalcodes dem passenden Login zuordnen**: Bis dahin wird jeder Code aus einer
  Authenticator-App ein eigener Login (siehe unten).
- **Microsoft Authenticator** hat keinen Export: Seine Sicherung geht nur in Microsofts Cloud und
  lässt sich nur in Microsoft Authenticator wiederherstellen. Richte die Einmalcodes bei den
  Diensten neu ein – in den Sicherheitseinstellungen des Kontos, mit dem QR-Code, den der Dienst
  dann zeigt (siehe [Einträge](eintraege.md)). Bietet Microsoft einen Export an, liest Kennwort ihn.

## Authenticator-Apps

Aus Google Authenticator, Aegis und 2FAS nimmst du deine Einmalcodes mit. Jedes Konto wird ein
Login: Titel ist der Dienst (der Aussteller), Benutzername das Konto, und der Einmalcode steht als
otpauth-Link im Feld „Einmalcode“ – mit Schlüssel, Algorithmus (SHA-1, SHA-256 oder SHA-512),
sechs bis acht Ziffern und Dauer. Notizen und Favoriten aus Aegis kommen mit, Gruppen werden
Ordner und auf Wunsch Tags.

- **Google Authenticator**: In der App „Konten übertragen“ → „Konten exportieren“ wählen. Die App
  zeigt einen QR-Code, bei vielen Konten mehrere nacheinander. Unter **Importieren** scannst du
  jeden davon mit der Kamera oder wählst einen Screenshot; Kennwort zählt mit („1 von 2 QR-Codes
  gelesen“). Statt zu scannen kannst du die Links (`otpauth-migration://offline?data=…`) auch
  einfügen, einen pro Zeile. Fehlt ein QR-Code eines Exports, sagt Kennwort es und importiert
  nichts; derselbe QR-Code zweimal zählt einmal, und zwei Exporte auf einmal gehen auch.
- **Aegis**: „Einstellungen“ → „Importieren & Exportieren“ → „Exportieren“, Format „Aegis (.JSON)“,
  „Tresor verschlüsseln“ aus.
- **2FAS**: „Einstellungen“ → „2FAS-Backup“ → „In Datei exportieren“, ohne Passwort.

Ein verschlüsselter Export von Aegis oder ein 2FAS-Backup mit Passwort endet mit „Diese Datei ist
verschlüsselt“. Kennwort berechnet zeitbasierte Einmalcodes (TOTP). Codes anderer Art – HOTP mit
Zähler, Steam, mOTP, Yandex – und Codes mit Einstellungen außerhalb dieser Grenzen übernimmt es
nicht; die Vorschau sagt, wie viele das sind, damit du sie beim Dienst neu einrichten kannst.

Den Inhalt von Googles QR-Codes liest Kennwort selbst, ohne weitere Bibliothek: Er ist ein
Protocol-Buffers-Datensatz (`MigrationPayload`, wie ihn Aegis dokumentiert), den ein kleiner Leser
in einem Durchgang ohne Rekursion entschlüsselt und der jede Länge prüft. Wie die Exportdatei
bleiben auch die QR-Codes und Links auf dem Gerät; lösche danach die Screenshots.

## Was aus einem Eintrag wird

- **Felder**: Benutzername, Passwort, Adresse und Einmalcode landen in den Feldern der Art, eine
  Kartennummer in „Kartennummer“, ein SSH-Schlüssel in „Privater Schlüssel“. Was die Art nicht
  kennt, wird ein eigenes Feld mit dem Namen aus der Datei; was der andere Manager geheim hielt,
  bleibt geheim. Eine zweite und dritte Adresse werden weitere Adressfelder.
- **Notizen** kommen in ein mehrzeiliges Feld am Ende. Ein Login, der nur aus einer Notiz besteht,
  wird eine Notiz.
- **Titel**: Fehlt er (Firefox), nimmt Kennwort die Adresse der Website, sonst den Benutzernamen.
- **Ordner und Sammlungen** merkt sich der Import zu jedem Eintrag, mit `/` zwischen den Ebenen;
  in der Vorschau werden sie auf Wunsch Tags (`Technik/Fernwartung`). Alle Einträge einer Datei
  kommen in einen Tresor; neue Tresore aus Ordnern legt der Import nicht an.
- **Tags** und **Favoriten** bleiben erhalten, frühere Passwörter kommen in den Verlauf des
  Eintrags, je Feld die zehn neuesten.
- Leere Felder lässt Kennwort weg, Zeilenumbrüche aus Windows-Dateien werden einheitlich.

## Kaputte Dateien

Eine Datei, die nicht passt, bricht den Import mit einer klaren Meldung ab: kein Text (kein
UTF-8), ein Anführungszeichen ohne Ende, kein gültiges JSON oder XML, andere Spalten als beim
gewählten Anbieter, ein verschlüsselter Export, fehlende QR-Codes eines Exports, ein ZIP, das beschädigt ist, in einer Form
gepackt, die Kennwort nicht liest, oder größer als jeder Export, oder eine KeePass-Datenbank, zu
der Passwort oder Schlüsseldatei nicht passen, die beschädigt oder zu alt ist oder deren
Schlüsselableitung die Grenzen sprengt, oder ein Bitwarden-Export, der kontobeschränkt ist, zu dem
das Export-Passwort nicht passt oder der verändert wurde. Absturz oder Hänger gibt es nicht: Die Leser
arbeiten in einem Durchgang ohne Rekursion, lehnen XML mit Dokumenttyp ab, damit keine Entität
wachsen kann, und werden mit zufälligen und zufällig beschädigten Dateien getestet.

### ZIP-Dateien

Die ZIP-Dateien entpackt Kennwort selbst, mit dem `DecompressionStream` des Browsers und ohne
weitere Bibliothek, nach PKWAREs Spezifikation (APPNOTE.TXT). Entpackt werden nur die Dateien, die
der Anbieter braucht – Anhänge nie. Kennwort traut keiner Zahl im ZIP:

- **Nicht gelesen** werden ZIP64, auf mehrere Datenträger verteilte und verschlüsselte ZIPs sowie
  andere Packverfahren als „gespeichert“ und „Deflate“; so packt kein Anbieter seinen Export.
- **Zip-Bomben** enden, bevor etwas entpackt wird: höchstens 10 000 Dateien im ZIP, höchstens
  64 MiB entpackt für die gelesenen Dateien zusammen und höchstens 1 : 200 gepackt – ein Export
  mit allen Einträgen eines Teams hat wenige Megabyte, Text packt Deflate weit weniger dicht.
- **Längen und Prüfsummen**: Jeder Versatz muss in der Datei liegen, das Entpacken stoppt, sobald
  mehr herauskommt als angegeben, und was herauskommt, muss Länge und CRC-32 haben, die das ZIP
  nennt.
- **Namen** dienen nur dem Finden einer Datei, nie als Pfad. Ein ZIP mit einem Namen, der aus
  seinem Ordner führt (`..`, `/` am Anfang, `\`, ein Laufwerksbuchstabe), oder mit einem Namen
  zweimal lehnt Kennwort trotzdem ab.

### KeePass-Datenbanken (KDBX)

Die Datenbank von KeePass 2 und KeePassXC – und den KDBX-Export von Passbolt – liest Kennwort
direkt, ohne Umweg über den XML-Export. Du wählst die `.kdbx`-Datei, gibst das Master-Passwort ein
und, wenn die Datenbank eine hat, die Schlüsseldatei. Hat sie nur eine Schlüsseldatei, bleibt das
Passwort leer.

- **Gelesen** wird KDBX 4 (4.0 und 4.1) mit AES-256 oder ChaCha20, die Schlüsselableitung mit
  Argon2d, Argon2id oder AES-KDF, gepackt oder nicht. Schlüsseldateien gehen in jeder Form, die
  KeePass kennt: die XML-Schlüsseldatei (Version 1.0 und 2.0, `.keyx`), 32 Bytes, 64 Hex-Zeichen
  oder jede andere Datei.
- **Nicht gelesen** werden KDBX 3.1 und älter, KeePass 1 (`.kdb`), Twofish und ein YubiKey als
  Teil des Schlüssels. Stelle die Datenbank vorher in KeePassXC oder KeePass in ihren
  Verschlüsselungseinstellungen auf KDBX 4 um und speichere sie, oder nimm den XML-Export.
- **Was mitkommt**, ist dasselbe wie beim XML-Export: Gruppen als Ordner, geschützte Felder als
  geheime Felder, Einmalcodes, weitere Adressen, Tags und frühere Passwörter; der Papierkorb und
  Anhänge bleiben draußen.
- **Prüfungen**: Kennwort liest jede Länge im Kopf der Datei nur so weit, wie die Datei reicht,
  prüft seine SHA-256-Prüfsumme und seinen HMAC und dann jeden HMAC-Block der verschlüsselten
  Daten. Ein falsches Passwort oder eine falsche Schlüsseldatei erkennt es am HMAC des Kopfs, eine
  geänderte oder abgeschnittene Datei an der Prüfsumme oder einem Block; entschlüsselt wird erst
  danach.
- **Grenzen**: Die Schlüsselableitung bestimmt die Datei, nicht Kennwort. Damit keine Datei das
  Gerät minutenlang rechnen lässt oder seinen Speicher füllt, liest Kennwort nur Argon2 mit
  höchstens 1 GiB Speicher, höchstens 100 Durchläufen, Speicher mal Durchläufe höchstens 8 GiB
  und höchstens 256 Lanes (Parallelität),
  AES-KDF mit höchstens 100 Millionen Runden und höchstens 64 MiB entpackte Daten. Die
  Voreinstellungen von KeePassXC und KeePass liegen weit darunter; das Entschlüsseln dauert dann
  wenige Sekunden. Eine Datenbank darüber endet mit einer Meldung, die die Grenzen nennt.
- **Passwort und Schlüssel**: Das Passwort steht nur im Feld, bis du „Datenbank öffnen“ wählst,
  dann leert Kennwort das Feld; gespeichert, protokolliert oder hochgeladen wird es nie. Die
  Bytes von Datenbank und Schlüsseldatei überschreibt Kennwort danach mit Nullen.

Die Bausteine – SHA-256, HMAC-SHA-256, Argon2, AES und ChaCha20 sowie Salsa20 für den inneren
Strom geschützter Felder – kommen aus den geprüften `@noble`-Bibliotheken, gekapselt in
`packages/crypto` und mit Testvektoren aus unabhängigen Implementierungen geprüft; das Entpacken
übernimmt der `DecompressionStream` des Browsers. Wie das Format aufgebaut ist, folgt dem Leser von
KeePassXC. Getestet wird mit Datenbanken aus KeePassXC 2.7.6 und pykeepass für jede Kombination
aus Verschlüsselung, Schlüsselableitung und Schlüsseldatei, mit falschen Passwörtern, geänderten
Bytes und zufällig beschädigten Dateien.

### Bitwardens verschlüsselter Export

Bitwarden exportiert als „.json (Verschlüsselt)“ auf zwei Arten, und Kennwort erkennt beide an der
Datei selbst; du wählst einfach „Bitwarden (JSON)“:

- **Passwortgeschützt** liest Kennwort. Nach der Datei fragt es nach dem Export-Passwort, das du
  beim Exportieren in Bitwarden festgelegt hast – nicht nach dem Master-Passwort. Danach geht es
  weiter wie beim unverschlüsselten JSON, mit allem, was dort mitkommt; das gilt auch für den
  Export einer Organisation.
- **Kontobeschränkt** ist mit dem Schlüssel deines Bitwarden-Kontos verschlüsselt und lässt sich
  nur in diesem Konto öffnen, auch von Kennwort nicht. Kennwort sagt das und bittet um einen neuen
  Export als „.json (Verschlüsselt)“ mit dem Exporttyp „Passwortgeschützt“ oder als „.json“.

So prüft Kennwort die Datei, nach Bitwardens eigenem Code (`bitwarden/clients` und
`bitwarden/sdk-internal`):

- **Schlüssel**: Aus Export-Passwort und Salz der Datei entsteht mit PBKDF2-SHA256 oder Argon2id
  ein Schlüssel, aus dem HKDF einen Schlüssel für AES-256-CBC und einen für HMAC-SHA256 macht.
- **Prüfungen**: Erst prüft Kennwort den HMAC des Prüfwerts `encKeyValidation_DO_NOT_EDIT` – passt
  er nicht, ist das Passwort falsch –, dann den HMAC des Inhalts; entschlüsselt wird erst danach.
  Ein Inhalt, dessen HMAC trotz richtigem Passwort nicht passt, wurde verändert. Verschlüsselte
  Werte ohne HMAC (Bitwardens alter Typ 0) liest Kennwort nicht.
- **Grenzen**: Die Schlüsselableitung bestimmt die Datei. Kennwort liest genau die Werte, die
  Bitwarden selbst importiert: PBKDF2 mit 5 000 bis 2 000 000 Iterationen, Argon2id mit 2 bis
  10 Durchläufen, 16 bis 1 024 MiB Speicher und 1 bis 16 Threads. Darunter schreibt kein Bitwarden
  einen Export; darüber endet die Datei, bevor gerechnet wird, mit einer Meldung, die die Grenzen
  nennt. Bitwardens Voreinstellungen (PBKDF2 mit 600 000 Iterationen, Argon2id mit 32 MiB, sechs
  Durchläufen und vier Threads) dauern wenige Sekunden.
- **Passwort**: Es steht nur im Feld, bis du „Export öffnen“ wählst, und wird nie gespeichert,
  protokolliert oder hochgeladen; Schlüssel und entschlüsselte Bytes überschreibt Kennwort danach
  mit Nullen.

Die Bausteine kommen wie bei KDBX aus `@noble`, gekapselt in `packages/crypto`. Geprüft wird mit
Bitwardens eigenen Testvektoren, mit Exporten, die ein unabhängiges Skript nach Bitwardens
Verfahren schreibt (PBKDF2 und Argon2id), mit Bitwardens eigenen Beispieldateien beider Arten, mit
falschen Passwörtern, geänderten Bytes und zufällig beschädigten Dateien.

## Export

Unter **Einstellungen → Exportieren** nimmst du einen Tresor oder alle Tresore, die dein Gerät
öffnet, aus Kennwort mit – zum Sichern, für einen Umzug oder für einen Prüfer.

- **Wer**: nur Inhaber und Admins der Firma. Mitglieder sehen den Punkt nicht; wer die Seite
  trotzdem aufruft, liest, dass nur Inhaber und Admins exportieren dürfen.
- **Audit-Log zuerst**: Bevor ein einziger Eintrag in eine Datei kommt, signiert dein Gerät ein
  Ereignis `export` mit Umfang und Format ins [Audit-Log](sicherheitsdesign.md#p-20-audit-log),
  und der Server muss es annehmen; er nimmt es nur von Inhabern und Admins. Ohne Eintrag – etwa
  offline – gibt es keinen Export. So steht jeder Export mit wer, was und wann im Log.
- **Nur auf dem Gerät**: Die Datei entsteht im Browser und geht direkt in den Download; die
  Adresse der Datei widerruft Kennwort sofort nach dem Klick, die Bytes überschreibt es mit
  Nullen. Zum Server geht nichts außer dem Audit-Ereignis, weder ein Eintrag noch die Passphrase.
- **Passphrase**: Das verschlüsselte JSON und die KDBX-Datei schützt eine Passphrase mit
  mindestens 12 Zeichen, die du zweimal eingibst. Kennwort merkt sie sich nicht; die Felder sind
  leer, sobald du „Exportieren“ wählst. Ohne sie öffnet niemand die Datei, auch Kennwort nicht.

### Formate des Exports

| Format | Für | Was drin ist | Schutz |
| --- | --- | --- | --- |
| Verschlüsseltes JSON (empfohlen) | Kennwort selbst, als Sicherung oder für eine andere Installation | jeder Eintrag, wie er gespeichert ist: alle Arten und Felder, Verlauf, Tags, Favoriten, Einmalcodes und Passkeys; je Tresor sein Name | Argon2id und XChaCha20-Poly1305 ([F-13](sicherheitsdesign.md#f-13-verschlusselter-export-v1)) |
| KeePass (KDBX 4) | KeePass 2, KeePassXC und alles, was KDBX liest | eine Gruppe je Tresor; Titel, Benutzername, Passwort, Adresse, Notizen, Einmalcode (`otp`), weitere Adressen (`KP2A_URL`), jedes andere Feld unter seinem Namen, geheime Felder geschützt, Tags und frühere Passwörter | Argon2id (64 MiB, 3 Durchläufe) und ChaCha20 |
| CSV im Bitwarden-Format | andere Passwortmanager (Bitwarden, Vaultwarden, Proton Pass und alle, die Bitwardens CSV lesen) | Spalten `folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp`; der Ordner ist der Tresor, eigene Felder stehen als `Name: Wert` in `fields` | **keiner** |

**Die CSV-Datei ist nicht verschlüsselt.** Jeder, der sie öffnet, sieht alle Passwörter,
Einmalcodes und Notizen; Kennwort warnt deshalb deutlich und will es bestätigt haben. Lade sie
gleich in den anderen Manager und lösche sie danach, auch aus Downloads und Papierkorb. Öffne sie
nicht in einer Tabellenkalkulation: Kennwort schreibt jeden Wert so, wie er ist, auch ein
Passwort, das mit `=` beginnt, damit es beim Umzug gleich bleibt – eine Tabellenkalkulation
könnte so etwas als Formel lesen.

Was CSV und KDBX nicht kennen, geht unterwegs verloren oder ändert seine Form: Beide kennen keine
Arten, eine Karte oder ein SSH-Schlüssel wird ein Login mit eigenen Feldern. Bitwardens CSV kennt
nur Logins und Notizen und eigene Felder nur auf einer Zeile; ein Feld über mehrere Zeilen (ein
privater Schlüssel) oder mit `: ` im Wert kommt deshalb mit seinem Namen in die Notizen. KDBX hat
keine Favoriten und einen Verlauf nur für das Passwort. Passkeys trägt nur das verschlüsselte
JSON. Für einen Umzug zu einer anderen Kennwort-Installation nimm deshalb immer das JSON.

### Wieder importieren

Das verschlüsselte JSON ist ein Format wie jedes andere unter **Importieren**: „Kennwort (JSON)“
wählen, die Datei und ihre Passphrase. Jeder Eintrag kommt so zurück, wie er war, mit allen
Feldern, Verlauf, Tags und Favoriten; der Name seines Tresors wird sein Ordner und auf Wunsch ein
Tag. Markierungen „Zum Ändern“ nach einem Austritt nimmt der Export nicht mit, sie nennen Personen
der alten Firma. Eine falsche Passphrase endet mit „Die Passphrase passt nicht zu diesem Export“,
ein Export einer neueren Version von Kennwort mit dem Hinweis, Kennwort zu aktualisieren. Auch
KDBX und CSV liest Kennwort wieder, über „KeePass / KeePassXC (KDBX)“ und „Bitwarden (CSV)“.

Die Datei des verschlüsselten Exports ist eine Zeile JSON, die sagt, was sie ist, und sonst nichts
im Klartext verrät:

```json
{"kennwort":"export","version":1,"data":"AW0Jv4yYw8HECDKOAwbr…"}
```

`data` ist der Geheimtext nach [F-13](sicherheitsdesign.md#f-13-verschlusselter-export-v1) in
Base64url. Wie beim Import prüft Kennwort Version und Länge, bevor es die Schlüsselableitung
rechnet; eine beschädigte oder fremde Datei endet mit einer Meldung, nie mit einem Absturz – das
Fuzzing prüft auch diesen Leser mit zufälligen und zufällig geänderten Dateien.

Die KDBX-Datei schreibt Kennwort nach dem Aufbau, den KeePassXC liest (`Kdbx4Writer.cpp`), mit
denselben Bausteinen aus `@noble` wie der Leser; getestet wird jeder Export mit Kennworts eigenem
Leser und, wo installiert, mit `keepassxc-cli`.
