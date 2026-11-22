---
title: Import und Export
description: >-
  Wie du deine Zugänge aus einem anderen Passwortmanager, Browser oder einer Tabelle importierst –
  Anbieter, Vorschau, Duplikate, schwache Passwörter –, welche Exportdateien Kennwort liest, was
  daraus wird und wie die Datei auf dem Gerät bleibt.
---

# Import und Export

Wer zu Kennwort wechselt, nimmt seine Zugänge mit: Logins, Notizen, Karten, Identitäten, WLAN und
SSH-Schlüssel, dazu Einmalcodes, mehrere Adressen, eigene Felder, Ordner, Favoriten und, wo die
Datei sie hat, frühere Passwörter.

Die Exportdatei liest Kennwort nur auf deinem Gerät. Sie wird nie hochgeladen; der Server bekommt
wie immer nur die fertig verschlüsselten Einträge.

## So importierst du

Unter **Einstellungen → Importieren**:

1. **Anbieter wählen**: jeder Manager und Browser aus der Tabelle unten oder „Andere Tabelle (CSV)“.
   Kennwort zeigt gleich, wo dort der Export ist.
2. **Datei wählen**: Kennwort liest sie auf dem Gerät; ein ZIP des Anbieters (1Passwords 1PUX,
   Dashlane, Proton Pass) wählst du, wie es ist, ohne es zu entpacken. Passt die Datei nicht, sagt
   Kennwort, warum – etwa „Diese Datei ist verschlüsselt – exportiere unverschlüsselt“ oder dass
   sie zu einem anderen Anbieter gehört.
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

Noch nicht dabei und als eigene Teile geplant:

- **KDBX 4**, die verschlüsselte Datenbank von KeePass und KeePassXC, auch aus Passbolt. Bis dahin
  geht der Weg über den XML-Export.
- **Verschlüsselte Exporte**: Bitwardens verschlüsseltes und passwortgeschütztes JSON, Proton
  Pass' PGP-Export. Kennwort erkennt sie und sagt, dass sie verschlüsselt sind.
- **Team Password Manager** und **FIDO Credential Exchange (CXF)**, sobald das Format stabil ist.

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
gewählten Anbieter, ein verschlüsselter Export, oder ein ZIP, das beschädigt ist, in einer Form
gepackt, die Kennwort nicht liest, oder größer als jeder Export. Absturz oder Hänger gibt es nicht: Die Leser
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

## Export

Exportieren dürfen nur Verwalter eines Tresors, und es landet im Audit-Log. Der eigene Export ist
ein verschlüsseltes JSON mit eigener Passphrase; CSV und KDBX folgen ([Projektplan](plan.md)).
