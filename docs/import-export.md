---
title: Import und Export
description: >-
  Welche Exportdateien anderer Passwortmanager und Browser Kennwort liest, was daraus wird – Arten,
  Felder, Einmalcodes, Ordner, Favoriten, frühere Passwörter – und wie die Datei auf dem Gerät
  bleibt.
---

# Import und Export

Wer zu Kennwort wechselt, nimmt seine Zugänge mit: Logins, Notizen, Karten, Identitäten, WLAN und
SSH-Schlüssel, dazu Einmalcodes, mehrere Adressen, eigene Felder, Ordner, Favoriten und, wo die
Datei sie hat, frühere Passwörter.

Die Exportdatei liest Kennwort nur auf deinem Gerät. Sie wird nie hochgeladen; der Server bekommt
wie immer nur die fertig verschlüsselten Einträge.

!!! note "Stand"
    Kennwort liest die Formate unten bereits. Den Ablauf in der App – Anbieter wählen, Vorschau,
    Duplikate, Ordner als Tresore – bringt der nächste Schritt (K-501).

## Formate

| Von | Datei | Was mitkommt |
| --- | --- | --- |
| Bitwarden / Vaultwarden | JSON (Tresor oder Organisation) | alle Arten (Login, Notiz, Karte, Identität, SSH-Schlüssel), eigene Felder, Ordner bzw. Sammlungen, Favoriten, frühere Passwörter |
| Bitwarden / Vaultwarden | CSV (Tresor oder Organisation) | Logins und Notizen, eigene Felder, mehrere Adressen, Ordner bzw. Sammlungen, Favoriten |
| LastPass | CSV aus dem Web-Tresor | Logins, sichere Notizen, Kreditkarten, Adressen als Identität, andere Notiz-Arten mit ihren Feldern, Ordner und geteilte Ordner, Favoriten |
| 1Password | CSV (1Password 8) | Logins mit Einmalcode, Tags, Favoriten |
| KeePass / KeePassXC | KeePass-2-XML | Gruppen als Ordner, geschützte Felder als geheime Felder, Einmalcodes (KeePassXC und KeePass 2.47+), weitere Adressen, Tags, frühere Passwörter; der Papierkorb bleibt draußen |
| KeePassXC | CSV | Gruppen als Ordner, Einmalcodes; der Papierkorb bleibt draußen |
| KeePass 2 | CSV | Logins mit Notizen |
| Passbolt | CSV (KeePass-Layout) | Ordner, Einmalcodes |
| Dashlane | CSV (jede Datei aus dem ZIP einzeln) | Zugangsdaten mit Einmalcode und Kategorie, sichere Notizen, Karten und Bankkonten, Ausweise und persönliche Daten |
| Proton Pass | JSON (`data.json` aus dem ZIP) | alle Arten (Login, Alias, Karte, Notiz, Identität, SSH-Schlüssel, WLAN), eigene Felder und Abschnitte, Tresore als Ordner, Angeheftete als Favoriten; der Papierkorb bleibt draußen |
| Keeper | CSV | Ordner und geteilte Ordner, eigene Felder, Einmalcode |
| NordPass | CSV | Logins mit mehreren Adressen und eigenen Feldern, Karten, Identitäten, Notizen, Ordner |
| Enpass | JSON | Logins, Karten, Notizen, Identitäten, alle Felder, Ordner mit Unterordnern, Favoriten; der Papierkorb bleibt draußen |
| Chrome, Edge, Brave, Opera | CSV | Logins mit Notiz |
| Firefox | CSV | Logins; der Titel ist die Adresse |
| Safari / Apple Passwörter | CSV | Logins mit Notiz und Einmalcode |
| Beliebige Tabelle | CSV | du ordnest die Spalten zu: Titel, Benutzername, Passwort, Adresse, Einmalcode, Notizen, Ordner, Tags |

Noch nicht dabei und als eigene Teile geplant:

- **ZIP-Dateien**: 1Passwords 1PUX, Dashlane und Proton Pass als ganzes ZIP. Bis dahin liest
  Kennwort bei Dashlane und Proton Pass die Dateien aus dem ZIP.
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
  in der Vorschau werden daraus Tresore.
- **Tags** und **Favoriten** bleiben erhalten, frühere Passwörter kommen in den Verlauf des
  Eintrags.
- Leere Felder lässt Kennwort weg, Zeilenumbrüche aus Windows-Dateien werden einheitlich.

## Kaputte Dateien

Eine Datei, die nicht passt, bricht den Import mit einer klaren Meldung ab: kein Text (kein
UTF-8), ein Anführungszeichen ohne Ende, kein gültiges JSON oder XML, andere Spalten als beim
gewählten Anbieter, oder ein verschlüsselter Export. Absturz oder Hänger gibt es nicht: Die Leser
arbeiten in einem Durchgang ohne Rekursion, lehnen XML mit Dokumenttyp ab, damit keine Entität
wachsen kann, und werden mit zufälligen und zufällig beschädigten Dateien getestet.

## Export

Exportieren dürfen nur Verwalter eines Tresors, und es landet im Audit-Log. Der eigene Export ist
ein verschlüsseltes JSON mit eigener Passphrase; CSV und KDBX folgen ([Projektplan](plan.md)).
