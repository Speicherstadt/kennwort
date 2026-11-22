---
title: Import und Export
description: >-
  Wie du deine Zugänge aus einem anderen Passwortmanager, Browser, einer Tabelle oder einer
  Authenticator-App importierst – Anbieter, Vorschau, Duplikate, schwache Passwörter –, welche
  Exportdateien Kennwort liest, was daraus wird und wie die Datei auf dem Gerät bleibt.
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
   (siehe [KeePass-Datenbanken](#keepass-datenbanken-kdbx)). Passt die Datei nicht, sagt
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
| Bitwarden / Vaultwarden | JSON (Tresor oder Organisation) | alle Arten (Login, Notiz, Karte, Identität, SSH-Schlüssel), eigene Felder, Ordner bzw. Sammlungen, Favoriten, frühere Passwörter |
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

- **Verschlüsselte Exporte**: Bitwardens verschlüsseltes und passwortgeschütztes JSON, Proton
  Pass' PGP-Export. Kennwort erkennt sie und sagt, dass sie verschlüsselt sind.
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
Schlüsselableitung die Grenzen sprengt. Absturz oder Hänger gibt es nicht: Die Leser
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
  höchstens 1 GiB Speicher, höchstens 100 Durchläufen und Speicher mal Durchläufe höchstens 8 GiB,
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

## Export

Exportieren dürfen nur Verwalter eines Tresors, und es landet im Audit-Log. Der eigene Export ist
ein verschlüsseltes JSON mit eigener Passphrase; CSV und KDBX folgen ([Projektplan](plan.md)).
