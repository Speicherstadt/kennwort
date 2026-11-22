---
title: Sicherheitsdesign
description: >-
  Wie Kennwort verschlüsselt: Bedrohungsmodell mit bösartigem Server, Schlüsselhierarchie, jedes
  Format mit Version und alle Protokolle von Konto bis Notfallzugriff – und was der Server sieht.
---

# Sicherheitsdesign

Dieses Dokument legt fest, wie Kennwort verschlüsselt, signiert und prüft. Es ist die Vorgabe für
`packages/crypto`, `packages/core` und den Sync: Code, der davon abweicht, ist ein Fehler, und eine
Änderung an einem Format braucht eine neue Formatversion und neue Testvektoren. Das Warum steht im
[Projektplan](plan.md); hier steht das Wie.

Die Leitidee: **Der Server ist nicht vertrauenswürdig.** Er speichert und verteilt nur Geheimtexte,
signierte Einträge und öffentliche Schlüssel. Alles, was über Zugriff entscheidet, prüft der Client
selbst.

## Bedrohungsmodell

### Wer angreift

| Angreifer | Kann | Kann nicht |
| --- | --- | --- |
| **Bösartiger Server** (gehackt, erpresst oder böswilliger Betreiber) | jede Antwort fälschen, weglassen, vertauschen, alte Antworten wiederholen, verschiedenen Clients Verschiedenes zeigen, Konten und Einladungen anlegen, Wartezeiten und Abruf-Grenzen ignorieren | Geheimtexte lesen oder unbemerkt ändern, Signaturen fälschen, Clients mit gültigen Schlüsseln Zugriff verschaffen |
| **Dieb der Datenbank** | alles lesen, was der Server speichert, und offline raten | eine Passphrase ohne den Secret Key raten |
| **Netzwerk** | mitlesen, wo TLS fehlt | mehr als der Server (TLS ist zusätzlich, nicht tragend) |
| **Phishing-Seite** | das Ausfüllen erbitten, Menüs überdecken | ausfüllen lassen ohne exakten Host-Treffer und Klick |
| **Ehemaliges Mitglied** | behalten, was es schon entschlüsselt hat | neue Einträge und neue Tresor-Schlüssel lesen |
| **Anmeldedienst (OIDC)** | Konten anlegen und Gruppen melden | entschlüsseln oder Zugriff geben; ein Gruppenwechsel ist nur eine Anfrage |

Außerhalb des Modells: Schadsoftware auf dem entsperrten Gerät, ein Angreifer mit dem entsperrten
Gerät in der Hand, eine kompromittierte Browser- oder Betriebssystem-Installation und die erste
Begegnung mit dem Firmen-Wurzelschlüssel (TOFU, siehe [P-07](#p-07-firmen-wurzelschlussel-und-zertifikate)).

### Angriffskatalog nach der ETH-Studie

Die Studie der ETH Zürich und der USI (Scarlata, Torrisi, Backendal, Paterson: „Zero Knowledge
(About) Encryption“, USENIX Security 2026) zeigt, wie ein bösartiger Server Bitwarden, LastPass,
Dashlane und 1Password angreift. Ihre Angriffe fallen in vier Klassen: Schlüsselhinterlegung
(Key Escrow) über Wiederherstellung, Organisationen und SSO; ungeprüfte öffentliche Schlüssel beim
Teilen; Schwächen der Verschlüsselung einzelner Einträge (vertauschte Felder, verschobene
Geheimtexte, ungeschützte Metadaten); und Rückwärtskompatibilität, über die der Server alte,
schwächere Verfahren erzwingt.

Kennwort führt daraus einen eigenen Katalog mit 27 Angriffen, ergänzt um die Angriffe, die erst
durch Kennworts Funktionen möglich werden (Geräte-Freigabe, Einmal-Links, OIDC-Gruppen). Jedes
Protokoll unten nennt, welche es abwehrt; der bösartige Testserver (K-206, K-701) spielt jeden als
Test nach. Die Zuordnung zur Nummerierung der Studie trägt K-701 nach, sobald die Studie in der
Umgebung des Loops lesbar ist; die Klassen und Mechanismen hier folgen den veröffentlichten
Zusammenfassungen.

| Nr. | Klasse | Angriff des Servers |
| --- | --- | --- |
| E-01 | Key Escrow | meldet ein Konto heimlich bei einer Kontowiederherstellung an, deren Schlüssel er kennt |
| E-02 | Key Escrow | schreibt ein Konto in eine Firma oder Organisation ein, die er steuert, und lässt sich Schlüssel verpacken |
| E-03 | Key Escrow | gibt sich als SSO-Schlüsseldienst aus und liefert oder empfängt den Account Key |
| E-04 | Key Escrow | gewährt einem Angreifer Notfallzugriff oder verkürzt die Wartezeit |
| E-05 | Öffentliche Schlüssel | tauscht beim Teilen den öffentlichen Schlüssel eines Mitglieds gegen seinen eigenen |
| E-06 | Öffentliche Schlüssel | nimmt heimlich ein Mitglied in einen Tresor auf |
| E-07 | Öffentliche Schlüssel | lässt Einträge des Mitgliedschafts-Logs aus, vertauscht sie, schiebt unsignierte ein oder spielt einen alten Stand zurück |
| E-08 | Öffentliche Schlüssel | zeigt verschiedenen Mitgliedern verschiedene Logs (Gabelung) |
| E-09 | Öffentliche Schlüssel | registriert ein Gerät des Angreifers im Konto |
| E-10 | Öffentliche Schlüssel | tauscht den Firmen-Wurzelschlüssel oder den Firmen-Recovery-Schlüssel aus |
| E-11 | Einträge | vertauscht Felder innerhalb eines Eintrags (Passwort und Notiz, URL und Titel) |
| E-12 | Einträge | verschiebt Geheimtexte zwischen Einträgen oder Tresoren |
| E-13 | Einträge | spielt eine alte Version eines Eintrags zurück |
| E-14 | Einträge | liest oder ändert ungeschützte Metadaten, etwa die URL, damit auf seiner Domain ausgefüllt wird |
| E-15 | Einträge | löscht oder verbirgt Einträge unbemerkt |
| E-16 | Einträge | schiebt einen Eintrags- oder Tresor-Schlüssel unter, den er kennt, damit neue Daten damit verschlüsselt werden |
| E-17 | Rückwärtskompatibilität | erzwingt ein altes, nicht authentisiertes Verschlüsselungsformat |
| E-18 | Rückwärtskompatibilität | senkt die Parameter der Schlüsselableitung, um die Passphrase leichter zu raten |
| E-19 | Rückwärtskompatibilität | erzwingt eine alte Protokollversion, etwa eine ohne Signaturprüfung |
| E-20 | Teilen nach außen | liest einen Einmal-Link oder ruft ihn öfter ab als erlaubt |
| E-21 | Teilen nach außen | schiebt bei Import oder Export Einträge unter oder liest sie mit |
| E-22 | Ausgelieferter Code | liefert eine manipulierte Web-App aus |
| E-23 | Nachvollziehbarkeit | fälscht oder kürzt das Audit-Log |
| E-24 | Anmeldung | greift beim Anmelden die Passphrase oder etwas ab, mit dem er sie raten kann |
| E-25 | Geräte | leitet die Freigabe eines neuen Geräts auf seinen eigenen Schlüssel um |
| E-26 | Austritt | gibt einem ausgetretenen Mitglied weiter Zugriff auf neue Daten |
| E-27 | Anmeldung | macht aus einem Gruppenwechsel beim Anmeldedienst einen Zugriff ohne Verwalter |

### Abdeckung des Projektplans

Jede Zeile des Bedrohungsmodells und jede Regel der Kryptografie aus dem Projektplan hat hier ein
Protokoll. Ein Test (`scripts/security-design.test.ts`) hält diese Tabelle mit dem Projektplan
gleich.

| Aus dem Projektplan | Protokolle | Angriffe |
| --- | --- | --- |
| Datenbank gestohlen | [P-01](#p-01-konto-anlegen), [P-03](#p-03-entsperren), [P-15](#p-15-was-der-server-sieht) | E-18, E-24 |
| Später mit Quantenrechner entschlüsseln | [F-02](#f-02-an-einen-offentlichen-schlussel-verpackt-v1), [P-05](#p-05-tresor-anlegen-und-mitglieder-aufnehmen) | – |
| Server nimmt heimlich jemanden in einen Tresor auf | [P-06](#p-06-mitgliedschafts-log) | E-06, E-07, E-08 |
| Server schiebt fremden öffentlichen Schlüssel unter | [P-07](#p-07-firmen-wurzelschlussel-und-zertifikate), [P-08](#p-08-einladung) | E-05, E-10 |
| Server vertauscht Einträge oder spielt alte Stände ein | [P-09](#p-09-eintrage-speichern-und-lesen) | E-11, E-12, E-13, E-14, E-15, E-16 |
| Server liefert manipulierte Web-App aus | [P-16](#p-16-ausgelieferter-code) | E-22 |
| Phishing-Seite will Autofill | [P-17](#p-17-ausfullen) | E-14 |
| Clickjacking auf das Autofill-Menü (DEF CON 2025) | [P-17](#p-17-ausfullen) | – |
| Supply-Chain im Client | [P-16](#p-16-ausgelieferter-code) | E-22 |
| SSO-Konto übernommen | [P-02](#p-02-anmelden), [P-03](#p-03-entsperren) | E-03, E-27 |
| Mitarbeiter verlässt Firma | [P-11](#p-11-austritt-und-schlusselwechsel) | E-26 |
| Malware auf dem Gerät | [P-03](#p-03-entsperren) (Sperren, Schlüssel nur im Speicher) | – |
| Passwort bleibt am Handy in der Zwischenablage | [P-17](#p-17-ausfullen) | – |
| Anmeldung durchprobieren | [P-02](#p-02-anmelden) | E-24 |
| AAD | [F-01](#f-01-geheimtext-v1), [P-09](#p-09-eintrage-speichern-und-lesen) | E-11, E-12, E-13 |
| Signiertes Mitgliedschafts-Log | [P-06](#p-06-mitgliedschafts-log) | E-06, E-07, E-08 |
| Firmen-Wurzelschlüssel | [P-07](#p-07-firmen-wurzelschlussel-und-zertifikate) | E-02, E-05, E-10 |
| Austritt | [P-11](#p-11-austritt-und-schlusselwechsel) | E-26 |
| Neues Gerät | [P-04](#p-04-neues-gerat) | E-09, E-25 |
| Login per Passkey/SSO | [P-02](#p-02-anmelden) | E-24, E-27 |
| Symmetrisch | [F-01](#f-01-geheimtext-v1) | E-17 |
| Schlüssel verpacken | [F-02](#f-02-an-einen-offentlichen-schlussel-verpackt-v1) | E-05, E-16 |
| Signaturen | [F-03](#f-03-signatur-v1) | E-07, E-19 |
| Passphrase | [F-05](#f-05-ableitung-aus-der-passphrase-v1), [P-03](#p-03-entsperren) | E-18 |
| Entsperren | [P-03](#p-03-entsperren) | E-03 |
| Ableitung | [F-04](#f-04-kodierung-und-ableitung) | – |

### Angriffe als Tests

Ein Testserver, der gezielt lügt (`packages/core/src/adversary/`), spielt die Angriffe nach: Er
legt sich um einen ehrlichen Server oder um `fetch` und ändert, was dieser antwortet. Jeder Test
nennt seinen Angriff, und der Client muss ihn ablehnen und sagen, warum.

| Angriff | Wo | Was der Client meldet |
| --- | --- | --- |
| E-02 eigenes Konto über eine Einladung eingeschrieben | `adversary/eth.test.ts`, `membership/invitation.test.ts` | MAC passt nicht |
| E-05 fremder Schlüssel unter einem Mitglied | `adversary/eth.test.ts` | nicht zertifizierter Autor |
| E-06 Mitglied eingeschmuggelt | `adversary/eth.test.ts`, `membership/verify-log.test.ts` | kein Verwalter, falsche Signatur |
| E-07 Log gekürzt, umsortiert, zurückgespielt | `adversary/eth.test.ts`, `membership/verify-log.test.ts`; älterer Kontozustand nach der Offline-Kopie: `apps/web/src/session/offline-unlock.test.ts` | Lücke, Rückfall |
| E-08 Gabelung | `membership/verify-log.test.ts` | Gabelung |
| E-10 anderer Wurzelschlüssel | `adversary/eth.test.ts` | nicht zertifizierter Unterzeichner |
| E-12 Geheimtexte vertauscht oder verschoben | `adversary/eth.test.ts`, `apps/server/src/adversary/` | falsche Signatur, anderer Tresor |
| E-13 alte Version | `adversary/eth.test.ts`, `apps/server/src/adversary/`, gegen die Offline-Kopie `apps/web/src/entries/entry-store-offline.test.ts` | Rückfall |
| E-15 Eintrag verborgen | `adversary/eth.test.ts`, `apps/server/src/adversary/`, gegen die Offline-Kopie `apps/web/src/entries/entry-store-offline.test.ts` | fehlt |
| E-16 untergeschobener Eintrags-Schlüssel | `adversary/eth.test.ts` | falsche Signatur |
| E-17, E-19 altes Format, alte Signatur | `adversary/eth.test.ts` | falsche Signatur |
| E-23 Audit-Log gefälscht oder gekürzt | `audit/chain.test.ts`, `apps/server/src/audit/` | siehe [P-20](#p-20-audit-log) |
| E-22 manipulierte Web-App ausgeliefert | `apps/web/src/sw/worker.test.ts`, `worker.review.test.ts`, `server-paths.test.ts`, `e2e/pwa.spec.ts` | falscher Hash, falsche Signatur, fehlende Datei, älteres Release; fremde Seite unter `/api` nur als Text |
| E-24 Passphrase abgegriffen | `apps/server/src/auth/` | – (der Server bekommt sie nie) |
| E-26 Schlüsselwechsel zurückgehalten (Log ohne Wechsel, neuer Schlüssel fehlt) | `adversary/exit.test.ts`, `membership/rotation.test.ts` | Wechsel steht aus, Schlüssel zurückgehalten, neuere Epoche, alter Schlüssel |
| E-26 alter Schlüssel für das ausgetretene Mitglied | `adversary/exit.test.ts`, `apps/server/src/sync/rotation-routes.test.ts` | neuere Epoche, falsche Epoche, kein Bearbeiter |
| E-16 alter Tresor-Schlüssel als neuer ausgegeben | `adversary/exit.test.ts` | Bindung passt nicht |
| E-07 Log auf vor den Austritt zurückgespielt | `adversary/exit.test.ts` | Rückfall, neuere Epoche, unbekannte Epoche |
| E-04 Notfall-Pakete vor der Wartezeit oder nach einem Widerspruch herausgegeben | `adversary/emergency.test.ts`, `packages/client/src/emergency/emergency.test.ts` | Wartezeit läuft, widersprochen, nicht die eigene Anfrage |
| E-05 vertauschter Schlüssel der Vertrauensperson | `adversary/emergency.test.ts`, `apps/server/src/account/emergency.test.ts` | nicht für mich |
| E-16 gefälschte Bindung, Schlüssel ohne Bindung im Log | `adversary/emergency.test.ts`, `membership/emergency-open.test.ts` | falsche Signatur, nicht im Log, Bindung passt nicht |
| E-04 alte Freigabe nach einer Rücknahme zurückgespielt | `adversary/emergency.test.ts`, `packages/client/src/emergency/emergency.test.ts` | wiederholt |
| E-08, E-26 Mitglied vom Wechsel ferngehalten, seine Versionen unter dem alten Schlüssel nach dem Wechsel ausgeliefert | `adversary/epoch-order.test.ts`, gegen die Offline-Kopie `apps/web/src/offline/local-copy.test.ts` | ältere Epoche, kein Bearbeiter |

Die übrigen folgen mit den Funktionen, die sie betreffen (Konto-Recovery, Teilen, Geräte, Austritt,
Einmal-Links, Import und Export, ausgelieferter Code); K-701 schließt den Katalog. Beim Bau des
Testservers fiel auf, dass der Client das Zertifikat eines Autors nicht gegen den
Firmen-Wurzelschlüssel und das Log prüfte; das ist behoben (E-05).

## Bausteine

Nur standardisierte Verfahren aus `@noble/*`, nichts selbst gebaut:

| Zweck | Verfahren | Quelle | Bibliothek |
| --- | --- | --- | --- |
| Symmetrisch | XChaCha20-Poly1305, 256-Bit-Schlüssel, 192-Bit-Nonce | RFC 8439, draft-irtf-cfrg-xchacha | `@noble/ciphers` |
| Hybrid-KEM | X-Wing: X25519 + ML-KEM-768 | draft-connolly-cfrg-xwing-kem, FIPS 203 | `@noble/post-quantum` |
| Signaturen | Ed25519 | RFC 8032 | `@noble/curves` |
| Ableitung | HKDF-SHA-512 | RFC 5869 | `@noble/hashes` |
| Passphrase, Phishing-Warnung | Argon2id | RFC 9106 | `@noble/hashes` |
| Hash | SHA-512, SHA-512/256; SHA-256 nur für Release-Manifeste (wie Subresource Integrity) | FIPS 180-4 | `@noble/hashes` |
| Zufall | `crypto.getRandomValues` | Web Crypto | über `@noble/hashes/utils` |

## Formate

Jedes Format beginnt mit einem Byte für seine Version. Ein Client liest nur Versionen, die er
kennt, und fällt nie auf eine ältere zurück, weil der Server es verlangt: Eine unbekannte oder
abgekündigte Version ist ein Fehler, keine Einladung zum Ausweichen (E-17, E-19). Neue Versionen
kommen mit neuen Testvektoren; alte bleiben lesbar, bis ein Client sie beim nächsten Schreiben in
die neue überführt.

### F-04 Kodierung und Ableitung

- **Kodierung** `enc(t₁, …, tₙ)`: jedes Teil als 4-Byte-Länge (Big Endian) und seine Bytes.
  Zeichenketten als UTF-8 in NFC (nur wohlgeformte; ein einzelnes Surrogat ist ein Fehler), Zahlen als 8 Byte Big Endian, IDs als ihre 16 Bytes (UUIDv7).
  So ist jede Folge von Teilen eindeutig und kein Teil kann in ein anderes überlaufen.
- **Kontext**: Jede Verwendung trägt eine Bezeichnung `kennwort/<zweck>/v<n>` als erstes Teil;
  derselbe Schlüssel in zwei Zwecken ergibt nie dieselbe Eingabe.
- **Ableitung**: `kdf(ikm, salt, zweck, …) = HKDF-SHA-512(ikm, salt, info = enc(zweck, …), L = 32)`.
- **Fingerabdruck** eines öffentlichen Schlüsselbündels: `SHA-512/256(enc("kennwort/fp/v1", xwingPk, edPk))`;
  angezeigt als Vergleichscode aus 12 Gruppen zu 5 Ziffern. Für Schlüssel, die allein stehen:
  Wurzelschlüssel `SHA-512/256(enc("kennwort/fp-root/v1", edPk))`, Firmen-Recovery-Schlüssel
  `SHA-512/256(enc("kennwort/fp-recovery/v1", xwingPk))`.

### F-01 Geheimtext v1

```text
0x01 ‖ nonce (24 Byte, zufällig) ‖ XChaCha20-Poly1305(schlüssel, nonce, klartext, aad) (n + 16 Byte)
aad = enc("kennwort/box/v1", zweck, kontext₁, …, kontextₙ)
```

Der Kontext bindet den Geheimtext an seinen Ort: bei einem Eintrag Tresor-ID, Eintrags-ID und
Version, bei einem verpackten Schlüssel die IDs von Besitzer und Ziel. Ein Geheimtext, der an einen
anderen Ort geschoben wird, lässt sich dort nicht entschlüsseln (E-11, E-12, E-13). Das Versions-Byte
steht in der Bezeichnung der AAD; ein umgeschriebenes Byte scheitert an der Prüfung.

Umgesetzt in `packages/crypto/src/box.ts`; die Testvektoren in `packages/crypto/vectors/box-v1.json`
rechnet libsodium aus, nicht der Code, den sie prüfen.

### F-02 An einen öffentlichen Schlüssel verpackt v1

```text
(ss, ct) = X-Wing.Encaps(pkₓ)                       ct: 1120 Byte, ss: 32 Byte
k        = kdf(ss, leer, "kennwort/wrap/v1", fp(empfänger), zweck, kontext…)
paket    = 0x01 ‖ ct ‖ F-01-Geheimtext(k, nutzlast, zweck = "wrap", kontext = fp(empfänger), zweck, kontext…)
```

X-Wing bindet das gemeinsame Geheimnis an Geheimtext und öffentlichen Schlüssel; der Fingerabdruck
des Empfängers in Ableitung und AAD bindet das Paket zusätzlich an das ganze Schlüsselbündel. Damit
ist die Verpackung so sicher wie der stärkere der beiden Teile: X25519 heute, ML-KEM-768 gegen einen
späteren Quantenrechner. Wer verpackt, nimmt den öffentlichen Schlüssel nur aus einem geprüften
Zertifikat ([P-07](#p-07-firmen-wurzelschlussel-und-zertifikate)), nie roh vom Server (E-05).
Umgesetzt in `packages/crypto/src/wrap.ts`; die Testvektoren in `packages/crypto/vectors/wrap-v1.json`
entstehen ohne den Code, den sie prüfen (HKDF aus `node:crypto`, AEAD aus libsodium, X-Wing gegen die
Vektoren des Entwurfs geprüft).

F-02 sagt nichts darüber, **wer** verpackt hat: Mit einem öffentlichen Schlüssel kann jeder, auch der
Server, ein gültiges Paket bauen. Ein entpackter Schlüssel gilt deshalb erst, wenn er zu einer
**Bindung** passt, die ein Berechtigter signiert hat:

```text
bindung(schlüssel, zweck, kontext…) = kdf(schlüssel, leer, "kennwort/key-commit/v1", zweck, kontext…)
```

Die Bindung verrät den Schlüssel nicht (HKDF ist eine Einwegfunktion) und steht im signierten
Log-Eintrag, in der signierten Freigabe, in der signierten Notfall-Freigabe (F-09) oder in der signierten
Firmen-Recovery-Hinterlegung (F-08). Ein Paket ohne passende signierte Bindung wird verworfen (E-16).
Zwei Fälle prüfen anders:

- **Private Schlüssel** (Firmen-Wurzelschlüssel, Firmen-Recovery-Schlüssel): Der öffentliche
  Schlüssel ist die Bindung seines privaten. Der Client leitet ihn aus dem entpackten privaten
  Schlüssel ab und vergleicht ihn mit dem gemerkten Wurzel-Fingerabdruck aus dem Schlüsselblock bzw.
  mit dem Fingerabdruck des Recovery-Schlüssels in der vom Wurzelschlüssel signierten Richtlinie.
- **Das Paket an ein neues Gerät** ([P-04](#p-04-neues-gerat)), auch das der Firmen-Recovery
  ([P-13](#p-13-firmen-recovery)): Dort prüfen der QR-Code und der Vergleichscode auf beiden Geräten,
  wer verpackt hat.

### F-03 Signatur v1

```text
signatur = 0x01 ‖ Ed25519.Sign(sk, enc("kennwort/sig/v1", zweck, feld₁, …, feldₙ))   64 Byte + 1
```

Jede Signatur nennt ihren Zweck; eine Signatur für einen Log-Eintrag gilt nie als Zertifikat oder
umgekehrt. Geprüft wird streng nach RFC 8032 (kanonisches S, kein Punkt kleiner Ordnung).

### F-05 Ableitung aus der Passphrase v1

```text
parameter  = Argon2id, m = 64 MiB, t = 3, p = 1, 32 Byte Ausgabe          (fest in v1)
p₁         = Argon2id(NFKC(passphrase), salt = kontoSalt (16 Byte, zufällig je Konto))
entsperren = kdf(p₁, secretKey (16 Byte), "kennwort/unlock-passphrase/v1", konto-ID)
anmelden   = kdf(p₁, secretKey (16 Byte), "kennwort/login/v1", konto-ID)
```

Die Konto-ID geht hier als ihre 16 Byte ein, nicht als ihr Base64url-Text, unter dem der Server sie
führt; nur die Signatur der Anmeldung nennt den Text, so wie der Server ihn prüft.

Die Parameter gehören zur Formatversion und stehen nicht in der Datenbank; der Server kann sie
nicht senken (E-18). Stärkere Parameter heißen v2. Das Salt ist genau 16 Byte, wie libsodium
(`crypto_pwhash`) es verlangt; so lassen sich die Testvektoren unabhängig nachrechnen. Der
**Secret Key** sind 128 zufällige Bits, die nur auf den Geräten und im Recovery-Kit liegen, angezeigt als `K1-` und 26 Zeichen Crockford-Base32
mit Prüfziffer. Ohne ihn ist eine gestohlene Datenbank auch mit schwacher Passphrase nicht zu raten.

### F-06 Schlüsselbündel und Zertifikat v1

```text
bündel     = enc("kennwort/bundle/v1", konto-ID, xwingPk (1216 Byte), edPk (32 Byte))
zertifikat = enc(bündel, firmen-ID, rolle, ausgestellt-am) ‖ F-03-Signatur(wurzel, "certificate", …)
```

### F-07 Firmen-Richtlinie v1

```text
richtlinie = enc("kennwort/policy/v1", firmen-ID, version, sperren-nach-minuten,
                 recovery (0 oder 1), fingerabdruck des recovery-schlüssels oder leer)
signatur   = F-03(wurzel, "policy", richtlinie)
```

Die Version zählt von 1 an hoch; ohne Richtlinie gilt die Standardregel (zehn Minuten,
Firmen-Recovery aus). Sperren nach 1 bis 60 Minuten. Der Fingerabdruck steht nur bei Recovery an.

### F-08 Firmen-Recovery-Hinterlegung v1

```text
paket    = F-02(recovery-schlüssel, AK, zweck "company", kontext konto-ID)
bindung  = bindung(AK, "company", konto-ID)
signatur = F-03(konto, "company-deposit",
                enc("kennwort/deposit/v1", firmen-ID, konto-ID, fp(recovery-schlüssel), bindung, paket))
```

Die Signatur des Kontos deckt Firma, Konto, den Fingerabdruck des Recovery-Schlüssels, die Bindung
und das Paket selbst: Eine Hinterlegung für einen früheren Schlüssel, ein vom Server getauschtes
Paket oder eine, die der Server ganz erfunden hat, besteht die Prüfung weder beim Inhaber noch beim
Konto selbst. Umgesetzt in `packages/crypto/src/company-recovery.ts`; die Testvektoren in
`packages/crypto/vectors/deposit-v1.json` entstehen ohne den Code, den sie prüfen (HKDF und
SHA-512/256 aus `node:crypto`, AEAD und Ed25519 aus libsodium, X-Wing gegen die Vektoren des Entwurfs
geprüft). Die beiden anderen Verpackungen der Firmen-Recovery – der Recovery-Schlüssel an einen
Inhaber (Zweck `company-recovery-key`) und AK an das neue Gerät (Zweck `recovery-device`) – sind
F-02 und stehen mit eigenen Vektoren in `wrap-v1.json`.

### F-09 Notfall-Freigabe v1

```text
ansehen:     paket    = F-02(person, VKₑ, zweck "emergency", kontext tresor-ID, epoche, geber-ID, person-ID)
             bindung  = bindung(VKₑ, "vault-key", tresor-ID, epoche)      (dieselbe wie im Log, P-06)
vollzugriff: paket    = F-02(person, AK, zweck "emergency-account", kontext geber-ID, person-ID)
             bindung  = bindung(AK, "emergency-account", geber-ID)
freigabe  = enc("kennwort/emergency/v1", firmen-ID, geber-ID, person-ID, fp(person), umfang
                ("view" oder "full"), wartezeit (sekunden), zeit, bindung von AK oder leer,
                enc(enc(tresor-ID, epoche, bindung)…))
signatur  = F-03(geber, "emergency", freigabe)
digest    = SHA-512/256(freigabe)
aussage   = F-03(wer, zweck, enc("kennwort/emergency-statement/v1", firmen-ID, geber-ID, person-ID,
                 zeit der freigabe, digest, zeit))
            zweck: emergency-request (person, zeit der anfrage), emergency-objection und
            emergency-approval (geber, zeit der anfrage), emergency-revocation (geber, zeit der freigabe)
```

Jede Aussage nennt die Freigabe, um die es geht, mit ihrer Zeit und ihrem Digest; auf dem Draht
trägt sie beide mit. So lässt sich keine Aussage gegen eine andere Freigabe desselben Paars
abspielen: Eine Anfrage und eine frühere Freigabe zum Ansehen öffnen keinen späteren Vollzugriff,
und eine Anfrage, der widersprochen wurde, gilt für keine neue Freigabe. Der Digest beginnt mit der
Kennung der Freigabe und gleicht so nie einem Fingerabdruck (F-04).

Die Signatur deckt die Bindungen, nicht die Pakete: So prüft die Person die Freigabe, bevor der
Server die Pakete herausgibt, und jedes Paket danach an seiner Bindung. Geber und Person stehen im
Kontext jedes Pakets; ein Paket für ein anderes Paar öffnet sich nicht. Umgesetzt in
`packages/crypto/src/emergency.ts`; die Testvektoren in `packages/crypto/vectors/emergency-v1.json`
entstehen ohne den Code, den sie prüfen (HKDF und SHA-512/256 aus `node:crypto`, AEAD und Ed25519 aus
libsodium, X-Wing gegen die Vektoren des Entwurfs geprüft).

### F-10 Phishing-Warnung v1

```text
parameter = Argon2id, m = 1 MiB, t = 2, p = 1, 4 Byte Ausgabe                   (fest in v1)
salt      = 16 zufällige Byte, neu bei jedem Entsperren
tag       = Argon2id(UTF-8(passwort, wie getippt), salt)
host-tag  = kdf(salt, "", "kennwort/alert-host/v1", host)[0..16)
```

Die kurzen Hashes, mit denen die Extension ein eingetipptes Passwort mit den gespeicherten
vergleicht, ohne dass ein Passwort im Klartext zwischen Seite und Extension wandert
([P-17](#p-17-ausfullen), K-405). Das Passwort geht so ein, wie es im Feld steht, ohne
Normalisierung: Nur derselbe Wert soll passen. Der Host ist der exakte Host aus `tldts`; der
Host-Tag ist ein mit dem Salt geschlüsselter Hash (HKDF), damit der Sitzungsbereich keinen Host im
Klartext hält. Umgesetzt in `packages/crypto/src/password-alert.ts`; die Testvektoren in
`packages/crypto/vectors/password-alert-v1.json` entstehen ohne den Code, den sie prüfen (Argon2id
und HKDF aus `node:crypto`).

## Schlüsselhierarchie

```text
Passkey (PRF) ──────────────┐
Passphrase + Secret Key ────┼─► Account Key AK (256 Bit, zufällig)
Recovery-Kit ───────────────┤        │  verschlüsselt (F-01)
Firmen-Recovery (F-02) ─────┘        ├─► X-Wing-Schlüssel des Benutzers
                                     └─► Ed25519-Schlüssel des Benutzers
Tresor-Schlüssel VKₑ (je Epoche e) ◄── pro Mitglied an dessen X-Wing-Schlüssel verpackt (F-02)
      │  verschlüsselt (F-01)
Eintrags-Schlüssel EK ─► Eintrag (alle Felder in einem Geheimtext, F-01)
```

| Schlüssel | Entsteht | Liegt verschlüsselt | Kontext (AAD) |
| --- | --- | --- | --- |
| AK | zufällig beim Konto | unter jedem Entsperr-Weg | Konto-ID, Weg (`passkey`, `passphrase`, `recovery`, `company`), bei Passkeys die Credential-ID |
| Schlüsselblock: Benutzer-Schlüssel und Fingerabdruck des Firmen-Wurzelschlüssels | beim Konto | unter AK | Konto-ID |
| VKₑ | zufällig beim Anlegen und bei jedem Schlüsselwechsel | an jedes Mitglied verpackt; seine Bindung steht im signierten Log | Tresor-ID, Epoche, Konto-ID des Mitglieds |
| EK | zufällig je Eintrag und neu bei jedem Schlüsselwechsel | unter VKₑ | Tresor-ID, Eintrags-ID, Epoche |
| Inhalt | – | unter EK | Tresor-ID, Eintrags-ID, Version |

Umgesetzt in `packages/crypto/src/account.ts` (AK, Schlüsselblock, Entsperr-Wege),
`vault.ts` (Tresor- und Eintrags-Schlüssel, Inhalt mit Auffüllen auf 256 Byte),
`commitment.ts` (Bindungen), `company-recovery.ts` (P-13) und `emergency.ts` (P-14).

Was ein Client sich merkt, um den Server zu prüfen, liegt im **Kontozustand**: Fingerabdruck des
Firmen-Wurzelschlüssels, bekannte Schlüsselbündel, der letzte Stand jedes Mitgliedschafts-Logs,
die höchste Version jedes Eintrags, die Einladungen, die das Konto zertifiziert hat, mit dem Konto
dazu, je Konto das Ausstellungsdatum des neuesten Zertifikats, das es gesehen hat, und die
höchste Version der Firmen-Richtlinie mit ihrer Sperrzeit; dazu, keine Prüfung, sondern eine
Einstellung, die auf keinem Gerät auf die Festplatte soll: die Hosts, für die die Extension nie das
Speichern anbietet (K-404, P-17). Er ist ein F-01-Geheimtext unter AK (Zweck `account-state`,
Kontext Konto-ID und ein Zähler) auf dem Server; jedes Gerät lädt ihn beim Entsperren, führt ihn
mit seinem eigenen Stand zusammen (der höhere Stand gewinnt; ein anderer Wurzelschlüssel, ein anderes
Bündel für ein bekanntes Konto oder ein anderer Hash an derselben Stelle eines Logs ist ein Angriff) und schreibt ihn mit höherem Zähler zurück. So kennt jedes Gerät eines Kontos, auch eines,
das mit Passphrase oder Recovery-Kit entsperrt, was das erste Gerät geprüft hat. P-01 legt den
ersten Kontozustand (Zähler 0) an, bevor das Konto benutzbar ist; fehlt er später, warnt der Client
und behandelt das als Angriff, nicht als neues Konto. Spielt der Server einen älteren Kontozustand
zurück, verliert ein neues Gerät höchstens Stände, die jünger sind als dieser.

Der **Fingerabdruck des Firmen-Wurzelschlüssels** steht zusätzlich im **Schlüsselblock**, dem
Geheimtext unter AK mit den privaten Schlüsseln des Benutzers. Ohne Schlüsselblock kann kein Gerät
etwas entschlüsseln; der Server kann ihn also nicht weglassen, und jedes Gerät, das AK hat – über
Passkey, Passphrase, Recovery-Kit, neues Gerät oder Firmen-Recovery –, hat damit auch den geprüften
Wurzelschlüssel.

Entsperrte Schlüssel liegen nur im Speicher (in der Extension in `chrome.storage.session`), nie in
`localStorage`, IndexedDB oder auf dem Server. In IndexedDB hält die Web-App nur ihre Offline-Kopie
aus Geheimtexten ([P-22](#p-22-offline-kopie)).

## Protokolle

Jedes Protokoll nennt, welche Angriffe des Katalogs es abwehrt. „Restrisiko“ nennt ehrlich, was
bleibt.

### P-01 Konto anlegen

1. Der Client erzeugt AK, Secret Key, Konto-Salt, X-Wing- und Ed25519-Schlüssel.
2. Er verschlüsselt den Schlüsselblock (private Schlüssel und den Fingerabdruck des
   Wurzelschlüssels aus der Einladung, [P-08](#p-08-einladung); beim Inhaber den eigenen) und den
   ersten Kontozustand unter AK (F-01) und AK unter jedem Entsperr-Weg
   ([P-03](#p-03-entsperren)).
3. Er erzeugt das Recovery-Kit ([P-12](#p-12-recovery-kit)) und lässt es sichern, bevor das Konto
   benutzbar ist.
4. Zum Server gehen nur: Konto-ID, Konto-Salt, die Geheimtexte (Schlüsselblock, Kontozustand,
   verpackter AK), das Schlüsselbündel (F-06) und der öffentliche Anmelde-Schlüssel
   ([P-02](#p-02-anmelden)).

Die Firma legt der erste Inhaber an: mit dem Einrichtungs-Code, den der Betreiber in den
Einstellungen des Servers setzt (`KENNWORT_SETUP_CODE`, mindestens 16 Zeichen, nie im Log). Der Code
gilt für jede neue Firma, sodass ein Betreiber viele Firmen anlegen kann (Projektplan,
Entscheidungen); eine bestehende Firma öffnet er nie: Eine Firmen-ID, die es schon gibt, lehnt der
Server ab. Firmen-ID, Konto und Wurzelschlüssel entstehen auf dem Gerät; der
private Wurzelschlüssel liegt im Kontozustand des Inhabers, weitere Inhaber bekommen ihn verpackt
(K-304). Sein Zertifikat signiert der Inhaber selbst mit dem neuen Wurzelschlüssel. Der Server nimmt
die Geheimtexte einmal an und den Kontozustand danach nur mit dem nächsten Zähler.

Umgesetzt in `packages/core/src/account/` (anlegen, Kontozustand mit Zusammenführen, entsperren mit
Passphrase und Recovery Key), `apps/server/src/account/`, `apps/server/src/auth/setup.ts` und in der
Web-App in `apps/web/src/session/` und `apps/web/src/account/`; Anmelden und Entsperren mit der
Passphrase und die Aufrufe des Servers teilen Web-App und Extension in `packages/client/src/session/`.

**Wehrt ab:** E-10, E-18, E-24.

### P-02 Anmelden

Anmelden (beim Server) und Entsperren (der Schlüssel) sind getrennt; Anmelden gibt nur Zugang zu
Geheimtexten.

- **Passkey** über Better Auth (WebAuthn); derselbe Passkey kann zugleich per PRF entsperren.
- **OpenID Connect**: Der Anmeldedienst bestätigt nur, wer jemand ist. Er entschlüsselt nichts; ein
  Gruppenwechsel erzeugt eine Zugriffsanfrage, die ein Verwalter freigibt
  ([P-05](#p-05-tresor-anlegen-und-mitglieder-aufnehmen)).
- **Notweg Passphrase**: Aus `anmelden` (F-05) wird ein Ed25519-Schlüssel; der Server kennt nur
  dessen öffentlichen Teil und schickt eine Herausforderung. Die Passphrase und `p₁` verlassen nie
  das Gerät; was der Server speichert, lässt sich ohne den Secret Key nicht raten.
- **Notweg Recovery Key** ([P-12](#p-12-recovery-kit)): Wer die Passphrase vergessen hat, hat auch
  den Schlüssel aus `anmelden` nicht. Darum gibt der Recovery Key einen eigenen Ed25519-Schlüssel:
  `kdf(recoveryKey, salt = leer, "kennwort/login-recovery/v1", konto-ID)`. Der Server kennt seinen
  öffentlichen Teil (hochgeladen mit den Geheimtexten); die Herausforderung nennt den Weg
  (`recovery`), und die Signatur hat einen eigenen Zweck (`login-recovery`), sodass sie nie als
  Anmeldung mit der Passphrase zählt und umgekehrt. Fehlversuche zählen für dieselbe Sperre.
- Rate-Limits je Adresse für Herausforderung, Antwort, das Annehmen einer Einladung und Better Auths
  Endpunkte (Passkeys). Die Adresse
  ist die der Verbindung; hinter einem Reverse Proxy (`KENNWORT_BEHIND_PROXY=true`) die, die der
  Proxy zuletzt an `X-Forwarded-For` anhängt – was ein Client davor schreibt, zählt nicht.
- Nach fünf Fehlversuchen in 15 Minuten ist das Konto 15 Minuten gesperrt, auch für den richtigen
  Schlüssel. Ein unbekanntes Konto bekommt eine Herausforderung mit einem gleichbleibenden
  Schein-Salt, sodass sich Konten nicht erfragen lassen. Auch eine Einladung verrät nichts über
  Konten: Erst das gültige Token, dann die Frage, ob die Konto-ID schon vergeben ist.

Umgesetzt in `apps/server/src/auth/` (Better Auth mit Passkeys und Bearer-Sitzungen,
Anmelde-Schlüssel, Einladungen) und `packages/core/src/auth/sign-in.ts` (die Seite des Geräts).

**Wehrt ab:** E-24, E-27, E-03.

### P-03 Entsperren

| Weg | Schlüssel, unter dem AK liegt |
| --- | --- |
| Passkey | `kdf(prf, credSalt, "kennwort/unlock-passkey/v1", credential-ID)`; `prf` ist die Ausgabe der WebAuthn-PRF-Erweiterung für das zufällige `credSalt` (32 Byte) dieses Passkeys |
| Passphrase | `entsperren` aus F-05 |
| Recovery-Kit | der Recovery Key ([P-12](#p-12-recovery-kit)) |
| Firmen-Recovery | F-02 an den Firmen-Recovery-Schlüssel ([P-13](#p-13-firmen-recovery)) |

Der Client lädt den passenden Geheimtext, leitet den Schlüssel ab und entschlüsselt AK; die AAD
nennt Konto und Weg, ein Geheimtext eines anderen Kontos oder Wegs scheitert. Welche Wege es gibt,
bestimmt der Client aus seinem letzten bekannten Stand: Ein neuer Weg, den der Server meldet, gilt
erst, wenn ein entsperrtes Gerät ihn angelegt hat (E-01, E-03). Nach Leerlauf sperrt der Client
und löscht alle Schlüssel aus dem Speicher; die Web-App nach zehn Minuten ohne Tastendruck oder
Klick, und beim Sperren überschreibt sie AK.

Das Gerät merkt sich Konto-ID und Secret Key (in der Web-App im `localStorage`, in der Extension in
`chrome.storage.session` bis zum Schließen des Browsers), nie die Passphrase und nie AK. Antwortet
der Server nicht, entsperrt die Web-App aus ihrer Offline-Kopie ([P-22](#p-22-offline-kopie)); die
Extension hat keine, sie braucht den Server. Der Secret Key ist der zweite Faktor gegen einen
Server, der Passphrasen errät: Wer nur die Daten des Servers hat, muss 128 Bit Secret Key
mitraten. Wer das Gerät hat, braucht weiter die Passphrase.

In der Extension (K-402) lebt das Popup nur, solange es offen ist. Darum liegen AK und das
Sitzungs-Token in `chrome.storage.session` (nur für die Extension selbst, `TRUSTED_CONTEXTS`), und ein
Alarm des Browsers trägt die Sperrzeit: Klingelt er, löscht der Service Worker beide. Ein neues Popup
nimmt sie nur, solange der Alarm noch läuft, und öffnet mit AK den Schlüsselblock und den
Kontozustand neu aus den Geheimtexten des Servers. Den Kontozustand, den die Extension zuletzt
gesehen oder geschrieben hat, hält sie unter AK versiegelt ebenfalls in `chrome.storage.session`, auch
über das Sperren, und führt ihn in jeden ein, den der Server liefert: Ein älterer, den der Server
zurückspielt, wirft sie nicht zurück (E-07, E-13). Beim Sperren überschreibt das Popup AK im Speicher.
Entsperrt wird mit demselben Code wie in der Web-App (`packages/client/src/session/unlock.ts`).

**Wehrt ab:** E-01, E-03, E-18.

### P-04 Neues Gerät

1. Das neue Gerät erzeugt ein Einmal-Schlüsselpaar (X-Wing), meldet den öffentlichen Schlüssel beim
   Server an (`POST /auth/pairings`) und bekommt eine Kopplungs-ID und ein Abfrage-Token, von dem
   der Server nur einen Hash behält. Es zeigt einen QR-Code mit Kopplungs-ID, dem Fingerabdruck
   des Schlüssels – `SHA-512/256(enc("kennwort/fp-device/v1", pk))` – und einem zufälligen
   Kopplungs-Geheimnis `r` (32 Byte), das nie zum Server geht. Der Schlüssel selbst (1216 Byte)
   passt nicht gut in einen QR-Code; der Fingerabdruck bindet ihn ebenso.
2. Ein entsperrtes Gerät scannt ihn, lädt den Schlüssel vom Server und nimmt ihn nur, wenn sein
   Fingerabdruck zu dem im QR-Code passt; so kommt der Schlüssel am Server vorbei, ohne dass er ihn
   tauschen kann.
3. Es verpackt AK, Konto-ID, Secret Key und den Hash seines aktuellen Kontozustands
   (`SHA-512/256` über den versiegelten Kontozustand) an den Einmal-Schlüssel (F-02, Zweck `device`,
   Kontext `r`) und schickt das Paket über den Server. Weil `r` in Schlüsselableitung und AAD
   eingeht, öffnet das neue Gerät kein Paket, das der Server selbst verpackt hat: Er kennt den
   Einmal-Schlüssel, aber nicht `r`, und kann so auch keinen passenden Vergleichscode erzwingen; die erste Antwort gilt, danach ändert sich die Kopplung
   nicht mehr. Der Secret Key reist mit, damit das neue Gerät später wie jedes andere mit der
   Passphrase entsperrt. Das neue Gerät lädt den Kontozustand und nimmt ihn nur an, wenn sein Hash
   passt.
4. Beide zeigen einen Vergleichscode aus `SHA-512/256(enc("kennwort/device/v1", pk, paket))`, die
   ersten vier Byte als Zahl modulo 10⁶, sechsstellig – eine sichtbare zweite Prüfung neben `r`. Erst wenn das entsperrte Gerät bestätigt
   (`POST /api/pairings/:id/confirm`, nur das Konto, das geantwortet hat), gibt die nächste Abfrage
   des neuen Geräts eine Sitzung für dieses Konto heraus, einmal; danach ist die Kopplung gelöscht.
   Eine Kopplung gilt zehn Minuten; abgelaufene löscht der Server bei der nächsten Anmeldung eines
   Geräts, und er nimmt nur ein Paket genau der Größe eines Gerätepakets an.

Ein Gerät, das der Server ohne diesen Ablauf einträgt, hat keinen AK; ein neues Gerät übernimmt
mit dem Kontozustand auch den geprüften Wurzelschlüssel und muss niemandem beim ersten Kontakt
trauen. Die Geräteliste zeigt jedes
Gerät, abmelden widerruft dessen Sitzung.

Jedes Gerät schickt bei jeder Anfrage eine zufällige Geräte-ID (16 Byte, base64url, einmal erzeugt
und im `localStorage` gehalten) in `x-kennwort-device` und einen Namen aus dem Browser in
`x-kennwort-device-name`. Beides ist nicht geheim. Der Server hält pro Gerät und Konto genau eine
Sitzung: Eine neue Anmeldung löscht die frühere desselben Geräts. `GET /api/devices` listet die
gültigen Sitzungen des Kontos mit Name, Anmeldezeit, letzter Aktivität (jede Anfrage mit der
Sitzung schiebt sie weiter) und der eigenen markiert;
`DELETE /api/devices/:id` löscht eine Sitzung des eigenen Kontos, für fremde antwortet er 404.
Abmelden widerruft nur die Sitzung: Das Gerät kennt Konto-ID und Secret Key weiter und kann sich mit
der Passphrase neu anmelden. Den Zugang ganz entziehen erst Austritt und Schlüsselwechsel (K-307).
„Dieses Gerät abmelden“ löscht dazu Konto-ID und Secret Key vom Gerät.
Umgesetzt in `apps/server/src/auth/devices.ts` und `apps/web/src/frame/devices-section.tsx`.

Was die Seiten der Web-App vom Server laden (Geräte, Gruppen, Mitglieder, Richtlinie), hält
TanStack Query (`apps/web/src/queries.ts`): ein Cache je geöffnetem Konto, nur im Speicher, ohne
Persister, beim Sperren geleert. Die Schlüssel der Abfragen nennen nur die Daten, nie ein Token,
einen Schlüssel oder ein Geheimnis; das Token kommt beim Laden aus der Sitzung.

Umgesetzt in `packages/crypto/src/device.ts` (Fingerabdruck, Vergleichscode),
`packages/core/src/account/pairing.ts` (Paket, erste Entsperrung),
`apps/server/src/auth/pairings.ts` und in der Web-App in `apps/web/src/pairing/`. Der QR-Code ist ein
Link auf `/link` des Servers mit ID, Fingerabdruck und `r` im Fragment: Die Kamera-App des
entsperrten Geräts öffnet ihn, die App liest das Fragment einmal vor dem ersten Rendern und entfernt
es sofort aus Adresse, Verlauf und dem Zustand des Routers (`takeStartFragment` in
`apps/web/src/navigation.ts`), ebenso beim Link des Notfall-Kits auf `/unlock` und bei der
Einladung auf `/invite` ([P-08](#p-08-einladung)); der Link lässt sich auch einfügen. Öffnet jemand
einen solchen Link in dem Tab, der schon auf derselben Seite steht, lädt der Browser die Seite nicht
neu und ändert nur das Fragment: Die Navigation fängt das ab (`popstate` und `hashchange`), nimmt das
Fragment auf dieselbe Weise heraus, bevor der Router die Adresse lädt, und gibt es der offenen Seite,
die damit neu beginnt (`onFragment`). Das neue Gerät fragt alle vier Sekunden nach.

**Wehrt ab:** E-09, E-10, E-25.

### P-05 Tresor anlegen und Mitglieder aufnehmen

1. Anlegen: VK₀ zufällig; der Genesis-Eintrag des Mitgliedschafts-Logs
   ([P-06](#p-06-mitgliedschafts-log)) nennt den Anlegenden als Verwalter.
2. Aufnehmen: Ein Verwalter prüft das Zertifikat des neuen Mitglieds
   ([P-07](#p-07-firmen-wurzelschlussel-und-zertifikate)), verpackt VKₑ an dessen X-Wing-Schlüssel
   (F-02) und signiert einen Log-Eintrag mit Konto, Fingerabdruck, Rolle (lesen, bearbeiten,
   verwalten), optional Ablaufzeit, und der Bindung von VKₑ.
3. Das neue Mitglied entpackt VKₑ und prüft die Bindung gegen den signierten Log-Eintrag seiner
   Epoche; ein Paket, das der Server mit einem eigenen Schlüssel gebaut hat, passt nicht (E-16).
4. Zugriff anfragen und OIDC-Gruppen: Der Server legt nur eine Anfrage ab; erst ein Verwalter
   führt Schritt 2 aus. Gebaut: `POST /api/vaults/:id/requests` (ein Konto der Firma, das nicht
   Mitglied ist), `GET` und `DELETE` für die aktuellen Verwalter (zurückziehen darf auch, wer
   gefragt hat); ein gespeichertes `aufnehmen` oder `rolle` für das Konto löscht die Anfrage. Wessen
Zeit abgelaufen ist, der steht noch im Log und fragt erneut an; freigegeben wird er mit `rolle`
ohne Ablaufzeit, denn ein zweites `aufnehmen` nimmt `verifyLog` nicht. Freigeben kann der Client nur
   für ein Konto, dessen Zertifikat der gemerkte Wurzelschlüssel bestätigt. Gruppen (`apps/server/src/sync/group-routes.ts`)
   legen nur Anfragen an: beim Verknüpfen einer Gruppe mit einem Tresor für alle ihre Mitglieder,
   die nicht im Tresor sind, und bei jedem späteren Beitritt; Zugriff gibt weiter nur Schritt 2.
   Eine Anfrage merkt sich, ob eine Gruppe sie gestellt hat; wird die Gruppe gelöst, gelöscht oder
   verlassen, bleibt sie nur, solange die Person in einer anderen verknüpften Gruppe ist. Beim
   Freigeben schlägt der Client die höchste Rolle der verknüpften Gruppen der Person vor, höchstens
   „bearbeiten“: Der Vorschlag kommt vom Server, „verwalten“ wählt der Verwalter selbst.

So ist es gebaut: `createVault` und `addMember` in `packages/core/src/membership/vault-ops.ts`
erzeugen den Eintrag und das an das Mitglied verpackte VKₑ; `changeAccess` und `removeMember`
signieren `rolle` und `entfernen`, `openVaultKey` entpackt VKₑ nur, wenn das Log es bindet. Der
Server legt beides ab (`POST /api/vaults/:id/log` mit Eintrag und, genau bei `anlegen` und
`aufnehmen`, dem verpackten Schlüssel); `GET /api/vaults` nennt die Tresore, in denen das Konto
nach dem Log Mitglied ist, `GET /api/vaults/:id/log` und `/keys` geben Log und eigene Schlüssel
nur an Konten, die gerade Mitglied sind; wer entfernt wurde oder abgelaufen ist, sieht keinen
neuen Eintrag mehr. Seinen alten Schlüssel behält er trotzdem; erst der Schlüsselwechsel
([P-11](#p-11-austritt-und-schlusselwechsel)) verteilt ein neues VK, das er nicht bekommt.

Der Name eines Tresors liegt als F-01-Geheimtext mit VKₑ beim Server (`PUT /api/vaults/:id/name`,
nur von Verwaltern, nur für die aktuelle Epoche):

```text
name = F-01(VKₑ, Name in UTF-8 NFC, 1 bis 100 Zeichen, zweck = "vault-name", kontext = tresor-ID, epoche)
```

Ein Name, den der Server aus einem anderen Tresor herüberschiebt, lässt sich nicht öffnen; der
Client zeigt dann „Tresor ohne Namen“ (`sealVaultName`, `openVaultName` in
`packages/core/src/membership/vault-name.ts`). Seit K-307 Teil b öffnet der Client einen Namen mit
dem Schlüssel seiner eigenen Epoche, damit ein Tresor nach einem Schlüsselwechsel nicht namenlos
wird, bis ein Verwalter den Namen neu versiegelt hat. Restrisiko: Der Server kann einen früheren
Namen zurückspielen, derselben oder einer früheren Epoche. Web-App und Extension laden jeden Tresor über `loadVaults`
(`packages/client/src/vaults/vaults.ts`): Log mit `verifyLog` gegen den gemerkten Stand prüfen, VKₑ nur
mit passender Bindung annehmen, nur öffnen, solange das Konto nach dem Log und der eigenen Uhr
Mitglied ist, den neuen Stand im Kontozustand merken.

Aufnehmen, Rolle ändern und Entfernen signiert der Client des Verwalters in
`apps/web/src/vaults/vault-members.ts`; aufnehmen lässt er nur Konten, deren Zertifikat der
gemerkte Wurzelschlüssel bestätigt, und die signierte Zeit ist nie früher als die des letzten
Eintrags. Antwortet der Server `409`, hat ein anderes Gerät zuerst geschrieben: Der Client lädt das
Log neu, bevor er es noch einmal versucht.

Den persönlichen Tresor legt die Web-App nur für ein Konto an, das noch nie einen Tresor gesehen
hat (keine Logs im Kontozustand): Verschweigt der Server die Tresore eines Kontos, deckt kein neuer
Tresor das zu. Seine ID ist `kdf(AK, leer, "kennwort/personal-vault/v1", konto-ID)`, gekürzt auf
16 Byte; zwei Geräte desselben Kontos wählen dieselbe, und nur der erste Genesis-Eintrag zählt.

**Wehrt ab:** E-02, E-05, E-06, E-16, E-27.

### P-06 Mitgliedschafts-Log

Ein Log je Tresor, eine Hash-Kette signierter Einträge:

```text
eintrag = enc("kennwort/log/v1", tresor-ID, seq, vorgänger-hash, epoche, aktion, konto-ID,
              fingerabdruck, rolle, gültig-bis, vk-bindung, zeit, unterzeichner-ID, zuletzt-gesehen)
          ‖ F-03-Signatur(unterzeichner, "log", …)
hash    = SHA-512/256(eintrag)
aktion  ∈ { anlegen, aufnehmen, entfernen, rolle, schlüsselwechsel }
vk-bindung = bindung(VKₑ, "vault-key", tresor-ID, epoche)    (F-02; leer bei entfernen und rolle)
```

Der Client prüft bei jedem Abruf die ganze Kette ab seinem letzten Stand:

- `seq` lückenlos, `vorgänger-hash` passend, Genesis mit `seq = 0` und Null-Hash (ausgelassen,
  vertauscht, eingeschoben: E-07);
- jede Signatur gültig, der Unterzeichner zu diesem Zeitpunkt Verwalter, sein Schlüssel und der des
  Mitglieds durch die Firma zertifiziert (unsigniert, fremd: E-06, E-07). „Zu diesem Zeitpunkt“
  heißt zur signierten Zeit des Eintrags; diese Zeiten sinken nie und liegen höchstens fünf
  Minuten vor der Uhr des Prüfenden (`CLOCK_SKEW_SECONDS`), weil die Uhren der Geräte
  auseinandergehen.
  Restrisiko: Ein Verwalter, dessen Zugriff abgelaufen ist, kann noch Einträge mit einer Zeit vor
  dem Ablauf anhängen, solange niemand danach geschrieben hat;
- jeder VKₑ, den der Client entpackt, passt zur `vk-bindung` des Eintrags `anlegen` bzw.
  `schlüsselwechsel` seiner Epoche (untergeschobener Tresor-Schlüssel: E-16);
- der letzte Stand (`seq`, `hash`) wird gespeichert; ein kürzeres Log oder ein anderer Hash an
  bekannter Stelle ist ein Angriff, kein Update (zurückgespielt: E-07).

Gegen eine Gabelung (E-08) trägt jeder signierte Eintrag und jedes signierte Schreiben eines
Eintrags den zuletzt gesehenen Log-Stand; trifft ein Client auf einen Stand, der nicht in seiner
Kette liegt, warnt er. Restrisiko: Eine Gabelung fällt erst auf, wenn die getrennten Mitglieder
wieder etwas voneinander sehen.

Umgesetzt in `packages/core/src/membership/` (`verifyLog`, Zertifikate nach F-06); wie
`packages/crypto` mit Mutation-Tests bei einer Schwelle von 100 %.

Der Server hält die Kette nur ganz, damit ein ehrlicher Server nichts speichert, was ein Client
verwirft: Den Genesis-Eintrag nimmt er nur von dem Konto, das den Tresor mit `POST /api/vaults`
angelegt hat, damit kein Kollege einen neuen Tresor vor dessen Anlegendem besetzt. Er nimmt einen
Eintrag nur vom angemeldeten Konto, mit der nächsten `seq` und dem Hash
des letzten (sonst `409`), und nur, wenn `verifyLog` die gespeicherte Kette mit dem neuen Eintrag
annimmt – mit dem Wurzelschlüssel der Firma und den Zertifikaten, die er hält. Damit gelten auf dem
Server dieselben Regeln wie im Client: gültige Signatur, Verwalter zur signierten Zeit, `aufnehmen`
nur für Nicht-Mitglieder, `rolle` und `entfernen` nur für Mitglieder, Zeiten, die nie zurückgehen
und höchstens fünf Minuten vor seiner Uhr liegen. Dazu muss der Unterzeichner nach der Uhr des
Servers gerade Verwalter sein: Ein Verwalter, dessen Zugriff abgelaufen ist, hängt auch mit einer
zurückdatierten Zeit nichts mehr an (das Restrisiko oben bleibt nur gegen einen bösartigen Server).
Wer entfernt und wieder aufgenommen wird, bekommt den Schlüssel neu verpackt. Einen
`schlüsselwechsel` nimmt er nur mit dem neuen VK für genau die Mitglieder des Logs
([P-11](#p-11-austritt-und-schlusselwechsel)). Ob ein
Eintrag gilt, entscheidet trotzdem jeder Client mit `verifyLog`, gleich, was der Server
durchgelassen hat.

**Wehrt ab:** E-06, E-07, E-08, E-16, E-19.

### P-07 Firmen-Wurzelschlüssel und Zertifikate

- Beim Anlegen der Firma erzeugt der Inhaber einen Ed25519-Wurzelschlüssel; der private Teil liegt
  an jeden Inhaber und Admin verpackt (F-02). Der erste Inhaber hat ihn in seinem Kontozustand.
  Gibt ein Inhaber einem anderen Konto eine Rolle (`PUT /api/members/:id/role`), signiert sein
  Client ein neues Zertifikat mit dieser Rolle und verpackt für Inhaber und Admins den privaten
  Wurzelschlüssel an das zertifizierte Bündel (F-02, Zweck `root-key`, Kontext Firmen-ID und
  Konto-ID); ein Mitarbeiter bekommt keinen, und der Server löscht einen früheren. Der Client des
  Empfängers holt ihn mit `GET /api/account/root-grant` und nimmt ihn nur, wenn sein öffentlicher
  Teil den gemerkten Fingerabdruck hat; einen Schlüssel, den der Server selbst verpackt hat, lehnt er
  ab. Danach steht er im Kontozustand, für jedes Gerät des Kontos. Rollen gibt nur ein Inhaber, und
  nie sich selbst: So bleibt immer ein Inhaber; der Server prüft den Aufrufer dafür noch einmal in
  derselben Transaktion, in der er schreibt. Ein neues Zertifikat ist immer später ausgestellt als
  das, das es ersetzt, und jeder Client merkt sich je Konto das neueste, das er gesehen hat (im
  Kontozustand); ein älteres, das der Server zurückspielt, gilt nicht mehr, auch nicht, um einen
  Wurzelschlüssel anzunehmen. Ein Gerät, das die neuere Rolle nie gesehen hat, kann der Server so
  noch täuschen; den lückenlosen Nachweis bringt erst ein signiertes Log der Firmenrollen. Wer zum Mitarbeiter wird, verliert den
  Wurzelschlüssel auf dem Server, nicht aber eine Kopie, die er schon hat; davor schützt erst ein
  neuer Wurzelschlüssel (K-307 Teil f, Plan unten).
- Der Wurzelschlüssel signiert die Schlüsselbündel der Mitarbeiter (F-06) und die
  Firmen-Richtlinien, darunter den Firmen-Recovery-Schlüssel und ob Firmen-Recovery an ist.
- Clients merken sich den Fingerabdruck des Wurzelschlüssels beim ersten Kontakt (TOFU) und zeigen
  ihn zum Vergleich an. Ein anderer Wurzelschlüssel oder ein neues Bündel für ein bekanntes Konto
  löst eine deutliche Warnung aus und wird nicht stillschweigend übernommen.

- Den öffentlichen Wurzelschlüssel schickt der erste Inhaber beim Anlegen der Firma mit; der Server
  gibt ihn unter `GET /api/company` heraus. Ein Client nimmt ihn nur, wenn sein Fingerabdruck dem
  gemerkten gleicht, und prüft damit jedes Zertifikat der Mitgliederliste (`GET /api/members`):
  bestätigt ist ein Mitglied nur mit einem Zertifikat dieses Wurzelschlüssels für genau sein Konto,
  seine Schlüssel und seine Rolle. Passt der Wurzelschlüssel nicht, vertraut der Client keinem
  Mitglied und sagt das.
- Die **Firmen-Richtlinie** (F-07) signiert ein Inhaber mit dem Wurzelschlüssel
  (`PUT /api/company/policy`); der Server nimmt sie nur von Inhabern, für diese Firma, mit einer
  gültigen Signatur des Wurzelschlüssels aus der Einrichtung und mit höherer Version, und gibt sie
  mit `GET /api/company` heraus. Jeder Client prüft sie unter dem gemerkten Wurzelschlüssel, merkt
  sich die höchste Version im Kontozustand und nimmt keine ältere mehr, auch nicht „keine
  Richtlinie“, nachdem er eine gesehen hat. Dann gilt ihre Sperrzeit. Eine Richtlinie, die nicht
  besteht, ändert nichts: Der Client bleibt bei der letzten gültigen und zeigt eine Warnung. Ihre
  Sperrzeit steht dafür mit der Version im Kontozustand; auch nach einem Neuladen oder auf einem
  anderen Gerät kann der Server sie nicht verlängern, indem er die Richtlinie weglässt.
  Mit `recovery = 1` nennt sie den Fingerabdruck des Firmen-Recovery-Schlüssels
  ([P-13](#p-13-firmen-recovery)); nur an diesen Schlüssel hinterlegt ein Client.
- Der gemerkte Fingerabdruck steht im Schlüsselblock unter AK
  ([Schlüsselhierarchie](#schlusselhierarchie)), nicht nur auf einem Gerät: Jedes Gerät des Kontos
  prüft gegen ihn, auch eines, das mit Passphrase, Recovery-Kit oder Firmen-Recovery entsperrt.

**Neuer Wurzelschlüssel (Plan, K-307 Teil f).** Geht ein Inhaber oder Admin, oder wird er zum
Mitarbeiter, behält er eine Kopie des Wurzelschlüssels und könnte mit einem Server Bündel
zertifizieren. Dann erzeugt der Client eines verbleibenden Inhabers einen neuen Wurzelschlüssel,
signiert den Wechsel mit dem alten (F-03, Zweck `root-change`, alter und neuer Fingerabdruck,
Zeit), stellt jedem aktuellen Mitglied ein neues Zertifikat aus, verpackt den neuen Schlüssel an
Inhaber und Admins und signiert die Richtlinie neu. Weil auch der Gehende den alten Schlüssel hat,
gilt ein solcher Wechsel nicht von selbst: Jeder Client zeigt ihn und nimmt den neuen Fingerabdruck
erst, wenn die Person ihn bestätigt (Vergleich mit dem Inhaber); ein Client, der einen Wechsel
gesehen hat, nimmt keinen zweiten vom alten Schlüssel. Zertifikate des alten Schlüssels gelten
danach nur für Log-Einträge und Signaturen, die vor dem Wechsel liegen.

Restrisiko: der erste Kontakt (TOFU) für Konten, die ohne Einladungslink entstehen (OIDC),
abgeschwächt durch den Vergleichscode. Wer per Link eingeladen wird, bekommt den Fingerabdruck im
Link ([P-08](#p-08-einladung)) und braucht auf keinem seiner Geräte TOFU; der Inhaber erzeugt den
Wurzelschlüssel selbst.

**Wehrt ab:** E-02, E-05, E-10.

### P-08 Einladung

1. Ein Verwalter erzeugt ein Einladungsgeheimnis `s` (256 Bit); der Link trägt `s` und den
   Fingerabdruck des Firmen-Wurzelschlüssels im Fragment (`#…`), das nie zum Server geht.
2. Der Client des Eingeladenen wählt seine Konto-ID selbst (16 zufällige Byte), leitet damit
   seinen Anmelde-Schlüssel ab ([P-02](#p-02-anmelden)) und schickt beim Annehmen nur den
   öffentlichen Teil; der Server bewahrt vom Einladungs-Token nur einen Hash auf. Der Client nimmt
   den Wurzelschlüssel nur an, wenn er zum Fingerabdruck im Link
   passt, und prüft damit die Firmen-Richtlinie, bevor er etwas an den Firmen-Recovery-Schlüssel
   verpackt ([P-13](#p-13-firmen-recovery)). Ein untergeschobener Wurzelschlüssel samt Richtlinie
   mit eigenem Recovery-Schlüssel scheitert hier (E-01, E-10).
3. Der Client des Eingeladenen legt das Konto an ([P-01](#p-01-konto-anlegen)) und schickt sein
   Bündel mit `HMAC-SHA-512(kdf(s, leer, "kennwort/invite/v1", einladungs-ID), bündel)`.
4. Der Client des Verwalters prüft den MAC und zertifiziert erst dann das Bündel
   ([P-07](#p-07-firmen-wurzelschlussel-und-zertifikate)).

Ein Bündel, das der Server unterschiebt, hat keinen gültigen MAC; ein Wurzelschlüssel, den er
unterschiebt, passt nicht zum Link. Die Einladung ist damit in beide Richtungen geprüft.

So ist es gebaut: Der Client des Verwalters wählt die Einladungs-ID (16 zufällige Byte) und `s`
selbst und hinterlegt `s` auf dem Server versiegelt unter seinem eigenen AK (F-01, Zweck
`invite-secret`, Kontext Konto-ID des Verwalters und Einladungs-ID). So kann er die Antwort auch
später und auf einem anderen seiner Geräte prüfen; der Server kann `s` nicht öffnen. Der Link
lautet `/invite/<id>#token=…&s=…&root=…`. Die App des Eingeladenen liest das Fragment einmal, bevor
sie etwas anzeigt oder anfragt, und entfernt es sofort aus Adresse, Verlauf und dem Zustand des
Routers, wie die Links von [P-04](#p-04-neues-gerat) und [P-12](#p-12-recovery-kit); so steht das
Geheimnis weder in der Adresszeile noch im Verlauf, solange die Seite offen ist oder nachdem die
Einladung angenommen ist. Der Eingeladene schickt den MAC mit seinen Schlüsseln
(`PUT /api/account/keys`, Feld `inviteMac`). `GET /api/members` zeigt jedem Mitglied der Firma Rolle,
öffentliche Schlüssel und Zertifikat jedes Kontos; die versiegelte Hinterlegung und den MAC bekommt
nur der Verwalter, der die Einladung erstellt hat, solange das Konto kein Zertifikat hat. Sein Client
öffnet `s`, prüft den MAC und lädt das Zertifikat mit `PUT /api/members/:id/certificate` hoch. Der
Server nimmt es nur von Inhabern und Admins, nur für dieses Konto, diese Firma, die hochgeladenen
Schlüssel und die Rolle, die das Konto hat, und nur einmal; er schreibt dazu `member-certified` ins
Audit-Log. Mit den eigenen Schlüsseln (`PUT /api/account/keys`) nimmt er ein Zertifikat nur vom ersten
Inhaber, der die Firma mit dem Einrichtungs-Code angelegt hat, und nur mit der Rolle `owner`; ein
Eingeladener kann sich so kein eigenes Zertifikat ablegen. Eine Einladung macht immer einen Mitarbeiter: Der Client zertifiziert die Rolle `member`,
gleich was der Server behauptet. Eine höhere Rolle vergibt nur ein Inhaber in einem eigenen Schritt.
Zertifizieren kann nur, wer den Wurzelschlüssel hat. Eine Einladung zertifiziert genau ein Konto:
Bevor der Client das Zertifikat hochlädt, merkt er sich Einladung und Konto im Kontozustand (und
den Fingerabdruck des Bündels unter den bekannten Bündeln). Er prüft dabei gegen den Kontozustand,
den er gerade mit dem des Servers zusammengeführt hat, also auch gegen das, was andere Geräte des
Kontos gemerkt haben: Zeigt der Server ein zweites Konto mit derselben Einladung, etwa mit jemandem,
der den Link gesehen hat, oder kennt der Kontozustand für das Konto ein anderes Bündel, lehnt der
Client ab und schreibt nichts. Zwei
Konten mit derselben Einladung in einer Liste nennt er nicht vertrauenswürdig. Der Name eines
Mitglieds ist die Beschriftung, die der Einladende eingetippt hat; der Server sieht sie wie jede
Kontoangabe, und sie bestätigt nichts.

Umgesetzt in `packages/crypto/src/invite.ts` (MAC), `packages/core/src/membership/invitation.ts`
(Einladung, Prüfen und Zertifizieren), `packages/core/src/membership/members.ts` (Mitgliederliste
prüfen), `packages/core/src/membership/root-grant.ts` (Rollen, Wurzelschlüssel verpacken und
annehmen), `packages/core/src/membership/policy.ts` (Firmen-Richtlinie),
`apps/server/src/account/members.ts`, `apps/server/src/account/policy.ts` und in der Web-App in
`apps/web/src/members/` und `packages/client/src/policy/` (mit der Extension geteilt).

**Wehrt ab:** E-01, E-02, E-05, E-10.

### P-09 Einträge speichern und lesen

```text
eintrag   = { tresor-ID, eintrags-ID, version, epoche, ek: F-01(VKₑ, EK), inhalt: F-01(EK, json), autor, signatur }
signatur  = F-03(autor, "entry", tresor-ID, eintrags-ID, version, epoche, SHA-512/256(ek ‖ inhalt), zuletzt-gesehen)
```

- **Alle Felder in einem Geheimtext**: Titel, URLs, Benutzername, Passwort, TOTP, Notizen, eigene
  Felder, Tags, Favorit und frühere Passwörter. Unverschlüsselt sind nur IDs, Version, Epoche und
  Zeitpunkte. Kein Feld lässt sich einzeln tauschen oder lesen (E-11, E-14).
- **AAD** mit Tresor-ID, Eintrags-ID und Version (E-12, E-13).
- **Versionszähler**: Der Client merkt sich die höchste Version je Eintrag und lehnt kleinere ab
  (E-13).
- **Signatur des Autors**: Der Client prüft, dass der Autor zur angegebenen Epoche laut Log
  „bearbeiten“ durfte; so kann auch ein lesendes Mitglied, das VKₑ kennt, nichts unterschieben.
  Der Schlüssel dazu kommt nur aus einem Zertifikat, das der Firmen-Wurzelschlüssel für genau
  diesen Autor signiert hat und dessen Fingerabdruck das Log für ihn nennt (E-05).
- **Löschen** ist ein signierter Grabstein mit neuer Version. Verschwindet ein bekannter Eintrag
  ohne Grabstein, warnt der Client (E-15).
- **Schlüssel**: EK und VKₑ entstehen nur im Client. EK bleibt über die Versionen eines Eintrags
  gleich, neu bei Schlüsselwechsel ([P-11](#p-11-austritt-und-schlusselwechsel)) und Widerruf
  einer Freigabe ([P-10](#p-10-einzelnen-eintrag-teilen)); so öffnet eine Freigabe auch spätere
  Versionen. Das Format bleibt dasselbe: Jede Version trägt EK weiter unter VKₑ versiegelt, und der
  Client hält EK nur im Speicher. Ein EK ist unter VKₑ verschlüsselt, den der
  Server nicht kennt; ein VKₑ gilt nur, wenn er zur signierten Bindung im Log passt
  ([P-06](#p-06-mitgliedschafts-log)). Einen eigenen Schlüssel kann der Server so nicht
  unterschieben (E-16).

Restrisiko: Einen neuen Eintrag, den ein Client nie gesehen hat, kann der Server diesem Client
vorenthalten.

In Web-App und Extension lädt `packages/client/src/entries/entry-store.ts` die Einträge jedes
geöffneten Tresors mit `pull` und `sync` aus `packages/core` und prüft jeden Datensatz gegen das
geprüfte Log des Tresors; entsperrte Inhalte liegen nur im Speicher.

**Wehrt ab:** E-11, E-12, E-13, E-14, E-15, E-16, E-17.

### P-10 Einzelnen Eintrag teilen

```text
freigabe  = { tresor-ID, eintrags-ID, empfänger, rolle, gültig-bis, bindung, ek: F-02(empfänger, EK), teilender, zeit, signatur }
bindung   = bindung(EK, "share", tresor-ID, eintrags-ID)
ek        = F-02(zertifiziertes Bündel des Empfängers, EK, zweck = "share", kontext = tresor-ID, eintrags-ID, empfänger-ID)
signatur  = F-03(teilender, "share", tresor-ID, eintrags-ID, empfänger, rolle, gültig-bis, bindung, ek, teilender, zeit)
```

Der Teilende verpackt EK an das zertifizierte Bündel des Empfängers (F-02, Zweck `share`, Kontext
Tresor-ID, Eintrags-ID und Empfänger-ID, sodass ein Paket nicht an einen anderen Empfänger
weitergereicht werden kann) und signiert die Freigabe mit Rolle und optionalem Ablauf
(`gültig-bis` in Sekunden, 0 für keinen). Die Rolle ist vorerst nur „lesen“; sie steht schon im
signierten Format, damit „bearbeiten“ später ohne neues Format dazukommen kann. Weil EK über die
Versionen eines Eintrags gleich bleibt ([P-09](#p-09-eintrage-speichern-und-lesen)), öffnet eine
Freigabe auch spätere Versionen. Widerrufen wechselt EK und verschlüsselt den Eintrag neu, in
dieser Reihenfolge (`revokeShare` in `apps/web/src/shares/shares.ts`):

1. Der Client des Widerrufenden holt den Tresor neu und arbeitet nur mit der neuesten Version, die
   er annimmt; eine abgelehnte oder fehlende Version des Eintrags bricht den Widerruf ab.
2. Übrig bleiben die Freigaben, die `genuineShares` unter dem EK dieser Version annimmt: von einem
   zertifizierten Mitglied mit „bearbeiten“ oder „verwalten“ laut Log signiert, für genau diesen
   Eintrag und mit der Bindung dieses EK, ohne die widerrufene. Eine Freigabe, die der Server selbst
   in die Liste legt oder die unter einem älteren EK schon widerrufen wurde, wird so nicht neu
   verpackt.
3. Er schreibt den Inhalt unverändert als nächste Version unter einem neuen EK (`rekey` in
   `packages/core/src/sync/device.ts`, auch wenn eine Version unter dem alten EK dazwischenkommt).
   Ersetzt diese Version nicht genau die geprüfte, weil ein anderes Gerät dazwischen geschrieben
   hat, verpackt er keine Freigabe neu und sagt das; ihre Empfänger bekommen den Eintrag neu
   geteilt.
4. Er verpackt den neuen EK an die übrigen Empfänger neu (`reshare` in
   `packages/core/src/sync/share.ts`), mit derselben Gültigkeit.
5. Erst dann löscht der Server die Freigabe. Scheitert die neue Version, bleibt die Freigabe
   bestehen und gelistet, und die wartende Änderung verliert ihren Anspruch auf einen neuen EK: Der
   Widerruf ist nicht geschehen und lässt sich als Ganzes wiederholen, auch nach dem Sperren; eine
   spätere Änderung vollendet ihn nicht halb, ohne die übrigen Freigaben neu zu verpacken.

Der Empfänger ist kein Mitglied des Tresors; er kennt weder VKₑ noch das Log. Bevor er den Eintrag
liest, prüft sein Client (`openShared` in `packages/core/src/sync/share.ts`):

1. Die Freigabe ist an ihn gerichtet und nach seiner Uhr nicht abgelaufen.
2. Der Teilende hat ein Zertifikat, das der Firmen-Wurzelschlüssel signiert hat, und dessen
   Schlüssel hat die Freigabe signiert (E-05).
3. Der entpackte EK passt zur Bindung `bindung(EK, "share", tresor-ID, eintrags-ID)` in der
   signierten Freigabe; einen eigenen Schlüssel kann der Server so nicht unterschieben (E-16).
4. Der Datensatz gehört zu genau diesem Tresor und Eintrag (E-12), und ein zertifizierter Autor
   hat ihn signiert.
5. Der Datensatz ist nicht älter als die höchste Version, die der Empfänger von diesem Eintrag
   schon gesehen hat (E-13); die Web-App merkt sich diese Version im verschlüsselten Kontostand
   (`versions`), also über Geräte und Sitzungen hinweg.
6. Der Inhalt öffnet sich mit EK (AAD mit Tresor-ID, Eintrags-ID und Version) und ist ein Eintrag.

Umgesetzt in `packages/crypto/src/share.ts` (Verpacken, Entpacken und Bindung; Testvektor in
`packages/crypto/vectors/wrap-v1.json`), `packages/core/src/sync/share.ts` (Format, Signatur und
die Prüfung des Empfängers) und `apps/server/src/sync/share-routes.ts` (Tabelle `entry_shares`).
Der Server-Ersatz (`packages/core/src/standin/`) antwortet gleich; der gemeinsame Vertrag
(`sync/test/share-contract.ts`) zeigt gegen beide, dass der Empfänger nur diesen Eintrag
entschlüsseln kann.

Über HTTP (mit Sitzung, nur in der eigenen Firma):

| Route | Zweck |
| --- | --- |
| `PUT /api/vaults/:id/entries/:entry/shares` | Freigabe ablegen; nur aktuelle Mitglieder mit „bearbeiten“ oder „verwalten“ (sonst 403), als Teilender die angemeldete Person, Tresor und Eintrag wie im Pfad, ein bestehender Eintrag, der Empfänger ein anderes Konto derselben Firma; ersetzt eine frühere Freigabe an denselben Empfänger |
| `GET /api/vaults/:id/entries/:entry/shares` | die Freigaben eines Eintrags, für die aktuellen Mitglieder des Tresors |
| `DELETE /api/vaults/:id/entries/:entry/shares/:empfänger` | Freigabe löschen, für Mitglieder mit „bearbeiten“ oder „verwalten“ |
| `GET /api/shared` | die eigenen Freigaben, die nach der Uhr des Servers nicht abgelaufen sind |
| `GET /api/shared/:id/:entry` | die neueste Version dieses Eintrags, nur mit einer gültigen eigenen Freigabe; sonst 404, dieselbe Antwort wie für einen Eintrag, den es nicht gibt |

Andere Einträge, Versionen, Log, Schlüssel und Live-Strom des Tresors bekommt der Empfänger nicht.

In der Web-App öffnet **Teilen** im Eintrag den Dialog dazu (`apps/web/src/shares/`); den
Empfänger zeigt „Mit mir geteilt“ nur, was `openShared` angenommen hat, und eine Freigabe, deren
Datensatz sich nach einem Widerruf nicht mehr öffnet, zeigt sie nicht.

Restrisiken:

- Ohne das Log kann der Empfänger nicht prüfen, ob der Autor des Datensatzes den Tresor bearbeiten
  darf. Einen Datensatz unter EK kann aber nur bauen, wer EK kennt, also ein Mitglied des Tresors
  oder ein Empfänger einer Freigabe; der Server allein kann es nicht.
- **Alte Versionen:** Kennt der Empfänger einen geteilten Eintrag noch nicht oder hat er seinen
  Kontostand verloren, kann ihm der Server eine ältere Version des Eintrags ausliefern, die mit
  demselben EK verschlüsselt ist; erst ab der ersten gesehenen Version lehnt sein Client ältere ab
  (Schritt 5). Neuere Versionen kann der Server ihm vorenthalten.
- **Schlüsselwechsel:** Ein Schlüsselwechsel ([P-11](#p-11-austritt-und-schlusselwechsel))
  gibt jedem Eintrag des Tresors einen neuen EK. Der Client des Verwalters verpackt danach jede
  Freigabe neu, die unter dem EK der ersetzten Version echt ist (`genuineShares` gegen das Log nach
  dem Austritt), wie beim Widerruf mit `reshare`; Freigaben, die die ausgetretene Person signiert
  hat oder die an sie gingen, nicht. Hat ein anderes Gerät den Eintrag dazwischen geschrieben,
  bleibt seine Freigabe unter dem alten EK und öffnet die neue Version nicht.
- **Teilender verlässt den Tresor:** Der Server liefert eine Freigabe weiter aus, auch wenn ihr
  Teilender den Tresor inzwischen verlassen hat oder nur noch lesen darf; der Empfänger kennt das
  Log nicht und merkt es nicht. Nach dem Entfernen folgt ein Schlüsselwechsel (P-11), der ihre
  Freigaben nicht neu verpackt; danach öffnen sie keine neue Version mehr. Bis dahin
  liest der Empfänger, was er vorher auch lesen konnte. Die Mitglieder sehen eine solche Freigabe
  im Dialog nicht mehr, weil `genuineShares` nur Freigaben aktueller Bearbeiter annimmt, und können
  sie dort darum nicht entfernen; ein Widerruf einer anderen Freigabe des Eintrags verpackt sie
  aber nicht neu, sodass auch er sie beendet.
- **Widerruf:** Ein Widerruf ohne neuen EK nimmt dem Empfänger nur, was der Server ihm noch
  ausliefert; erst der neue EK schützt spätere Versionen. Was der Empfänger vor dem Widerruf
  gelesen hat, kennt er weiter, auch das Passwort; es gilt erst nach einer Änderung wieder als
  sicher. Ein Server, der dem Widerrufenden einen abgespaltenen, älteren Stand als neuesten zeigt
  (eine Gabelung wie E-08 beim Log), kann ihn eine unter dem damaligen EK widerrufene Freigabe neu
  verpacken lassen; das verhindert erst ein Abgleich der Versionen über alle Geräte. Geht die
  Antwort auf die neue Version verloren, obwohl der Server sie gespeichert hat, sind die übrigen
  Freigaben nicht neu verpackt und müssen neu geteilt werden.
- **Kontostand:** Lehnt der Server das Schreiben des Kontostands ab, merkt sich der Empfänger die
  gesehene Version nur bis zum Sperren; danach kann ihm der Server wieder eine ältere ausliefern.

**Wehrt ab:** E-05, E-12, E-13, E-16.

### P-11 Austritt und Schlüsselwechsel

Wer geht, behält, was er schon entschlüsselt hat, und die Tresor-Schlüssel der Epochen, in denen er
Mitglied war; davor schützt kein Protokoll (ETH-Studie, E-26; ebenso die Whitepaper von Bitwarden,
1Password und Passbolt). Der Schlüsselwechsel sorgt dafür, dass er nichts liest, was danach
geschrieben wird, und die Änderungs-Markierung dafür, dass das, was er lesen konnte, geändert wird.

1. **Entfernen und Schlüsselwechsel**: Ein Verwalter signiert `entfernen` und gleich danach
   `schlüsselwechsel` (Epoche e + 1) im Log. Der Eintrag `schlüsselwechsel` nennt den
   Unterzeichner als Konto, ohne Fingerabdruck und Rolle, mit der Bindung von VKₑ₊₁ (F-02).
2. **Neuer Tresor-Schlüssel**: Der Client erzeugt VKₑ₊₁ und verpackt es an **jedes** Mitglied, das
   das geprüfte Log nach dem Entfernen noch nennt, auch an eines, dessen Zeit abgelaufen ist (ein
   späteres `rolle` lässt es wieder herein, und der Server gibt Schlüssel nur aktuellen
   Mitgliedern). Verpackt wird nur an ein Bündel, dessen Zertifikat der Firmen-Wurzelschlüssel für
   genau dieses Konto signiert hat und dessen Fingerabdruck das Log für das Mitglied nennt; fehlt
   eines, bricht der Wechsel ab, statt jemanden still auszulassen oder an einen fremden Schlüssel
   zu verpacken (E-05).
3. **Neu verschlüsseln**: Jeder Eintrag wird als nächste Version in Epoche e + 1 geschrieben, mit
   neuem EK unter VKₑ₊₁ (EK wechselt mit der Epoche, P-09). Das ausgetretene Mitglied kennt die
   alten EK; mit ihnen liest es keine spätere Version, auch nicht das geänderte Passwort.
4. **Änderungs-Markierung**: Ersetzt die neue Version eine, die in einer Epoche lag, deren Schlüssel
   die Person hatte, markiert der Client jedes geheime Feld (Art `secret` oder `totp` mit Wert), das
   noch den Wert jener Version hat, „Zum Ändern“; ein Passwort, das eine wartende Änderung neu
   setzt, hat die Person nie gesehen. Die Markierung steht im Inhalt des Eintrags (P-09), also verschlüsselt, mit jeder
   Version signiert und für alle Mitglieder sichtbar; der Server kann sie nicht unbemerkt
   entfernen:

   ```text
   toChange = [ { account: Konto-ID (base64url), at: Zeit des Wechsels (Unix-Sekunden),
                  fields: [ IDs der geheimen Felder ] }, … ]          (fehlt, wenn leer)
   ```

   Ein Feld verlässt die Markierung, sobald sein Wert sich ändert oder es gelöscht wird; mit dem
   letzten Feld geht die Markierung. Die Markierungen gehören dem Kern, nicht dem Dialog: Eine
   Änderung übernimmt die Markierungen der Version, die sie ändert, und ein Dialog, der sie nicht
   kennt, kann keine verlieren. Beim Zusammenführen (P-21) bleibt eine Markierung des gemeinsamen
   Stands nur mit den Feldern, die beide Seiten behalten haben; eine neue mit den Feldern, die eine
   Seite markiert hat – aber nur, solange der zusammengeführte Wert der markierte ist: Ein Passwort,
   das die andere Seite inzwischen geändert hat, hat die Person nie gesehen. Weil die Markierung
   erst beim Schreiben gesetzt wird, nach dem Zusammenführen, markiert sie auch eine Änderung, die
   ein anderes Mitglied kurz vorher noch in der alten Epoche geschrieben hat.
5. **Austritts-Bericht**: Eine reine Funktion auf dem Gerät des Verwalters (`exitReport`) nennt je
   Tresor die Rolle der Person, seit wann und bis wann sie Mitglied war, und jeden Eintrag, den sie
   lesen konnte, mit den Namen seiner geheimen Felder. Lesen konnte sie einen Eintrag, dessen
   neueste Version in einer ihrer Epochen liegt (vom ersten `aufnehmen` bis zum letzten `entfernen`,
   abgelaufen oder nicht), oder der nach dem Wechsel noch ihre Markierung trägt. Der Server sieht
   den Bericht nie.

**Was der Client prüft.** Aus dem Log weiß jeder Client, ob ein Wechsel aussteht (`rotationDue`:
ein `entfernen` ohne späteren `schlüsselwechsel`). Er nimmt einen Tresor-Schlüssel nur gegen die
Bindung seiner Epoche (`openRings`): Fehlt der Schlüssel der aktuellen Epoche, hält der Server den
Wechsel zurück (`key-withheld`); ein alter Schlüssel als neuer ausgegeben passt nicht zur Bindung
(`not-committed`, E-16); ein Schlüssel einer Epoche, die das Log nicht zeigt, verrät ein gekürztes
Log (`no-epoch`, E-07). Ältere Schlüssel behält er nur zum Lesen von Versionen, die noch nicht neu
verschlüsselt sind; geschrieben wird nur unter dem Schlüssel der aktuellen Epoche des Logs, sonst
schreibt der Abgleich nichts (`stale-key`). Ein Datensatz einer Epoche, die das geprüfte Log nicht
erreicht, ist ein zurückgehaltener Wechsel oder ein zurückgespieltes Log (`newer-epoch`), kein
Update. Einen Datensatz, den die Person nach dem Austritt noch mit dem alten Schlüssel schreibt,
lehnt jeder Client ab: Sie ist laut Log kein Mitglied mehr (`not-editor`), gleich, ob sie in der
alten Epoche bearbeiten durfte und welche Version sie angibt; auch eine Version, die sie damals
selbst geschrieben hat, nimmt ein Client nach ihrem Austritt nicht mehr neu an.

**Die Epoche eines Eintrags geht nie zurück.** Ein Client nimmt keine neuere Version eines
Eintrags an, deren Epoche älter ist als die der Version, die er schon hat (`older-epoch`). Ein
ehrlicher Schreiber versiegelt die nächste Version unter dem Schlüssel der aktuellen Epoche, und
der Server nimmt nur sie; eine neuere Version in einer älteren Epoche hat also jemand geschrieben,
dem der Server den Wechsel vorenthalten hat (Gabelung, E-08). Sie ist echt – von einem Mitglied
signiert, das bearbeiten darf, gebunden an Tresor, Eintrag, Version und Epoche –, aber die
ausgetretene Person kann sie mit dem alten Schlüssel lesen, und sie trägt die Markierungen des
Wechsels nicht. Ohne die Regel verdrängte sie beim Abgleich die neu verschlüsselte Version samt
Markierung; jetzt bleibt die Version der neueren Epoche, der Abgleich meldet den Angriff und
schreibt nichts darauf. Was ein Mitglied offline geändert hat, bevor es vom Wechsel erfuhr, wartet
als Inhalt, nicht als Geheimtext, in der Warteschlange: Versiegelt wird erst beim Abgleich, unter
dem Schlüssel der Epoche, die das geprüfte Log dann nennt, zusammengeführt mit der neu
verschlüsselten Version und markiert. Ein schon versiegelter Datensatz wird nie neu verschlüsselt
übernommen. Eine ältere Version derselben Epoche bleibt lesbar, solange keine neuere Epoche des
Eintrags bekannt ist: So liest der Client einen Eintrag, den der Server vor dem rotierenden Gerät
versteckt hat. Bringt eine Antwort mehrere Versionen eines Eintrags, wägt der Client sie in der
Reihenfolge ihrer Versionen, damit die Reihenfolge des Servers die Regel nicht umgeht. Die Regel
steht in `pull` (`packages/core/src/sync/device.ts`), für die Offline-Kopie in `keepRecords`
([P-22](#p-22-offline-kopie)) und dort, wo ein Abgleich, der von einem älteren Stand ausging, in
den Stand im Speicher kommt (`newestOf` in `packages/client/src/entries/device-merge.ts`).

**Austritt aus der Firma.** `DELETE /api/members/:id` (Inhaber für alle anderen, Admins nur für
Mitarbeiter, nie sich selbst) markiert das Konto als ausgetreten (`accounts.left_at`), löscht
sofort alle seine Sitzungen, Zugriffsanfragen, Gruppenmitgliedschaften, Freigaben an es, einen
verpackten Wurzelschlüssel und die offenen Einladungen, die es erstellt hat (es kennt Token und
Geheimnis), und schreibt `member-left` ins Audit-Log. Danach kommt es mit keiner Sitzung mehr unter
`/api`, und ein Live-Stream, den es noch offen hat, endet vor der nächsten Meldung. Schlüssel und Zertifikat bleiben, denn die Logs, die es signiert hat,
müssen weiter prüfbar sein; `GET /api/members` nennt die Zeit des Austritts (`leftAt`). Aus den
Tresoren entfernen und den Schlüssel wechseln kann nur der Client eines Verwalters; was er noch
schuldet, sagt `dueExits` aus dem geprüften Log und den Ausgetretenen.

**Auf dem Server.** `POST /api/vaults/:id/log` nimmt einen `schlüsselwechsel` nur mit
`wrappedKeys`: dem neuen Schlüssel für genau die Mitglieder, die das Log nach dem Eintrag nennt, je
einmal und in der Größe eines verpackten Schlüssels; jeder andere Eintrag trägt keine solche Liste.
Er legt die Schlüssel unter der neuen Epoche ab (Tabelle `vault_keys`) und löscht bei `entfernen`
alle Schlüssel der Person für diesen Tresor, auch die alten. `PUT /api/vaults/:id/records` nimmt
eine Version nur in der Epoche des neuesten Log-Eintrags, sonst `409` mit `error: "epoch"` und dem
aktuellen Stand: Wer noch mit dem alten Schlüssel schreibt, schreibt für jemanden, der gegangen
ist. Der Server-Ersatz antwortet gleich (Vertrag `sync/test/rotation-contract.ts`).

**In der Web-App** (K-307 Teil b, `apps/web/src/vaults/exit.ts`):

1. **Aus dem Tresor entfernen** nimmt die Person heraus und mit ihr jeden, den das Log noch nennt
   und der laut Mitgliederliste die Firma verlassen hat, damit der neue Schlüssel keinen von ihnen
   erreicht. Es prüft jedes `entfernen` gegen das Log, wie es danach steht
   (`verifyLog`), signiert danach den `schlüsselwechsel` (`rotateVaultKey`) und schickt beides der
   Reihe nach; nimmt der Server einen Eintrag nicht, geht der Rest nicht hinaus, und ein Entfernen
   ohne Wechsel holt der Verwalter-Client später nach. Danach versiegelt er den Namen des Tresors
   unter VKₑ₊₁; bis dahin liest jeder Client einen Namen mit dem Schlüssel seiner eigenen Epoche.
2. Er lädt den Tresor neu, holt die Einträge vom Server und schreibt jeden, der noch in einer
   früheren Epoche liegt, und jede wartende Änderung neu (`rotateEntries`); was schon in der
   aktuellen Epoche liegt, bekommt keine neue Version.
3. Er verpackt die Freigaben der neu geschriebenen Einträge neu (P-10), aber keine von oder an
   jemanden, der den Tresor oder die Firma verlassen hat, auch wenn der Server sie noch auflistet.
4. **Aus der Firma entfernen** ruft `DELETE /api/members/:id`; danach lädt der Client die Tresore
   neu. Nach jedem Laden der Tresore holt ein Verwalter-Client nach, was seine Tresore schulden
   (`dueExits` mit den Konten, die laut Mitgliederliste ausgetreten sind): ein Entfernen mit
   Wechsel, einen Wechsel nach einem Entfernen, das der Server ohne ihn behalten hat, und Einträge
   einer früheren Epoche, etwa weil das Neuschreiben scheiterte oder der Server sie dem
   rotierenden Gerät verborgen hatte. Jeder Tresor kommt dabei je Stand des Logs einmal dran, und
   immer nur ein Austritt zur Zeit, damit ein Neuladen mitten im Austritt nicht dieselben Einträge
   zugleich schreibt.
5. **Jedes Schreiben kennt die früheren Austritte**: Der `SyncContext` trägt sie
   (`exposures`, aus dem geprüften Log mit `pastExposures`: wer entfernt wurde und nicht wieder
   aufgenommen ist, wann, und die Epochen seiner Schlüssel). Ersetzt eine Version eine aus einer
   dieser Epochen, markiert der Kern die geheimen Felder mit unverändertem Wert für diese Person,
   gleich, ob ein Schlüsselwechsel sie gesehen hat. Ein Eintrag, den der Server vor dem
   rotierenden Gerät versteckt hat, bekommt so seine Markierung, sobald ihn jemand schreibt (Test
   gegen den lügenden Server in `packages/core/src/adversary/exit.test.ts`).
6. **Solange ein Wechsel aussteht** (`rotationDue`), schreibt kein Client: Der Abgleich bricht ab
   (`rotation-due`), die Web-App nimmt eine Änderung gar nicht erst in die Warteschlange, bietet
   weder Anlegen noch Bearbeiten an und zeigt den Hinweis, dass im Tresor ein Schlüsselwechsel
   aussteht. Lesen bleibt möglich, auch aus der Offline-Kopie.
7. Die Markierungen stehen unter **Zum Ändern** mit dem Namen der Person, dem Tag und den Feldern;
   der **Austritts-Bericht** (`exitReport`) liegt in den Mitgliedern neben jeder ausgetretenen
   Person und rechnet aus den Tresoren, die das Gerät öffnen kann.

Umgesetzt in `packages/core/src/membership/rotation.ts` (`rotateVaultKey`, `removeAndRotate`,
`openRings`, `dueExits`), `membership/exit-report.ts` (`exitReport`, `pastExposures`),
`sync/change-marks.ts`, `sync/device.ts` (`rotateEntries`, ältere Schlüssel zum Lesen,
`exposures`, `newer-epoch`, `older-epoch`, `stale-key`, `rotation-due`), mit Mutation-Tests bei 100 %, in
`apps/server/src/sync/log-routes.ts`, `sync/scope.ts` und `apps/server/src/account/members.ts`
(Migration `0019_members_left`), in `packages/client/src/vaults/vaults.ts` (Schlüssel aller
Epochen über `openRings`), `packages/client/src/entries/entry-rotation.ts` und in der Web-App unter
`apps/web/src/vaults/exit.ts` und `apps/web/src/members/member-exit.tsx`.

Restrisiken:

- **Vor dem Wechsel versteckter Eintrag:** `rotateEntries` verschlüsselt nur die Einträge neu, die
  das rotierende Gerät kennt. Hält der Server einen Eintrag vor diesem Gerät zurück, bleibt er in
  der alten Epoche, bis ein Verwalter-Client ihn sieht und neu schreibt oder jemand ihn ändert;
  markiert wird er dann so oder so (Schritt 5). Bis dahin lesen ihn die Mitglieder mit dem alten
  Schlüssel, den auch die ausgetretene Person hat; neu ist für sie daran nichts.
- Bis ein Verwalter-Client den Wechsel macht, entscheidet der Server allein; die Person kennt bis
  dahin den Schlüssel der aktuellen Epoche. Darum schreibt solange kein Client (Schritt 6), und
  ein Verwalter-Client holt den Wechsel nach, sobald er die Tresore lädt. Geht kein Verwalter
  online, bleibt der Tresor nur lesbar.
- **Austritt nach dem Wort des Servers:** Wer die Firma verlassen hat, sagt die Mitgliederliste
  des Servers (`leftAt`), unsigniert. Behauptet ein Server das zu Unrecht, entfernt ein
  Verwalter-Client die Person aus seinen Tresoren und wechselt den Schlüssel, nie aber das eigene
  Konto, mit dem er angemeldet ist. Das nimmt Zugriff,
  gibt aber keinen; die Person lässt sich wieder aufnehmen, und das Log zeigt, wer sie wann
  entfernt hat. Den Zugang zum Server kann ein Server ohnehin jederzeit nehmen.
- Der Austritts-Bericht kennt nur die Tresore, die das Gerät des Verwalters öffnen kann; ein
  Tresor, in dem er nicht Mitglied ist, fehlt darin.
- Was die Person vor dem Austritt gelesen hat, kennt sie weiter; diese Passwörter gelten erst nach
  ihrer Änderung als sicher.
- Ein Server kann einem Mitglied, das sich den neueren Stand nie gemerkt hat, das Log von vor dem
  Austritt zeigen. Es schreibt dann unter dem alten Schlüssel, was ein ehrlicher Server ablehnt;
  sobald es einen neu verschlüsselten Eintrag sieht, merkt es den Angriff (`newer-epoch`). Was es
  bis dahin schreibt, kann die ausgetretene Person lesen. Jedes Mitglied, das den Eintrag schon in
  der neuen Epoche hat, lehnt diese Versionen ab (`older-epoch`); ein Gerät, das den Eintrag noch
  nie gesehen hat, kann es nicht wissen und zeigt sie (wie das Restrisiko in
  [P-09](#p-09-eintrage-speichern-und-lesen)). Sein nächstes Schreiben geht trotzdem unter den neuen
  Schlüssel mit neuem EK und markiert, was die Person lesen konnte (Schritt 5); spätere Änderungen
  liest sie nicht.
- Clients älterer Versionen kennen `toChange` nicht und verlieren die Markierung beim nächsten
  Schreiben.
- Freigaben einzelner Einträge (P-10) verpackt der Verwalter-Client nach dem Wechsel neu; eine
  Freigabe eines Eintrags, den ein anderes Gerät mitten im Wechsel geschrieben hat, öffnet die
  neue Version nicht mehr und muss neu geteilt werden.
- War die Person der einzige Verwalter eines Tresors, kann niemand den Schlüssel wechseln; das löst
  erst die Firmen-Recovery (Teil c); der Notfallzugriff (Teil d) lässt nur lesen.

**Wehrt ab:** E-26, E-16, E-07.

### P-12 Recovery-Kit

Ein Recovery Key (256 Bit) verschlüsselt AK (F-01, Weg `recovery`). Das Kit ist ein PDF zum
Ausdrucken mit Server-Adresse, Konto, Secret Key und Recovery Key und QR-Code. Der Recovery Key
steht als `R1-` und 52 Zeichen Crockford-Base32 in Fünfergruppen mit einem Prüfzeichen (mod 37) da,
das jeden einzelnen Tippfehler erkennt. Es wird auf dem Gerät erzeugt und nie hochgeladen. Wer das Kit nutzt,
legt danach einen neuen Recovery Key an.

Passphrase vergessen: Das Gerät meldet sich mit dem Recovery Key an ([P-02](#p-02-anmelden)), lädt
die Geheimtexte und öffnet AK mit dem Recovery Key. Dann wählt der Benutzer eine neue Passphrase,
und das Gerät erzeugt ein neues Konto-Salt und einen neuen Recovery Key, verpackt AK unter beiden neu
und ersetzt in einem Schritt (`PUT /api/account/unlock`) beide Geheimtexte, das Salt und beide
Anmelde-Schlüssel. Der Server nimmt das nur mit einer Signatur des bisherigen Recovery-Anmelde-
Schlüssels über Konto und alle neuen Werte an (Zweck `unlock-renewal`) und nur mit Geheimtexten in
der Größe eines verpackten AK: Eine Sitzung allein, etwa ein gestohlenes Token, ersetzt nichts.

Danach melden die alte Passphrase und der alte Recovery Key nicht mehr an. AK bleibt aber derselbe,
damit nichts anderes neu verpackt werden muss; wer den alten Recovery-Geheimtext aufbewahrt hat –
der Server oder wer eine frühere Antwort mitgelesen hat –, öffnet AK mit dem alten Recovery Key
weiterhin. Ist das Kit in fremde Hände geraten, schützt erst ein Wechsel von AK und der
Benutzer-Schlüssel (Plan unten, K-307 Teil e).

Ein Gerät, das das Konto kennt, behält seinen Secret Key, sodass die übrigen Geräte weiter
funktionieren; ein fremdes Gerät kennt ihn nicht und erzeugt einen neuen, den das neue Kit zeigt.

Der QR-Code enthält nur einen Link auf die Entsperr-Seite des Servers mit Konto-ID und Secret Key im
Fragment (`/unlock#account=…&secret=…`), das der Browser nicht an den Server schickt; die App liest
es beim Öffnen und entfernt es sofort aus der Adresse und dem Eintrag im Verlauf, ob danach entsperrt
wird oder nicht, auch wenn der Link in einem Tab aufgeht, der schon auf `/unlock` steht
([P-04](#p-04-neues-gerat)). Der
Recovery Key steht nie im QR-Code: Ein Foto des Codes allein öffnet kein Konto, es braucht weiter die
Passphrase. Das PDF schreibt die Web-App selbst (`apps/web/src/kit/`), ohne PDF-Bibliothek; den
QR-Code erzeugt `uqr`.

#### Wechsel des Account Key nach einem Kit in fremden Händen (Plan, K-307 Teil e)

Das Kit trägt Secret Key und Recovery Key. Wer beides hat und dazu einen Recovery-Geheimtext (der
Server, ein Dieb der Datenbank, wer eine frühere Antwort mitgelesen hat), öffnet AK und damit den
Schlüsselblock: die privaten X-Wing- und Ed25519-Schlüssel. Mit dem X-Wing-Schlüssel entpackt er
jeden Tresor-Schlüssel, der je an das Konto verpackt wurde und auf dem Server liegt. Ein neuer AK
allein hilft darum nicht; es braucht neue Benutzer-Schlüssel und in jedem Tresor des Kontos einen
Schlüsselwechsel, als ob die Person ginge und mit neuen Schlüsseln wiederkäme:

1. Ein entsperrtes Gerät erzeugt AK′, einen neuen Secret Key, neue X-Wing- und Ed25519-Schlüssel und
   einen neuen Recovery Key; die Passphrase bleibt, ihr Geheimtext wird mit dem neuen Secret Key neu
   abgeleitet (F-05). Schlüsselblock, Kontozustand (Zähler läuft weiter) und jeder Entsperr-Weg
   kommen unter AK′; Passkeys werden neu verpackt. Die ID des persönlichen Tresors steht danach im
   Kontozustand, weil sie aus dem alten AK abgeleitet war.
2. `PUT /api/account/rekey` ersetzt alles in einem Schritt, nur mit einer Signatur des bisherigen
   Ed25519-Schlüssels über Konto und alle neuen Werte (Zweck `account-rekey`), und löscht die alten
   Geheimtexte und alle anderen Sitzungen. Gegen jemanden, der sie schon kopiert hat, hilft das
   Löschen nicht, nur gegen einen späteren Diebstahl.
3. Das neue Bündel braucht ein neues Zertifikat. Weil der alte Schlüssel als verraten gilt, kann er
   das neue Bündel nicht bezeugen: Ein Inhaber oder Admin vergleicht den Fingerabdruck des neuen
   Bündels mit der Person (Vergleichscode wie in P-04) und stellt ein Zertifikat mit späterem Datum
   aus. Clients nehmen ein neues Bündel für ein bekanntes Konto nur mit einem neueren Zertifikat des
   gemerkten Wurzelschlüssels und zeigen den Wechsel an (P-07).
4. In jedem Tresor des Kontos signiert ein Verwalter `entfernen` für den alten Fingerabdruck,
   `aufnehmen` für den neuen und `schlüsselwechsel` ([P-11](#p-11-austritt-und-schlusselwechsel));
   Einträge werden neu verschlüsselt, aber nicht markiert, wenn die Person dieselbe bleibt. Ist die
   Person selbst Verwalter, macht ihr Client das mit dem neuen Schlüssel, nachdem das neue
   Zertifikat steht.
5. Freigaben an das Konto (P-10) werden an das neue Bündel neu verpackt, die Hinterlegung für die
   Firmen-Recovery ([P-13](#p-13-firmen-recovery)) neu angelegt, und der Wechsel kommt signiert ins
   Audit-Log.

Kein Format ändert sich: AK′, Schlüsselblock und Log-Einträge nutzen F-01, F-02, F-03 und P-06 wie
bisher; neu ist nur der Zweck `account-rekey` der Signatur, mit eigenen Testvektoren.

**Wehrt ab:** E-01.

### P-13 Firmen-Recovery

Standard für Firmen, pro Firma abschaltbar (Projektplan, Entscheidungen): Wer Passphrase,
Recovery-Kit und Geräte verloren hat, bekommt über einen Inhaber wieder Zugang. Vorbild sind die
„Account Recovery“ von Bitwarden (der Schlüssel des Benutzers an den öffentlichen Schlüssel der
Organisation verpackt) und die Account Recovery von Passbolt (eine Anfrage, die ein Admin freigibt);
anders als dort prüfen die Clients jeden Schritt gegen die vom Wurzelschlüssel signierte
Richtlinie, nicht gegen das Wort des Servers. Die Verpackung ist F-02 (X-Wing als KEM wie im
Basismodus von RFC 9180, mit Bindung an den Empfänger).

**Schlüssel anlegen, Schalter in der Richtlinie.** Der Client eines Inhabers erzeugt ein
X-Wing-Schlüsselpaar, verpackt den privaten Teil an jeden zertifizierten Inhaber (F-02, Zweck
`company-recovery-key`, Kontext Firmen-ID und Konto-ID) und signiert die nächste Richtlinie (F-07)
mit `recovery = 1` und dem Fingerabdruck des Schlüssels (F-04). `PUT /api/company/recovery-key`
nimmt alle drei in einem Schritt, nur von einem Inhaber, nur mit Paketen für genau die aktuellen
Inhaber, nur mit einer neueren, vom Wurzelschlüssel signierten Richtlinie, deren Fingerabdruck der
mitgeschickte öffentliche Schlüssel hat; `GET /api/company` gibt den öffentlichen Teil heraus. Ein
Inhaber nimmt seinen Teil (`GET /api/account/recovery-grant`) nur, wenn dessen öffentlicher Teil den
Fingerabdruck der gültigen Richtlinie hat; einen Schlüssel, den der Server selbst verpackt hat,
lehnt er ab. Ausschalten ist eine neue Richtlinie mit `recovery = 0` (`PUT /api/company/policy`);
dann löscht der Server Schlüssel, Pakete und alle Hinterlegungen. Eine Richtlinie mit Recovery an
nimmt diese Route nur mit dem Fingerabdruck des Schlüssels, den der Server schon hält (etwa für eine
neue Sperrzeit). Wird jemand Inhaber, verpackt der Client des Inhabers, der die Rolle gibt, den
privaten Teil mit (`recoveryGrant` an `PUT /api/members/:id/role`); der Server verlangt das, solange
die Firma einen Recovery-Schlüssel hat, und löscht das Paket, wenn jemand kein Inhaber mehr ist oder
geht.

**Hinterlegen (F-08).** Jedes Konto hält seine Hinterlegung beim Öffnen selbst aktuell: Es lädt die
Richtlinie, prüft sie unter dem gemerkten Wurzelschlüssel und gegen die höchste gesehene Version
(P-07) und verpackt AK nur an den öffentlichen Schlüssel, dessen Fingerabdruck die Richtlinie nennt
(`depositFor` in `packages/core/src/membership/recovery-deposit.ts`). Liefert der Server einen
anderen Schlüssel oder keinen, entsteht keine Hinterlegung, und die Seite „Mitglieder“ sagt das.
Die Hinterlegung, die der Server hält (`GET /api/account/recovery-deposit`), prüft der Client
selbst: von ihm signiert, für den Fingerabdruck in Kraft, mit der Bindung an seinen AK. Eine ältere
für einen früheren Schlüssel, eine, die der Server erfunden hat, oder keine ersetzt er
(`PUT /api/account/recovery-deposit`; der Server prüft die Signatur mit dem Ed25519-Schlüssel des
Kontos und den Fingerabdruck des Schlüssels, den er hält). Die Extension hinterlegt nicht; das macht
die Web-App beim nächsten Entsperren.

**Wiederherstellen.** Das neue Gerät des Mitarbeiters („Alles verloren? Über die Firma
wiederherstellen“) startet eine Kopplung wie in P-04 und zeigt den QR-Code mit Kopplungs-ID,
Fingerabdruck des Einmal-Schlüssels und dem Kopplungs-Geheimnis `r`. Der Inhaber öffnet den Link auf
„Gerät hinzufügen“ und wählt unter „Gerät für“ das Mitglied. Sein Client

1. nimmt den Einmal-Schlüssel nur mit dem Fingerabdruck aus dem QR-Code,
2. öffnet seinen Recovery-Schlüssel (nur mit dem Fingerabdruck der gültigen Richtlinie),
3. lädt Hinterlegung, versiegelten Schlüsselblock und Kontozustand des Mitglieds
   (`GET /api/members/:id/recovery`, nur für Inhaber) und prüft: Die Signatur stammt vom
   zertifizierten Bündel des Mitglieds und nennt Firma, Konto und den Fingerabdruck in Kraft, AK passt
   zur Bindung, AK öffnet den Schlüsselblock, dessen Schlüssel dem Zertifikat und dessen
   Wurzel-Fingerabdruck dem eigenen gleichen, und AK öffnet den Kontozustand unter dem gelieferten
   Zähler (`approveRecovery`),
4. verpackt AK, Konto-ID und den Hash des versiegelten Kontozustands an den Einmal-Schlüssel
   (F-02, Zweck `recovery-device`, Kontext `r`; ohne Secret Key, den der Inhaber nie kannte) und
   antwortet (`PUT /api/pairings/:id` mit `accountId`; der Server nimmt das nur von einem Inhaber,
   für ein Mitglied seiner Firma mit Hinterlegung und nur in der Größe eines Recovery-Pakets).

Beide Geräte zeigen den Vergleichscode aus P-04. Erst nach „Code stimmt“ auf beiden signiert der
Inhaber das Ereignis `recovery` ins Audit-Log (P-20, Gegenstand Konto-ID und Kopplungs-ID) und
bestätigt; nur wer geantwortet hat, kann bestätigen, nur solange er Inhaber ist und erst, wenn sein
Ereignis `recovery` für genau diese Kopplung im Log steht (sonst lehnt der Server ab; eine
Wiederherstellung ohne Spur im Audit-Log gibt es so nicht). Die nächste Abfrage gibt dem neuen Gerät
eine Sitzung für das Mitglied. Das neue Gerät öffnet nur ein Paket, das an `r` gebunden ist – ein
AK, den der Server selbst an den Einmal-Schlüssel verpackt, scheitert. Dann prüft es: Konto-ID und
Hash des Kontozustands passen zu dem, was der Server liefert, AK öffnet Schlüsselblock und
Kontozustand, und der Wurzelschlüssel der Firma hat den Fingerabdruck aus dem Schlüsselblock und hat
genau dessen Schlüssel für dieses Konto zertifiziert (`checkRecovered`). Danach wählt der
Mitarbeiter eine neue Passphrase; das Gerät erzeugt einen neuen Secret Key und einen neuen Recovery
Key und ersetzt die Entsperr-Wege wie in P-12 (`PUT /api/account/unlock`), bewiesen mit dem
Ed25519-Schlüssel des Kontos aus dem Schlüsselblock (Zweck `unlock-renewal-account`), da weder
Passphrase noch Recovery Key da sind. Das neue Recovery-Kit wird gezeigt. AK bleibt derselbe; der
Inhaber kannte ihn ohnehin (das ist der Sinn der Hinterlegung).

**Neuer Schlüssel, wenn ein Inhaber geht.** Er hatte den privaten Recovery-Schlüssel und damit jeden
hinterlegten AK. Entfernt ein Inhaber einen anderen Inhaber aus der Firma oder nimmt ihm die Rolle,
erzeugt sein Client sofort einen neuen Schlüssel und eine neue Richtlinie (auch von Hand: „Neuen
Recovery-Schlüssel anlegen“); der Server löscht alle Pakete und Hinterlegungen des alten, und jedes
Konto hinterlegt beim nächsten Öffnen neu. Wer die alten kopiert hat, öffnet mit ihnen nur die
alten AK, die aber gültig bleiben: Für ein Konto, dessen AK der Gehende öffnen konnte, gilt dasselbe
wie für ein Kit in fremden Händen (P-12, K-307 Teil e), wenn der Inhaber nicht ehrlich ging. Der
Wurzelschlüssel selbst wechselt erst mit Teil f (P-07).

Umgesetzt in `packages/crypto/src/company-recovery.ts` (F-08), `packages/core/src/membership/recovery-key.ts`,
`recovery-deposit.ts` und `recovery-wire.ts`, `packages/core/src/account/pairing.ts` (Recovery-Paket),
`apps/server/src/account/company-recovery.ts`, `apps/server/src/auth/pairings.ts`,
`packages/client/src/policy/recovery.ts` und in der Web-App in `apps/web/src/recovery/`,
`apps/web/src/policy/recovery-section.tsx` und `apps/web/src/account/recover-company-page.tsx`.

Restrisiko: Wer einmal Inhaber war, kann die AK, die er damals öffnen konnte, behalten. Das neue
Gerät hat beim Wiederherstellen nichts Eigenes, gegen das es prüfen könnte: Es vertraut dem
Vergleichscode und dem Inhaber, dem es den QR-Code zeigt. Einen Server, der die Hinterlegung
löscht oder verweigert, erkennt der Client und hinterlegt neu, kann ihn aber nicht zwingen, sie zu
behalten.

Weitere Restrisiken (Review von K-307 Teil c):

- **Wurzelschlüssel schlägt Inhaber-Rolle:** Den Wurzelschlüssel, der die Richtlinie signiert,
  halten auch Admins. Ein Admin kann zusammen mit einem bösartigen Server eine Richtlinie
  signieren, die seinen eigenen Recovery-Schlüssel nennt, und so alle AK einsammeln. Die Grenze
  zwischen Inhaber und Admin setzt bis zu einem neuen Wurzelschlüssel (K-307 Teil f) nur der
  Server durch.
- **Ältere Richtlinie für neue Mitglieder:** Ein Konto, das noch keine Richtlinie gesehen hat,
  nimmt jede ältere, von der Wurzel signierte an. Das gibt niemandem mehr als den Wurzelschlüssel,
  den ein ausgetretener Inhaber ohnehin noch hat, bis Teil f ihn wechselt.
- **Erneuerung wiederholbar:** Eine Erneuerung, die mit dem eigenen Ed25519-Schlüssel des Kontos
  signiert ist, ist nicht an den aktuellen Stand der Entsperrwege gebunden; wer eine Sitzung und
  die mitgeschnittene Anfrage hat, kann sie wiederholen.

**Wehrt ab:** E-01, E-02, E-10.

### P-14 Notfallzugriff

Eine Person des Vertrauens kommt nach einer Wartezeit an die Einträge des Gebenden, wenn ihm etwas
zustößt. Vorbild ist der „Emergency Access“ von Bitwarden (eine Vertrauensperson, eine Wartezeit, in
der der Gebende widersprechen kann, „View“ oder „Takeover“) und das Notfall-Kit von 1Password; die
Verpackung ist F-02 (X-Wing als KEM wie im Basismodus von RFC 9180, an den Empfänger gebunden).
Anders als bei Bitwarden kann der Server keinen eigenen Schlüssel unterschieben: Jeder Schlüssel
muss zu einer Bindung passen, die der Gebende signiert hat (F-09), bei Tresor-Schlüsseln zusätzlich
zu der im Log des Tresors.

**Geben.** Der Gebende wählt unter **Einstellungen → Notfallzugriff** eine Person, deren Bündel der
gemerkte Wurzelschlüssel zertifiziert hat (E-05), einen Umfang und eine Wartezeit von einem bis 30
Tagen:

- **Ansehen**: ausgewählte Tresore. Sein Client verpackt den aktuellen VKₑ jedes Tresors an die
  Person (F-09, Zweck `emergency`).
- **Vollzugriff**: das ganze Konto. Sein Client verpackt AK an die Person (Zweck
  `emergency-account`); mit AK öffnet sie den Schlüsselblock und damit jeden Tresor, in dem der
  Gebende Mitglied ist, auch den persönlichen.

Er signiert die Freigabe (F-09) über Firma, beide Konten, den Fingerabdruck des Bündels der Person,
Umfang, Wartezeit, Zeit und die Bindungen der Schlüssel. `PUT /api/emergency/:person` nimmt sie nur
vom Gebenden, für ein anderes Mitglied derselben Firma, mit einer gültigen Signatur seines
Ed25519-Schlüssels, für das Bündel, das der Server für die Person hält, mit einem Paket für genau
jeden genannten Tresor, in dem der Gebende gerade Mitglied ist, und nur mit einer neueren Zeit als
die Freigabe, die er schon hält (je Paar gibt es eine). Die Pakete legt der Server getrennt ab;
`GET /api/emergency` zeigt beiden Seiten die Freigabe ohne sie.

**Anfragen, widersprechen, früher freigeben.** Die Person fragt mit einer Anfrage an, die sie mit
ihrer eigenen Uhrzeit signiert (Zweck `emergency-request`); der Server nimmt sie nur, wenn die Zeit
höchstens fünf Minuten von seiner abweicht, und startet die Wartezeit. Er zeigt die Anfrage dem
Gebenden: auf der Seite und als Hinweis über jeder Seite der App, solange sie läuft (geladen beim
Öffnen, mit der Seite und alle fünf Minuten). Bis zum Ende der Wartezeit kann der Gebende
**widersprechen** (Zweck `emergency-objection`) oder **jetzt freigeben** (Zweck
`emergency-approval`), beides signiert und an die Zeit der Anfrage gebunden. Jede Aussage nennt
genau die Freigabe, um die es geht (F-09); der Server nimmt nur Aussagen, die die gespeicherte
Freigabe nennen. Ein Widerspruch sperrt diese Anfrage für immer; eine neue Anfrage beginnt eine neue
Wartezeit. Speichert der Gebende eine neue Freigabe (neue Bedingungen oder eine Erneuerung), endet
eine laufende Anfrage samt Widerspruch und früherer Freigabe: Sie nennen die alte Freigabe und
gelten für die neue nicht, auch nicht noch einmal eingereicht; die Person fragt neu an.
**Zurückziehen** löscht die Freigabe; die signierte Rücknahme (Zweck `emergency-revocation`, an die
Zeit der Freigabe gebunden) bleibt für die Person sichtbar.

**Herausgeben.** `GET /api/emergency/:geber/release` gibt die Pakete erst heraus, wenn eine Anfrage
läuft, ihr nicht widersprochen wurde und die Wartezeit nach der Uhr des Servers vorbei ist oder der
Gebende früher freigegeben hat; beim Vollzugriff dazu den versiegelten Schlüsselblock des Gebenden.
`GET /api/emergency/:geber/vaults` gibt danach die genannten Tresore (beim Vollzugriff alle, mit
seinen verpackten Schlüsseln), beide nur, solange der Gebende in ihnen Mitglied ist, mit Log, Namen
und der neuesten Version jedes Eintrags.

**Prüfen.** Der Client der Person nimmt eine Freigabe nur (`checkGrant`), wenn sie an ihr Konto und
genau ihr Bündel geht, ein vom gemerkten Wurzelschlüssel zertifiziertes Mitglied derselben Firma
sie signiert hat und sie nicht älter ist als die neueste Freigabe dieses Gebenden, die sie gesehen
hat, und nicht genau diese nach einer Rücknahme. Was sie gesehen hat, merkt sie sich im
Kontozustand (`emergency`: je Gebendem die Zeit der neuesten Freigabe, ob sie zurückgenommen ist,
und die neueste Anfrage, der widersprochen wurde). Die herausgegebenen Pakete nutzt sie nur
(`checkRelease`), wenn die Anfrage ihre eigene ist und genau die geprüfte Freigabe nennt, ihr nach
dem, was sie gesehen hat, nicht widersprochen wurde und die Wartezeit nach ihrer eigenen Uhr vorbei
ist oder eine signierte Freigabe des Gebenden für genau diese Anfrage und diese Freigabe vorliegt. Dann prüft sie jedes Log mit `verifyLog`
und nimmt einen Tresor-Schlüssel nur, wenn er zur Bindung der Freigabe passt und das Log dieselbe
Bindung für die Epoche signiert hat (`openEmergencyVault`; so gibt der Gebende nur Schlüssel
weiter, die er wirklich hat), AK nur, wenn er den Schlüsselblock des Gebenden öffnet, dessen
Schlüssel dem Zertifikat und dessen Wurzel-Fingerabdruck dem eigenen gleichen
(`openEmergencyAccount`, wie P-13 eine Hinterlegung prüft). Die Einträge zeigt sie nur zum Lesen;
jede Öffnung signiert sie als Ereignis `emergency-access` ins Audit-Log.

**Nach einem Schlüsselwechsel** (P-11) erneuert der Client des Gebenden nach jedem Laden der Tresore
jede Ansehen-Freigabe, die einen älteren VKₑ trägt, mit den aktuellen Schlüsseln und denselben
Bedingungen (`renewGrants`). Wie jede neue Freigabe beendet das eine laufende Anfrage: Der
Gebende ist offenbar da und kann eine neue Anfrage sofort freigeben. Bis dahin öffnet der
Notfallzugriff nur, was vor dem Wechsel geschrieben wurde. Verlässt der Gebende oder die Person die
Firma, löscht der Server Freigabe und Rücknahme.

**Audit-Log** (P-20): Der Server schreibt `emergency-granted`, `emergency-revoked`,
`emergency-requested`, `emergency-objected` und `emergency-released` (bei früherer Freigabe mit dem
Gebenden als Handelndem, sonst beim ersten Abholen nach der Wartezeit); die Person signiert
`emergency-access` selbst.

Umgesetzt in `packages/crypto/src/emergency.ts` (F-09), `packages/core/src/membership/emergency.ts`,
`emergency-open.ts` und `emergency-wire.ts`, `packages/core/src/account/emergency-seen.ts`,
`apps/server/src/account/emergency.ts`, `emergency-store.ts` und `emergency-vaults.ts`,
`packages/client/src/emergency/` und in der Web-App in `apps/web/src/emergency/`.

Restrisiken:

- **Die Wartezeit setzt der Server durch.** Ein bösartiger Server kann sie verkürzen oder einen
  Widerspruch verschweigen, den die Person noch nicht gesehen hat, aber nur zugunsten der Person,
  die der Gebende selbst gewählt hat: E-04 ist damit auf die Wartezeit begrenzt, nie auf eine fremde
  Person. Ein ehrlicher Client der Person zählt die Wartezeit nach seiner eigenen Uhr ab der Zeit,
  die er selbst signiert hat; eine Person, die mit dem Server zusammenarbeitet, umgeht das.
- **Eine Rücknahme, die die Person nie gesehen hat,** kann der Server verschweigen und die alte
  Freigabe weiter herausgeben. Wer sicher gehen will, wechselt nach der Rücknahme die Schlüssel der
  Tresore (P-11): Der alte VKₑ öffnet dann nichts Neues mehr. Beim Vollzugriff hilft das nicht
  gegen eine Person, die AK schon hat; dafür ist der Wechsel von AK da (P-12, Teil e).
- **Vollzugriff gibt AK heraus.** Wer AK hat, kann im Namen des Gebenden signieren; der Server lässt
  die Person nur lesen, aber nach der Freigabe ist das ein Versprechen, keine Grenze. Darum steht der
  Vollzugriff in der Oberfläche als „das ganze Konto“ da.

**Wehrt ab:** E-04, E-05, E-16.

### P-15 Was der Server sieht

| Sieht der Server | Sieht er nicht |
| --- | --- |
| Konten, Firmen, Geräte, Sitzungen, Anmeldezeiten, IP-Adressen | Passphrase, Secret Key, PRF-Ausgabe, AK, private Schlüssel |
| Tresor-IDs, Mitglieder, Rollen (im signierten Log) | Tresor-Namen und -Beschreibungen (verschlüsselt mit VKₑ) |
| Gruppen, ihre Namen und Mitglieder, welche Gruppe mit welchem Tresor verknüpft ist | – (eine Gruppe gibt keinen Zugriff, sie erzeugt nur Anfragen) |
| Eintrags-IDs, Versionen, Größen, Zeitpunkte, Autor | Titel, URLs, Benutzernamen, Passwörter, TOTP, Notizen, Tags, Favoriten, Anhänge |
| öffentliche Schlüssel, Zertifikate, Fingerabdrücke | Recovery Key, Einladungsgeheimnis, Schlüssel von Einmal-Links |
| Audit-Ereignisse (wer, was, wann) | Inhalte der Ereignisse, die Einträge betreffen |

Ein Server kann viele Firmen tragen (Projektplan, Entscheidungen). Sie sind dort strikt getrennt:
Jede Route unter `/api` liest nur über den Bereich der Firma, zu der die Sitzung gehört
(`apps/server/src/tenancy/`), und ein Test je Endpunkt prüft, dass keiner Daten einer anderen Firma
liefert. Die Trennung schützt vor Fehlern und neugierigen Mitarbeitern anderer Firmen; gegen einen
bösartigen Server schützt, wie überall, erst die Prüfung im Client.

Die Größe der Geheimtexte verrät die ungefähre Länge eines Eintrags; Inhalte werden vor dem
Verschlüsseln auf ein Vielfaches von 256 Byte aufgefüllt.

**Wehrt ab:** E-14, E-24.

### P-16 Ausgelieferter Code

- **PWA**: Jede Version hat ein Release-Manifest (Datei → SHA-256), signiert mit dem
  Release-Schlüssel (Ed25519, F-03, Zweck `release`). Der Service Worker kennt den öffentlichen
  Schlüssel seit der Installation und aktiviert ein Update erst, wenn Signatur und alle Hashes
  stimmen. Der Loop signiert mit einem Test-Schlüssel; der echte kommt zur Veröffentlichung.
  Einzelheiten unten.
- **Extension**: Klartext-Oberfläche in der Extension, reproduzierbarer Build (K-408), Prüfung der
  Web-App durch die Extension.
- **Abhängigkeiten**: etwa sechs Laufzeitpakete auf einer Liste mit Begründung (K-102), exakt
  gepinnt, keine Install-Skripte.

#### Signierte Releases der PWA

Der Build (`apps/web`, `bun run build`) legt neben die Dateien mit Hash im Namen drei Dateien mit
festem Namen:

```text
release.json  = { format: 1, version, sequence, files: { "/pfad": sha256-hex, … } }
release.sig   = hex(sign(release-sk, "release", Bytes von release.json))       F-03
sw.js         = der Service Worker, der öffentliche Release-Schlüssel eingebaut
```

- `files` nennt jede Datei des Builds außer diesen dreien, auch `index.html`, das Web-App-Manifest
  und die Icons. `version` sind die ersten 16 Hex-Zeichen des SHA-256 über die Liste der Hashes,
  derselbe Inhalt ergibt also dieselbe Version. `sequence` ist `SOURCE_DATE_EPOCH` (bei
  reproduzierbaren Builds die Zeit des letzten Commits), sonst die Bauzeit in Sekunden.
- Signiert werden genau die Bytes von `release.json`; der Service Worker prüft die Signatur, bevor
  er die Datei überhaupt liest.
- `sw.js` baut Bun außerhalb von Vite und ohne Hash im Namen. Es bleibt Byte für Byte gleich,
  solange sich sein Code und der Schlüssel nicht ändern; der Browser tauscht es dann nie aus, und
  jede neue Version der App kommt über die Prüfung unten.

Ablauf:

1. **Installation**: Der Service Worker holt `release.json` und `release.sig` am HTTP-Cache vorbei,
   prüft die Signatur, holt jede genannte Datei und prüft ihren Hash. Erst dann legt er die
   geprüften Bytes in einen Cache, der nach der Version heißt. Schlägt etwas fehl, scheitert die
   Installation, und aus dem Service Worker kommt nichts. Er merkt sich die höchste `sequence`, die
   er je geprüft hat; ein neuer `sw.js` installiert kein älteres Release als dieses, so lässt sich
   auch über einen Wechsel des Service Workers kein altes Release zurückspielen.
2. **Ausliefern**: Jede Navigation bekommt `index.html` der aktuellen geprüften Version, jede andere
   Datei kommt aus den geprüften Caches: erst der aktuellen Version, dann der davor, dann aus jedem
   geprüften Cache, der noch da ist. Solange eine Version gilt, geht nichts davon ans Netz: Was
   kein geprüfter Cache hat, beantwortet der Service Worker mit einem Fehler (404, bei einer
   Navigation 503). Ein Tab, der mehrere Versionen zurückliegt, bekommt dann einen Fehler statt
   ungeprüftem Code und muss neu laden.
3. **Pfade des Servers**: Anfragen der App an `/api` und `/auth` gehen unverändert an den Server.
   Eine Navigation dorthin, etwa über einen Link in einer Mail, und jede Navigation, die kein GET
   ist, etwa ein Formular, das eine fremde Seite abschickt, liefe sonst als Dokument des Servers
   ungeprüft unter der Herkunft der App, mit Zugriff auf ihren Speicher und ihre Caches.
   Der Service Worker gibt deshalb Weiterleitungen unverändert weiter, wie Anmeldeabläufe über
   `/auth` sie brauchen, und jede andere Antwort nur als Text in einer Sandbox
   (`Content-Type: text/plain`, `Content-Security-Policy: sandbox`, `nosniff`). Ein künftiger
   Anmeldeablauf über OpenID Connect muss darum mit einer Weiterleitung in die App enden, nicht mit
   einer eigenen Seite.
4. **Update**: Die Seite bittet beim Laden, wenn sie wieder sichtbar wird, und stündlich um eine
   Prüfung; der Service Worker prüft eins nach dem anderen. Nur ein Release mit höherer `sequence`
   als die höchste je geprüfte zählt; ein altes, korrekt signiertes Release kann der Server so nicht
   zurückspielen. Der Service Worker prüft Signatur und alle Hashes, legt die Dateien in einen neuen
   Cache und meldet dann „Neue Version bereit“. Aktiv wird die Version erst bei der nächsten
   Navigation, nie unter einer laufenden Seite; die Version davor bleibt für offene Tabs, ältere
   Caches löscht er. Schlägt eine Prüfung fehl, bleibt alles, wie es war, und nichts wird als
   bereit gemeldet.
5. **Gleichzeitig**: Der Zustand (aktuelle, bereite und vorige Version, höchste `sequence`) liegt
   im Speicher des Service Workers und dahinter im Cache Storage. Jede Änderung gilt sofort und
   ganz für den Zustand, wie er dann ist; eine Prüfung, die lange auf den Server wartet, macht eine
   Navigation in der Zwischenzeit also nicht rückgängig. Einen Cache, den eine Prüfung gerade füllt,
   löscht kein Aufräumen, bevor der Zustand ihn nennt.

Schlüssel: Ohne `KENNWORT_RELEASE_KEY` (Ed25519-Seed, hex) signiert der Build mit dem Test-Schlüssel
des Loops, dessen Seed öffentlich im Repository steht, und sagt das. Der Service Worker vertraut
`KENNWORT_RELEASE_PUBLIC_KEY`, sonst der öffentlichen Hälfte des signierenden Schlüssels. Den echten
Release-Schlüssel erzeugt und verwahrt ein Mensch zur Veröffentlichung.

Restrisiko:

- Die erste Installation: Was der Server beim ersten Besuch ausliefert, auch `sw.js` mit seinem
  Schlüssel, nimmt der Browser ungeprüft. Dasselbe gilt, wenn der Browser den Speicher der Seite
  räumt; dann ist auch die höchste `sequence` vergessen.
- Ein geänderter `sw.js`: Der Browser vergleicht `sw.js` bei jeder Navigation mit dem Server und
  installiert eine andere Fassung ohne Rückfrage. Ein Service Worker kann seinen eigenen Austausch
  nicht verhindern; ein Server, der einen eigenen `sw.js` ausliefert, umgeht also die Prüfung. Die
  Prüfung schützt gegen veränderte Dateien der App, nicht gegen einen Server, der gezielt den
  Service Worker ersetzt. Dagegen soll die Extension helfen, die die Web-App prüft (oben).
- Dokumente, die eine fremde Seite einbettet: Ein `<object>` oder `<embed>` auf eine Adresse des
  Servers ist eine Anfrage der fremden Seite, die der Service Worker von Kennwort nie sieht. Ein
  HTML-Dokument, das der Server darauf antwortet, liefe unter der Herkunft der App; verhindern
  könnten das nur Kopfzeilen des Servers, dem Kennwort nicht vertraut.
- Die PWA am Handy ohne Extension.

**Wehrt ab:** E-22, E-17.

### P-17 Ausfüllen

- Nur nach Klick oder Enter auf einen Eintrag im Inline-Menü, nie beim Laden einer Seite und nie
  auf ein Ereignis, das ein Skript der Seite erzeugt (`isTrusted`).
- Nur bei exakt passendem Host: Die Adresse des Frames wird mit dem URL-Parser normalisiert und mit
  `tldts` gegen die Public Suffix List gelesen; sie muss genau der Host einer gespeicherten Adresse
  des Eintrags sein, ohne Eltern- oder Subdomain, und ein öffentliches Suffix (`co.uk`,
  `github.io`) ist nie eine Website. Ein für https gespeichertes Passwort geht nicht in eine Seite,
  die über http kommt. Die Adressen kommen aus dem verschlüsselten Eintrag, nicht vom Server
  (E-14). Popup, Menü und Service Worker nutzen dieselbe Funktion.
- Nie in einen Frame einer anderen Herkunft: Gefüllt wird nur der oberste Frame oder ein Frame
  derselben Herkunft wie jeder Frame über ihm. Der Service Worker liest dazu bei jeder Anfrage den
  Frame-Baum des Browsers (`webNavigation`), nicht, was eine Seite oder Nachricht behauptet, und
  prüft die Adresse des Frames im Moment des Ausfüllens. Das Passwort geht nur an das eine geprüfte
  Dokument (`frameId`, `documentId`); ein Frame, der inzwischen navigiert hat, bekommt nichts.
- Das Inline-Menü ist ein iFrame der Extension in einem eigenen Element mit geschlossenem Shadow
  Root, im Top Layer. Die Seite kann weder hineinsehen noch die Adresse des Menüs lesen. Die
  Menü-Seite ist die einzige Seite der Extension, die Websites laden dürfen, in Chrome nur unter
  einer Adresse, die jede Browser-Sitzung wechselt (`use_dynamic_url`). Jedes Menü trägt eine
  zufällige Nonce (128 Bit), die nur das Content Script und sein Menü-Frame kennen; der Service
  Worker lässt sich von genau einem Content Script bestätigen, dass es das Menü mit dieser Nonce
  geöffnet hat, und das Content Script füllt nur für seine eigene Nonce.
- Clickjacking (DOM-basiertes Clickjacking auf Extension-Menüs, Marek Tóth, DEF CON 33, 2025): Ein
  Klick zählt nur, wenn der Browser das Menü seit 500 ms ohne Unterbrechung als sichtbar meldet
  (IntersectionObserver v2, `trackVisibility`: nicht abgedeckt, ganz im Bild) und 300 ms nach dem
  Klick noch immer. Vor dem Schreiben prüft das Content Script von der Seite aus: Menü offen im Top
  Layer und ganz im Bild, weder das Element noch ein Vorfahre durchsichtig, gefiltert, beschnitten
  oder maskiert, kein Element nach dem Menü in den Top Layer gekommen (nur dort kann etwas über
  ihm liegen, auch mit `pointer-events: none`), und der Hit-Test der Seite trifft das Menü in der
  Mitte und nahe jeder Ecke. Chromiums v2 erkennt Abdeckungen, aber keine Deckkraft, die die Seite
  setzt; die Prüfung des Content Scripts erkennt sie. Restrisiko: eine Abdeckung, die nur kürzer
  als etwa 100 ms um den Klick liegt, und Abdeckungen in einem geschlossenen Shadow Root der Seite
  mit `pointer-events: none`, die v2 erst nach seiner Verzögerung meldet. Firefox kennt v2 nicht;
  dort füllt das Menü nicht aus und sagt das.
- Nur in Felder, die die Seite zeigt: Das Menü öffnet nur auf einem sichtbaren Login-Feld, und
  gefüllt werden nur Felder, die beim Ausfüllen noch sichtbar sind, also angezeigt, nicht
  `visibility: hidden`, mit allen Deckkräften bis zur Wurzel zusammen mindestens 0,2, mindestens
  4 × 4 Pixel groß und nicht links oder oberhalb der Seite. Ein verstecktes Passwortfeld hinter
  einem sichtbaren Benutzernamen-Feld bekommt nichts; das Skript der Seite läse sonst ein Passwort,
  das der Nutzer nie hat hineingehen sehen.
- Das Menü öffnet das Konto, das das Popup entsperrt hat, verschiebt die Sperrzeit aber nie: Sonst
  hielte eine Seite die Extension offen, indem sie immer wieder ein Login-Feld fokussiert. Das
  Content Script hält keine Geheimnisse und liest keinen Speicherbereich.
- Das Popup der Extension (K-402) zeigt Einträge nach derselben Regel und kopiert nur auf Klick;
  ausfüllen kann es nicht. Die Adresse des Tabs sieht es nur über `activeTab`, also nach einem
  Klick auf das Symbol.
- Am Handy kopiert Kennwort nur auf Tipp; die App leert die Zwischenablage nach 30 Sekunden und
  markiert sie als sensibel, die PWA kann das nicht zuverlässig.

**Speichern und Aktualisieren (K-404).** Nach einer Anmeldung bietet die Extension an, ein neues
Login zu speichern oder ein geändertes Passwort zu aktualisieren:

- Erfasst wird nur ein Absenden, das der Browser zustellt (`isTrusted`) und das höchstens eine
  Sekunde nach einem echten Klick oder Tastendruck des Nutzers auf das Login selbst kommt: in sein
  Formular oder auf einen Knopf dieses Formulars, auf den Knopf eines Logins ohne Formular, in das
  Feld, in dem Enter fiel. `form.submit()` (ohne Ereignis) und `requestSubmit()` eines Skripts
  erfassen nichts, auch nicht direkt nach einem Klick des Nutzers anderswo (etwa auf ein
  Cookie-Banner) oder auf ein Label, das die Seite mit dem Knopf des Formulars verknüpft.
  Gelesen werden nur Felder, die die Seite zeigt (dieselbe Regel wie beim Ausfüllen), nur im
  obersten Frame oder einem Frame derselben Herkunft wie jeder Frame über ihm.
- Das Content Script gibt Benutzername und Passwort sofort per Nachricht an den Service Worker und
  behält nichts; ins DOM der Seite kommt das Passwort nie. Der Service Worker prüft den Frame am
  Frame-Baum des Browsers (`webNavigation`, `frameId`, `documentId`), nimmt den Host von dort, nicht
  aus der Nachricht, und hält das Login nur im Arbeitsspeicher, in keinem Speicherbereich, je Tab
  das neueste. Er bietet es einmal dem obersten Frame des Tabs an, der innerhalb von 30 Sekunden
  danach fragt, und gibt es einmal an die Leiste, deren Nonce dieser Frame bestätigt; danach und
  spätestens nach einer Minute hat er es nicht mehr, ebenso wenn der Browser ihn beendet.
- Die Leiste ist wie das Menü eine Seite der Extension in einem eigenen Element mit geschlossenem
  Shadow Root im Top Layer, mit eigener Nonce und unter `use_dynamic_url`; sie öffnet sich
  unsichtbar, öffnet das Konto, das das Popup entsperrt hat (ohne die Sperrzeit zu verschieben),
  vergleicht mit den Einträgen für den exakten Host und erscheint nur, wenn es etwas anzubieten gibt.
  Entschlüsselte Einträge gibt es so nur in Seiten der Extension, nie im Service Worker oder Content
  Script.
- Speichern, Aktualisieren und „Nie für diese Seite“ zählen nur mit denselben Prüfungen wie das
  Ausfüllen gegen Clickjacking: Klick vom Browser zugestellt, Leiste seit 500 ms laut
  IntersectionObserver v2 sichtbar und 300 ms später noch immer, und das Content Script findet ihr
  Element unmittelbar vor dem Schreiben offen, unverdeckt und undurchsichtig. In Firefox speichert die
  Leiste darum nicht.
- Geschrieben wird über den Eintrags-Speicher der Web-App (P-09): verschlüsselt, signiert, an
  Eintrag, Tresor und Version gebunden; Leser und Tresore mit ausstehendem Schlüsselwechsel (P-11)
  schreiben nichts. Beim Aktualisieren geht das alte Passwort in die Historie des Eintrags.
- „Nie für diese Seite“ steht als Liste exakter Hosts im Kontozustand (`neverSave`), verschlüsselt
  unter AK; zwei Geräte führen ihre Listen zusammen (Vereinigung). Die Liste gilt erst nach dem
  Entsperren: Gesperrt bietet die Leiste „Entsperren und speichern“ an und schließt sich nach dem
  Entsperren, wenn der Host auf der Liste steht.
- Restrisiko: Eine fehlgeschlagene Anmeldung, nach der die Seite eine neue Seite lädt, bietet das
  falsche Passwort an; beim Aktualisieren bleibt das richtige dann in der Historie.

**Phishing-Warnung (K-405).** Tippt jemand ein gespeichertes Passwort auf einer Seite ein, deren Host
zu keinem Eintrag mit diesem Passwort passt, warnt die Extension. Vorbild ist Googles Password Alert
(`google/password-alert`: ein gesalzener SHA-1, von dem 37 Bit bleiben); anders als dort schickt
das Content Script keine Tastendrücke an den Service Worker. 1Password und Bitwarden schützen laut
ihren Sicherheits-Whitepapern über den Abgleich der Adresse beim Ausfüllen, wie K-403 hier; die
Warnung deckt den Fall ab, in dem jemand das Passwort selbst eintippt oder einfügt.

- Seiten der Extension, die die Einträge entschlüsselt haben (Popup, Inline-Menü, Leiste), legen
  die Alarmliste an: je Eintrag mit Passwort und Website den F-10-Tag des Passworts und die
  Host-Tags seiner Websites, unter einem Salt, der bei jedem Entsperren neu ist. Sie liegt nur in
  `chrome.storage.session` (`kennwort-alert`) und nur, solange Schlüssel dort liegen: Wer sie
  schreibt, prüft das davor und danach; das Sperren, der Alarm der Sperrzeit und der Service Worker
  bei jeder Anfrage nehmen sie ohne Schlüssel weg. Weder Service Worker noch Content Script sehen
  ein gespeichertes Passwort.
- Das Content Script zählt nur einen Wert, den der Browser als Eingabe des Nutzers meldet
  (`input` mit `isTrusted`), in einem Passwortfeld, das die Seite zeigt (dieselbe Regel wie beim
  Ausfüllen), nur im obersten Frame oder einem Frame derselben Herkunft wie jeder Frame über ihm.
  Erst wenn der Nutzer das Feld verlässt, Enter drückt oder das Formular abschickt, liest es den
  Wert einmal, bildet mit dem Salt (beim Fokus geholt, damit auch ein Absenden, das wegnavigiert,
  noch prüft) den Tag und schickt nur die vier Byte. Den Wert behält es nicht; danach prüft dasselbe
  Feld erst nach neuer Eingabe wieder.
- Der Service Worker prüft den Frame am Frame-Baum des Browsers (`webNavigation`, `frameId`,
  `documentId`), nimmt den Host von dort, vergleicht den Tag mit der Liste und den Host-Tag der Seite
  mit den Host-Tags der passenden Einträge. Warnung nur, wenn der Tag passt und keiner dieser
  Einträge für genau diesen Host gespeichert ist; einmal je Tab, Host und Passwort, solange
  entsperrt. Die Warnung (Host, Adresse, IDs der Einträge, kein Geheimnis) hält er wie ein Login
  zum Speichern im Arbeitsspeicher und bietet sie der Leiste des obersten Frames an; die Leiste lädt
  die Einträge, prüft den exakten Host noch einmal und erscheint erst dann. Das Login, das auf
  einer Seite mit Warnung abgeschickt wurde, bietet sie nicht zum Speichern an.
- Die Leiste mit der Warnung hält sich oben: Liegt etwas der Seite im Top Layer über ihr, hat die
  Seite das Popover geschlossen oder ihr Element umgestylt, holt das Content Script sie alle 250 ms
  wieder nach oben und setzt ihren Stil zurück. „Trotzdem fortfahren“ und × zählen nur mit denselben
  Prüfungen wie das Speichern gegen Clickjacking. Die Seite bleibt bedienbar.
- **Was die Tags verraten**: Vier Byte trennen ein eingetipptes Passwort von einigen Hundert
  gespeicherten gut genug (ein Fehlalarm etwa einmal in zehn Millionen Prüfungen, und auch dann nur
  auf einer fremden Seite), lassen aber zu jedem Tag etwa 2^(Entropie − 32) Passwörter übrig: Ein
  Tag allein bestätigt kein geratenes Passwort, ein erzeugtes Passwort mit 60 Bit und mehr bleibt
  ganz offen. Ein schwaches Passwort aus einem Wörterbuch mit weniger als 2^32 Einträgen ließe sich
  mit Liste und Salt eingrenzen; Argon2id kostet je Versuch 1 MiB und einige Millisekunden, und wer
  den Sitzungsbereich lesen kann, hat dort ohnehin den Account Key. Der Seite verrät die Warnung nur,
  dass das getippte Passwort für eine andere Website in Kennwort steht; das Passwort selbst hat sie
  ja schon. Eine Seite kann nicht durchprobieren: Werte, die sie selbst einsetzt, prüft die
  Extension nicht, und je Eingabe des Nutzers gibt es höchstens eine Prüfung.
- Restrisiko: Eine Seite, die es auf Kennwort anlegt, kann das Element der Warnung aus dem DOM
  nehmen (lesen oder fälschen kann sie es nicht), oder sie immer wieder überdecken, sodass die
  Warnung flackert; „trotzdem fortfahren“ zählt dann nicht. Ein Passwort, das jemand so schnell
  eintippt und abschickt, dass die Alarmliste noch nicht angelegt ist (gleich nach dem Entsperren),
  wird nicht geprüft. Frühere Passwörter und Einträge ohne Website deckt die Warnung nicht ab, ebenso
  wenig Formulare in einem fremden Frame. Solange die Warnung oben gehalten wird, füllt das
  Inline-Menü auf dieser Seite nicht aus (es meldet, es sei verdeckt). In Firefox lässt sich die
  Warnung nicht wegklicken, weil die Sichtbarkeit nicht prüfbar ist; sie geht mit der Seite.

Getestet mit Playwright und geladener Extension gegen Testseiten (`e2e/extension-fill.spec.ts`):
Ausfüllen auf dem exakten Host per Klick und per Enter; eine Phishing-Domain (Bindestrich statt
Punkt) bekommt keine Treffer, und selbst eine erzwungene Anfrage des Menüs lehnt der Service Worker
ab; ein fremdes iFrame auf einer passenden Seite bekommt kein Menü und keine Daten und kann die
Menü-Seite nicht selbst einbetten; ein abgedecktes Menü (undurchsichtig oder mit
`pointer-events: none`) und ein fast durchsichtiges (am Element oder an der ganzen Seite) füllen
nichts aus, derselbe Klick ohne Trick schon; ein Passwortfeld, das die Seite außerhalb der Seite,
durchsichtig oder ein Pixel groß versteckt, bleibt leer. Zum Speichern (`e2e/extension-save.spec.ts`):
ein neues Login wird angeboten, gespeichert und im Popup gezeigt, ein geändertes Passwort
aktualisiert und das alte steht in der Historie; dasselbe Passwort, ein verstecktes Passwortfeld,
`form.submit()` und `requestSubmit()` eines Skripts, auch nach einem Klick des Nutzers auf ein
Cookie-Banner oder ein Label daneben, eine Seite auf der Liste „Nie für diese Seite“
und eine verdeckte Leiste speichern nichts, und weder `chrome.storage.local` noch der
Sitzungsbereich enthalten Passwort oder Host im Klartext. Zur Phishing-Warnung
(`e2e/extension-alert.spec.ts`): Das Passwort des Portals, eingetippt auf einer ähnlich aussehenden
Domain, warnt; auf dem Portal selbst, mit einem anderen Passwort, in einem versteckten Feld, für
einen Wert, den die Seite selbst einsetzt, und gesperrt warnt nichts; eine überdeckte oder
durchsichtig gemachte Warnung kommt wieder nach oben, und „trotzdem fortfahren“ zählt verdeckt
nicht; der Sitzungsbereich hält weder Passwort noch Host im Klartext und verliert die Alarmliste
beim Sperren. Die Regeln selbst prüfen Vitest-Tests neben dem Code (`apps/extension/src/fill`,
`save`, `alert`, `content`, `menu`, `prompt`, `page`) und die Testvektoren von F-10.

**Wehrt ab:** E-14.

### P-18 Einmal-Links

Der Client erzeugt einen Schlüssel (256 Bit), verschlüsselt den Inhalt (F-01, Zweck `link`) und
legt den Schlüssel ins Fragment des Links. Der Server speichert nur den Geheimtext, den Ablauf und
die Zahl der Abrufe und löscht ihn danach. Restrisiko: Ablauf und Zahl der Abrufe setzt der Server
durch.

**Wehrt ab:** E-20.

### P-19 Import und Export

Der Import liest die Datei nur im Client und verschlüsselt jeden Eintrag nach
[P-09](#p-09-eintrage-speichern-und-lesen). Der eigene Export ist ein F-01-Geheimtext unter einem
Schlüssel aus einer Export-Passphrase (F-05-Parameter, eigenes Salt); exportieren dürfen nur
Verwalter, der Client signiert dafür einen Audit-Eintrag.

Die Parser (`packages/core/src/import/`, K-502) sind reine Funktionen ohne Netz, Speicher oder
Logs: Datei rein, Einträge raus, Fehler als Werte. Kaputte oder böswillige Dateien lassen sie weder
abstürzen noch hängen (ein Durchgang ohne Rekursion, kein XML mit Dokumenttyp, also keine
Entitäten, die wachsen); Fuzzing mit fast-check prüft das. Verschlüsselte Fremdexporte erkennen sie
und lesen sie nicht.

**Wehrt ab:** E-21.

### P-20 Audit-Log

Jedes Ereignis ist ein Glied einer Hash-Kette (`hash = SHA-512/256(enc("kennwort/audit/v1",
vorgänger-hash, ereignis))`); Ereignisse, die ein Client auslöst (Export, Recovery,
Schlüsselwechsel, Zugriff im Notfall), signiert er. Clients merken sich den letzten Stand, der
Export für Prüfer enthält die Kette, und die Prüfung findet jede geänderte, fehlende oder
eingeschobene Zeile.

Ein Ereignis ist `enc("kennwort/audit-event/v1", firma, nr, zeit, wer, was, worum, signatur)`; die
Kette beginnt bei 32 Null-Bytes und hat je Firma eigene Nummern ab 0. Der Server schreibt selbst:
Anmeldung (jede neue Sitzung), Einladung erstellt und angenommen, Tresor angelegt und die Schritte
des Notfallzugriffs (P-14). Ein Client signiert `sign("audit", firma, wer, was, worum)` mit seinem
Ed25519-Schlüssel; `worum` ist eine ID, die er einmal wählt, dieselbe Handlung mit derselben ID
zweimal gilt als wiederholt.

Text steht in jeder Zeile wohlgeformt und schon in NFC, sonst gilt die Zeile als fehlerhaft: So haben
dieselben Worte nur eine Form, und eine wiederholte Handlung lässt sich nicht hinter einer anderen
Schreibweise verstecken.

Die Prüfung (`verifyAudit`) meldet die erste Zeile, an der etwas nicht stimmt: andere Firma, Lücke in
den Nummern, falscher Vorgänger, geänderter Inhalt, fehlende oder falsche Signatur, wiederholte
Handlung. Weil der Server kein Geheimnis kennt, könnte er die ganze Kette neu berechnen; dagegen
hilft der Stand, den sich ein Client gemerkt hat: Ist die Kette kürzer, ist sie gekürzt, steht an
seiner Stelle ein anderer Hash, ist sie umgeschrieben.

`GET /api/audit` gibt Inhabern und Admins die Kette ihrer Firma als Export für Prüfer,
`POST /api/audit` nimmt eine signierte Handlung eines Clients an.

Umgesetzt in `packages/core/src/audit/chain.ts` (Kette, Signatur, Prüfung; Mutation-Tests bei
100 %) und `apps/server/src/audit/` (Tabelle `audit_events`, Routen).

**Wehrt ab:** E-23.

### P-21 Sync

Der Server speichert je Eintrag die Geheimtexte mit Version; Clients laden Änderungen per SSE und
schreiben mit der Version, von der sie ausgingen. Konflikte löst der Client: Beide Stände bleiben
erhalten, Felder werden zusammengeführt, bei Widerspruch gewinnt keiner stillschweigend. Eine
Warteschlange hält Änderungen, solange das Gerät offline ist. Jede Antwort des Servers wird nach
[P-06](#p-06-mitgliedschafts-log) und [P-09](#p-09-eintrage-speichern-und-lesen) geprüft, bevor sie
den lokalen Stand ändert.

Einträge, ihre Versionen und den Live-Strom gibt der Server nur an Konten, die nach dem
gespeicherten Mitgliedschafts-Log gerade Mitglied des Tresors sind; neue Versionen nimmt er nur von
Mitgliedern mit der Rolle „bearbeiten“ oder „verwalten“. Sonst könnten Kollegen ohne Zugriff
sehen, wie viele Einträge ein Tresor hat und wann sie sich ändern, oder mit Versionen, die jeder
Client verwirft, die nächste echte Änderung blockieren. Ein offener Live-Strom prüft die
Mitgliedschaft vor jeder Meldung und jedem Ping erneut und endet, sobald jemand entfernt wurde oder
seine Zeit abgelaufen ist. Der Stand-in (`packages/core/src/standin/`) prüft dasselbe und nimmt
Log-Einträge wie der Server: Er läuft `verifyLog` mit dem Wurzelschlüssel, den Zertifikaten und der
Uhr der Firma, die man ihm gibt, nimmt die Genesis nur von dem Konto, das den Tresor angelegt hat,
will danach einen Verwalter nach seiner Uhr, nimmt einen
Schlüsselwechsel nur mit dem neuen Schlüssel für genau die Mitglieder und Versionen nur in der
aktuellen Epoche (P-11); der gemeinsame Vertrag (`sync/test/contract.ts`) hält beide
gleich.

Zusammenführen heißt dreiseitig gegen den Stand, von dem die Änderung ausging: Was nur eine Seite
geändert hat, gilt; haben beide dasselbe Feld unterschiedlich geändert, bleibt der Wert, der schon
auf dem Server liegt, und der eigene kommt in die früheren Werte des Eintrags. Hat die eigene Seite
dabei Name oder Art des Felds geändert, bleibt das eigene Feld als eigenes Feld daneben stehen;
Titel und Typ der eigenen Seite kommen in die früheren Werte. Tags beider Seiten bleiben, entfernt
wird, was eine Seite entfernt hat. So geht beim Abgleich nichts verloren. Die früheren Werte
kürzt erst eine spätere Änderung auf einem Gerät auf die zehn neuesten je Feld, der Abgleich selbst
nie.

Fehlt in einer Antwort des Servers ein Eintrag, den das Gerät kennt, meldet der Client das als
verborgenen Eintrag (E-15), eine ältere Version als die bekannte als zurückgespielten Stand (E-13); Löschen geschieht nur über einen signierten Grabstein. Was der Client
ablehnt, sammelt ein Abgleich über alle Abrufe, auch die nach einem Konflikt.

Über HTTP (alle Routen brauchen eine Sitzung und sehen nur Tresore der eigenen Firma):

| Route | Zweck |
| --- | --- |
| `POST /api/vaults` | Tresor anlegen; die ID wählt der Client, eine vergebene ID ist vergeben (409) |
| `GET /api/vaults/:id/records` | die neueste Version jedes Eintrags |
| `GET /api/vaults/:id/entries/:entry/versions` | alle Versionen eines Eintrags |
| `PUT /api/vaults/:id/records` | nur als nächste Version; sonst 409 mit dem aktuellen Stand |
| `GET /api/vaults/:id/events` | SSE: `ready`, dann je neue Version `record` mit Eintrag und Version |

Der Server prüft nur, was er ohne Schlüssel prüfen kann: die Firma, die nächste Versionsnummer, dass
der Autor eines Eintrags die angemeldete Person ist, und höchstens 1 MiB je Eintrag. Ein Ereignis
sagt nur, dass es Neues gibt; der Client holt den Eintrag und prüft ihn wie jeden anderen. Wer
Mitglied eines Tresors ist, prüft der Server noch nicht – das steht im signierten Log und kommt mit
den Tresor-Rechten (K-305); bis dahin schützt die Verschlüsselung, und ein Test liest die Datenbank
und findet keinen Klartext.

Umgesetzt in `packages/core/src/sync/` (Zod-Schemas für Einträge, Log-Einträge und Zertifikate,
Warteschlange, Zusammenführen, Server-Ersatz im Speicher, HTTP und SSE), mit Mutation-Tests bei
100 %, und `apps/server/src/sync/` (Tabellen `vaults` und `entry_records`, Routen, Live-Ereignisse).

Ein **Server-Ersatz** (`packages/core/src/standin/`) bietet dieselbe Sync-API als `fetch`, der
alles im Speicher hält, Live-Ereignisse eingeschlossen; damit laufen Client-Tests ohne Server, und
später die Demo (K-706). Eine Vertrags-Testreihe (`sync/test/contract.ts`) läuft gegen den Ersatz
und gegen den echten Server, mit Status und Antwort jeder Anfrage; weicht einer ab, schlägt sie
fehl. Seitdem antwortet der Server auch auf unbekannte Routen mit JSON.

**Wehrt ab:** E-13, E-15.

### P-22 Offline-Kopie

Die Web-App entsperrt und liest auch ohne Server (K-308 Teil b). Dafür hält jedes Gerät eine Kopie
in IndexedDB (Datenbank `kennwort-offline`), und zwar nur, was ohnehin verschlüsselt ist oder der
Server sowieso hat:

| Schlüssel in der Kopie | Inhalt | Geschrieben |
| --- | --- | --- |
| `account` | Konto-ID, zu der die Kopie gehört | beim Öffnen eines Kontos |
| `keys` | Konto-Salt, AK verpackt unter Passphrase und Recovery Key, Schlüsselblock, Kontozustand (alles F-01 unter AK bzw. den Entsperr-Schlüsseln) | nach jedem Entsperren mit Server, wenn der Kontozustand mit diesem AK aufgeht |
| `state` | der Kontozustand, wie dieses Gerät ihn zuletzt kannte (F-01 unter AK, Zweck `account-state`, mit Zähler) | nach dem Entsperren und nach jedem Schreiben des Kontozustands |
| `read:<pfad>` | die Antworten des Servers auf Tresorliste, Log und verpackte Tresor-Schlüssel je Tresor, Firma, Mitglieder (ohne Namen) und Freigaben | bei jeder Antwort 200 auf diese Abrufe |
| `records:<tresor>` | je Eintrag der Datensatz mit der höchsten Version, die die Prüfung nach P-09 bestanden hat, so verschlüsselt, wie der Server ihn schickt | nach jedem Abruf und Schreiben |
| `synced` | wann die Tresorliste zuletzt vom Server kam | mit der Tresorliste |

Nie in der Kopie: Passphrase, Secret Key (der liegt wie bisher im `localStorage`, Projektplan,
Entscheidungen), AK, private Schlüssel, Tresor- oder Eintrags-Schlüssel, Klartext eines Eintrags
und die Namen der Mitglieder. Ein Playwright-Test durchsucht die Kopie nach Titel, Benutzername,
Passwort und Website eines Eintrags, dem Tresor-Namen, Passphrase, Secret Key und Recovery Key.

Ablauf:

1. **Entsperren mit Server**: wie in [P-03](#p-03-entsperren). Danach legt das Gerät den Kontozustand
   des Servers mit dem eigenen aus `state` zusammen (`mergeStates`, der höhere Stand gewinnt) und
   speichert `keys` und `state`. Widersprechen sich beide (anderer Wurzelschlüssel, anderes Bündel,
   anderer Hash an derselben Stelle eines Logs), behält das Gerät seinen eigenen Stand; was dann nicht
   zu ihm passt, lehnen die Prüfungen der Tresore ab. Ebenso beim Entsperren mit dem Recovery Key
   ([P-12](#p-12-recovery-kit)). Einen Kontozustand mit kleinerem Zähler als dem in `state` legt das
   Gerät nicht ab: Er ist älter, auch wenn sein Speichern erst nach einem neueren endet.
2. **Entsperren ohne Server**: Bekommt die Anmeldung gar keine Antwort (nicht: eine Ablehnung), leitet
   das Gerät aus Passphrase und Secret Key wie in F-05 ab, öffnet AK aus `keys`, den Schlüsselblock
   und den Kontozustand aus `state`. Eine falsche Passphrase scheitert wie online an der AAD.
   Aus derselben Ableitung behält es den Anmelde-Schlüssel ([P-02](#p-02-anmelden)) im Speicher, nie
   die Passphrase; beim Sperren überschreibt es ihn wie AK. Ein Token gibt es bis dahin nicht.
3. **Lesen ohne Server**: Die Tresore lädt die App aus `read:<pfad>` und prüft sie genau wie die
   Antworten des Servers (`verifyLog` gegen den Kontozustand, Bindung des Tresor-Schlüssels,
   Zertifikate gegen den gepinnten Wurzelschlüssel). Die Einträge holt sie aus `records:<tresor>`
   und prüft jeden Datensatz nach P-09. Die Kopie ist für den Client nur ein weiterer Server, dem er
   nicht vertraut.
4. **Nur lesen**: Solange der Server nicht antwortet, zeigt die App „Offline – nur lesen“ mit der
   Zeit des letzten Abgleichs und bietet weder Anlegen, Bearbeiten, Favorit noch Teilen an. Eine
   Warteschlange für Änderungen ohne Server baut die Web-App nicht.
5. **Wieder online**: Sobald der Browser eine Verbindung meldet und sonst alle 30 Sekunden versucht
   die App den Server. Wurde ohne Server entsperrt, meldet sie sich mit dem Anmelde-Schlüssel an
   (`signInWithLoginKey`), legt den Kontozustand des Servers mit dem eigenen zusammen und überschreibt
   den Anmelde-Schlüssel. Dann lädt sie alle Tresore neu, mit allen Prüfungen.

**Zurückspielen**: Eine alte Kopie hilft einem bösartigen Server nicht, das Gerät zurückzuwerfen.
Der Kontozustand in `state` ist unter AK versiegelt, der Server kann ihn weder lesen noch fälschen,
und er geht in jeden Kontozustand ein, den der Server liefert: Ein kürzeres Log oder ein anderer Hash
an bekannter Stelle bleibt ein Angriff (E-07), auch wenn der Server einen älteren Kontozustand
ausliefert. Ein Tresor, den das Gerät neu öffnet, zieht seine Einträge zuerst aus `records:<tresor>`
und dann vom Server: Eine ältere Version als die gespeicherte meldet es als zurückgespielt (E-13),
einen fehlenden Eintrag als verborgen (E-15). In `records:<tresor>` kommt nur, was die Prüfung nach
P-09 besteht, und je Eintrag nur eine höhere Version in keiner älteren Epoche
([P-11](#p-11-austritt-und-schlusselwechsel)); ein gefälschter Datensatz kann also nicht ersetzen,
wogegen das Gerät prüft, und eine Version, die ein vom Wechsel ferngehaltenes Mitglied unter dem
alten Schlüssel geschrieben hat, verdrängt die neu verschlüsselte nicht. Geprüft wird unter dem Schlüssel der Epoche des Datensatzes:
Nach einem Schlüsselwechsel ([P-11](#p-11-austritt-und-schlusselwechsel)) bleibt auch eine
Version, die noch nicht neu verschlüsselt ist, in der Kopie und offline lesbar, und die
Tresor-Schlüssel aller Epochen kommen wie online aus `read:<pfad>`.

**Sperren und Abmelden**: Sperren lässt die Kopie liegen – sie ist verschlüsselt und genau das, was
das Entsperren ohne Server braucht. „Dieses Gerät abmelden“ löscht sie ganz, ebenso das Öffnen eines
anderen Kontos auf dem Gerät. Ohne IndexedDB (manche private Fenster) hält das Gerät keine Kopie und
braucht den Server wie zuvor.

Restrisiko:

- Wer das Gerät hat, hat die Kopie und den Secret Key; er muss weiter die Passphrase raten, und das
  offline, ohne die Sperre des Servers nach fünf Fehlversuchen. Argon2id (F-05) bremst ihn. Das ist
  dasselbe wie bei 1Password und Bitwarden, die ihre Daten ebenso verschlüsselt auf dem Gerät halten.
- Was die Kopie zeigt, ist der Stand des letzten Abgleichs: Ein Eintrag, den jemand seitdem geändert
  hat, oder ein Zugriff, den ein Verwalter seitdem entzogen hat, ist auf diesem Gerät bis zum
  nächsten Abgleich noch in der alten Fassung lesbar. Entziehen schützt ohnehin erst mit einem
  Schlüsselwechsel vor dem, was jemand schon hatte (P-11).
- Wird dieses Gerät von einem anderen abgemeldet, löscht das die Kopie erst, wenn dieses Gerät selbst
  abgemeldet wird; sie bleibt verschlüsselt.
- Hat sich die Passphrase auf einem anderen Gerät geändert, passt der Anmelde-Schlüssel aus der
  alten Kopie nicht mehr: Die App bleibt offline, bis man sperrt und mit der neuen Passphrase
  entsperrt. Nach der ersten Ablehnung überschreibt sie den Anmelde-Schlüssel und versucht es nicht
  weiter, sonst sperrten ihre Versuche alle 30 Sekunden das Konto nach fünf Fehlversuchen für alle
  Geräte.

Umgesetzt in `apps/web/src/offline/` (Kopie in IndexedDB, `fetch` mit der Kopie dahinter, Hinweis,
erneuter Versuch), `apps/web/src/session/offline-unlock.ts`, `packages/client/src/entries/entry-store.ts`
(mit Web-App und Extension geteilt; die Kopie gibt nur die Web-App hinein, die Extension hat keine)
und `packages/core/src/auth/sign-in.ts` (`signInWithLoginKey`, „unreachable“ für keine Antwort).

**Wehrt ab:** E-07, E-13, E-15.
