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
| Passphrase | Argon2id | RFC 9106 | `@noble/hashes` |
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
Log-Eintrag, in der signierten Freigabe, im signierten Notfall-Paket oder in der signierten
Firmen-Recovery-Hinterlegung. Ein Paket ohne passende signierte Bindung wird verworfen (E-16).
Zwei Fälle prüfen anders:

- **Private Schlüssel** (Firmen-Wurzelschlüssel, Firmen-Recovery-Schlüssel): Der öffentliche
  Schlüssel ist die Bindung seines privaten. Der Client leitet ihn aus dem entpackten privaten
  Schlüssel ab und vergleicht ihn mit dem gemerkten Wurzel-Fingerabdruck aus dem Schlüsselblock bzw.
  mit dem Fingerabdruck des Recovery-Schlüssels in der vom Wurzelschlüssel signierten Richtlinie.
- **Das Paket an ein neues Gerät** ([P-04](#p-04-neues-gerat)): Dort prüfen der QR-Code und der
  Vergleichscode auf beiden Geräten, wer verpackt hat.

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
`commitment.ts` (Bindungen) und `company-recovery.ts` (P-13).

Was ein Client sich merkt, um den Server zu prüfen, liegt im **Kontozustand**: Fingerabdruck des
Firmen-Wurzelschlüssels, bekannte Schlüsselbündel, der letzte Stand jedes Mitgliedschafts-Logs,
die höchste Version jedes Eintrags, die Einladungen, die das Konto zertifiziert hat, mit dem Konto
dazu, je Konto das Ausstellungsdatum des neuesten Zertifikats, das es gesehen hat, und die
höchste Version der Firmen-Richtlinie mit ihrer Sperrzeit. Er ist ein F-01-Geheimtext unter AK (Zweck `account-state`,
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
Web-App in `apps/web/src/session/` und `apps/web/src/account/`.

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

Das Gerät merkt sich Konto-ID und Secret Key (in der Web-App im `localStorage`), nie die Passphrase
und nie AK. Antwortet der Server nicht, entsperrt die Web-App aus ihrer Offline-Kopie
([P-22](#p-22-offline-kopie)). Der Secret Key ist der zweite Faktor gegen einen Server, der
Passphrasen errät: Wer nur die Daten des Servers hat, muss 128 Bit Secret Key mitraten. Wer das
Gerät hat, braucht weiter die Passphrase.

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
neuen Eintrag mehr. Seinen alten Schlüssel behält er trotzdem, bis der Schlüsselwechsel (K-307)
ein neues VK verteilt.

Der Name eines Tresors liegt als F-01-Geheimtext mit VKₑ beim Server (`PUT /api/vaults/:id/name`,
nur von Verwaltern, nur für die aktuelle Epoche):

```text
name = F-01(VKₑ, Name in UTF-8 NFC, 1 bis 100 Zeichen, zweck = "vault-name", kontext = tresor-ID, epoche)
```

Ein Name, den der Server aus einem anderen Tresor oder einer anderen Epoche herüberschiebt, lässt
sich nicht öffnen; der Client zeigt dann „Tresor ohne Namen“ (`sealVaultName`, `openVaultName` in
`packages/core/src/membership/vault-name.ts`). Restrisiko: Der Server kann einen früheren Namen
derselben Epoche zurückspielen. Die Web-App lädt jeden Tresor über `loadVaults`
(`apps/web/src/vaults/vaults.ts`): Log mit `verifyLog` gegen den gemerkten Stand prüfen, VKₑ nur
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
Wer entfernt und wieder aufgenommen wird, bekommt den Schlüssel neu verpackt. Den
`schlüsselwechsel` nimmt er erst mit K-307, das allen Mitgliedern das neue VK mitgibt. Ob ein
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
  neuer Wurzelschlüssel (K-307).
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
  Den Schalter für Firmen-Recovery bringt K-307 mit dem Firmen-Recovery-Schlüssel; das Format trägt
  ihn schon.
- Der gemerkte Fingerabdruck steht im Schlüsselblock unter AK
  ([Schlüsselhierarchie](#schlusselhierarchie)), nicht nur auf einem Gerät: Jedes Gerät des Kontos
  prüft gegen ihn, auch eines, das mit Passphrase, Recovery-Kit oder Firmen-Recovery entsperrt.

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
`apps/web/src/members/` und `apps/web/src/policy/`.

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

In der Web-App lädt `apps/web/src/entries/entry-store.ts` die Einträge jedes geöffneten Tresors
mit `pull` und `sync` aus `packages/core` und prüft jeden Datensatz gegen das geprüfte Log des
Tresors; entsperrte Inhalte liegen nur im Speicher.

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
- **Schlüsselwechsel:** Ein Schlüsselwechsel ([P-11](#p-11-austritt-und-schlusselwechsel), K-307)
  gibt jedem Eintrag des Tresors einen neuen EK. Damit öffnet keine bestehende Freigabe die neuen
  Versionen mehr, bis sie neu verpackt ist; das macht K-307 mit dem Schlüsselwechsel, wie beim
  Widerruf mit `reshare`.
- **Teilender verlässt den Tresor:** Der Server liefert eine Freigabe weiter aus, auch wenn ihr
  Teilender den Tresor inzwischen verlassen hat oder nur noch lesen darf; der Empfänger kennt das
  Log nicht und merkt es nicht. Nach dem Entfernen folgt ein Schlüsselwechsel (P-11, K-307), und
  danach öffnet die Freigabe keine neue Version mehr, bis ein Mitglied sie neu verpackt. Bis dahin
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

1. Ein Verwalter signiert `entfernen` und `schlüsselwechsel` (Epoche e + 1) im Log.
2. Er erzeugt VKₑ₊₁ und verpackt es an die verbleibenden Mitglieder; die Bindung steht im
   signierten `schlüsselwechsel`.
3. Jeder Eintrag bekommt einen **neuen EK** unter VKₑ₊₁ und wird mit neuer Version neu
   verschlüsselt. Das ausgetretene Mitglied kennt die alten EK; mit ihnen liest es keine spätere
   Änderung, auch nicht das geänderte Passwort.
4. Passwörter, die das ausgetretene Mitglied lesen konnte, werden „Zum Ändern“ markiert; der
   Austritts-Bericht listet sie.

Der Server sperrt das Mitglied sofort; den Schlüsselwechsel macht der nächste Verwalter-Client.
Restrisiko: Bis dahin entscheidet der Server allein; was das Mitglied vor dem Austritt gelesen hat,
kennt es weiter, deshalb gelten diese Passwörter erst nach ihrer Änderung als sicher. Änderungen
nach dem Schlüsselwechsel liegen unter neuen EK.

**Wehrt ab:** E-26, E-16.

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
weiterhin. Ist das Kit in fremde Hände geraten, schützt erst ein Wechsel von AK; der kommt mit dem
Schlüsselwechsel (K-307).

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

**Wehrt ab:** E-01.

### P-13 Firmen-Recovery

- Standard für Firmen, pro Firma abschaltbar (Projektplan, Entscheidungen). Der Firmen-Recovery-
  Schlüssel ist ein X-Wing-Schlüsselpaar; der private Teil liegt an die Inhaber verpackt.
- Der Client verpackt AK an den Firmen-Recovery-Schlüssel (F-02) nur, wenn die Firmen-Richtlinie
  vom Wurzelschlüssel signiert ist, Firmen-Recovery dort an ist und der Schlüssel dem dort genannten
  Fingerabdruck entspricht. Er signiert die Hinterlegung mit seinem zertifizierten Ed25519-Schlüssel
  (F-03, Zweck `company-recovery`, mit `bindung(AK, "company", konto-ID)`).
- Bevor der Inhaber einen hinterlegten AK verwendet, prüft sein Client: Die Signatur stammt vom
  zertifizierten Bündel des Mitarbeiters, AK passt zur Bindung, AK entschlüsselt den Schlüsselblock
  des Mitarbeiters, und dessen Wurzel-Fingerabdruck und öffentliche Schlüssel stimmen mit dem
  eigenen Wurzelschlüssel und dem zertifizierten Bündel überein. Ein AK, den der Server selbst
  verpackt hat, besteht keine dieser Prüfungen.
- Wiederherstellen: Der Inhaber entschlüsselt AK, verpackt ihn an ein neues Gerät des Mitarbeiters
  ([P-04](#p-04-neues-gerat)) und signiert einen Audit-Eintrag; statt des eigenen Kontozustands
  trägt das Paket den Hash des Kontozustands des Mitarbeiters, den der Inhaber mit dessen AK
  entschlüsselt hat. Den Wurzelschlüssel liest das neue Gerät aus dem Schlüsselblock des
  Mitarbeiters. Der Mitarbeiter legt danach neue Entsperr-Wege an.

Ein Server, der eine Wiederherstellung mit eigenem Schlüssel unterschiebt, scheitert an der
fehlenden Signatur der Richtlinie.

**Wehrt ab:** E-01, E-02, E-10.

### P-14 Notfallzugriff

1. Der Gebende wählt eine Person mit zertifiziertem Bündel, Tresore und eine Wartezeit; sein Client
   verpackt die VKₑ dieser Tresore an sie (F-02, Zweck `emergency`) und signiert die Freigabe mit
   Wartezeit und den Bindungen der verpackten Schlüssel.
2. Fragt die Person an, benachrichtigt der Server den Gebenden; widerspricht er nicht innerhalb der
   Wartezeit, gibt der Server die Pakete heraus.
3. Die Person prüft Signatur und Zertifikat, entpackt und vergleicht jeden Schlüssel mit seiner
   Bindung. Nach einem Schlüsselwechsel erneuert der Client des Gebenden die Pakete.

Restrisiko: Die Wartezeit setzt der Server durch; ein bösartiger Server kann sie verkürzen, aber nur
zugunsten einer Person, die der Gebende selbst gewählt hat (E-04 ist damit auf die Wartezeit
begrenzt, nie auf eine fremde Person).

**Wehrt ab:** E-04, E-05.

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

- Nur nach Klick oder Enter, nie beim Laden einer Seite.
- Nur bei exakt passendem Host (Public Suffix List über `tldts`); die URL kommt aus dem
  verschlüsselten Eintrag, nicht vom Server (E-14).
- Nie in einen Frame einer anderen Herkunft.
- Das Inline-Menü ist ein iFrame der Extension in einem geschlossenen Shadow DOM; die Seite kann es
  weder lesen noch unbemerkt überdecken (Clickjacking, DEF CON 2025).
- Am Handy kopiert Kennwort nur auf Tipp; die App leert die Zwischenablage nach 30 Sekunden und
  markiert sie als sensibel, die PWA kann das nicht zuverlässig.

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

**Wehrt ab:** E-21.

### P-20 Audit-Log

Jedes Ereignis ist ein Glied einer Hash-Kette (`hash = SHA-512/256(enc("kennwort/audit/v1",
vorgänger-hash, ereignis))`); Ereignisse, die ein Client auslöst (Export, Recovery, Schlüsselwechsel),
signiert er. Clients merken sich den letzten Stand, der Export für Prüfer enthält die Kette, und die
Prüfung findet jede geänderte, fehlende oder eingeschobene Zeile.

Ein Ereignis ist `enc("kennwort/audit-event/v1", firma, nr, zeit, wer, was, worum, signatur)`; die
Kette beginnt bei 32 Null-Bytes und hat je Firma eigene Nummern ab 0. Der Server schreibt selbst:
Anmeldung (jede neue Sitzung), Einladung erstellt und angenommen, Tresor angelegt. Ein Client
signiert `sign("audit", firma, wer, was, worum)` mit seinem Ed25519-Schlüssel; `worum` ist eine ID,
die er einmal wählt, dieselbe Handlung mit derselben ID zweimal gilt als wiederholt.

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
will danach einen Verwalter nach seiner Uhr und nimmt
keinen Schlüsselwechsel vor K-307; der gemeinsame Vertrag (`sync/test/contract.ts`) hält beide
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
   zu ihm passt, lehnen die Prüfungen der Tresore ab.
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
P-09 besteht, und je Eintrag nur eine höhere Version; ein gefälschter Datensatz kann also nicht
ersetzen, wogegen das Gerät prüft.

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
  entsperrt.

Umgesetzt in `apps/web/src/offline/` (Kopie in IndexedDB, `fetch` mit der Kopie dahinter, Hinweis,
erneuter Versuch), `apps/web/src/session/offline-unlock.ts`, `apps/web/src/entries/entry-store.ts`
und `packages/core/src/auth/sign-in.ts` (`signInWithLoginKey`, „unreachable“ für keine Antwort).

**Wehrt ab:** E-07, E-13, E-15.
