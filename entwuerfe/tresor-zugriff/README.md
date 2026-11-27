# Tresor-Zugriff ohne Gruppen

Entwurf und Plan für den Umbau von **Team → Tresore**. Dieses Dokument ist für den Agenten, der es
umsetzt; es steht für sich und braucht keinen Zugang zu einer anderen Unterhaltung. Der Bauliste-Punkt
ist **K-608** in `BAULISTE.md`.

Vor dem Start lesen: `AGENTS.md`, `docs/mitwirken.md`, `docs/entwicklung.md` (vor allem Solid 2.0),
`DESIGN.md` und `.agents/skills/checks/SKILL.md`. Solid 2.0 ist nicht Solid 1.x: zuerst
`docs/solid-2.0/MIGRATION.md`.

## Inhalt dieses Ordners

| Datei | Was |
| --- | --- |
| `prototyp.html` | Klickbarer Prototyp, im Browser öffnen. Oben umschalten zwischen Desktop, Tablet und Handy. Er ist die Vorlage für Aufbau, Abstände, Texte und Verhalten. |
| `bilder/desktop.png` | Tresor „Büro“ am Desktop: Liste, Personen nach Rolle, Verlauf |
| `bilder/desktop-hinzufuegen.png` | Feld „Person hinzufügen“ mit Chip und Vorschlägen |
| `bilder/desktop-menue.png` | Menü „⋯“ einer Person: Rolle, befristen, entfernen |
| `bilder/desktop-entfernen.png` | Rückfrage beim Entfernen mit Schlüsselwechsel |
| `bilder/desktop-hell.png` | Desktop im hellen Modus |
| `bilder/tablet-anfrage.png` | Tablet mit offener Zugriffsanfrage |
| `bilder/handy-tresore.png` | Handy: Liste der Tresore |
| `bilder/handy-tresor.png` | Handy: ein Tresor |
| `bilder/handy-menue.png` | Handy: Menü einer Person als Sheet |
| `bilder/handy-hinzufuegen.png` | Handy: Personen hinzufügen als Sheet |

Der Prototyp nutzt Testdaten (Weber Haustechnik) und speichert nichts. Er ist kein Code für die App.

## Entscheidung

**Gruppen fallen ganz weg.** Zugriff auf einen Tresor hat, wer direkt Mitglied ist, mit einer Rolle
(Lesen, Bearbeiten, Verwalten) und optional einem Ende („Zugriff bis“).

Warum:

- Mit Gruppen gab es zwei Wege in einen Tresor (direkt und über eine Gruppe). Entfernen nahm deshalb
  nicht immer den Zugriff, und die Rolle hing davon ab, auf welchem Weg man drin war. Fünf
  Überarbeitungen der Oberfläche (#152 bis #156) haben das nicht verständlich gemacht.
- Für die Zielgruppe (kleine Betriebe, 3 bis 30 Personen) bringen Gruppen fast nichts: Wer geht, wird
  mit „Austritt aus der Firma“ aus allen Tresoren genommen; wer neu kommt, wird in die Tresore
  aufgenommen, die er braucht.
- **Niemand verliert Zugriff.** Den Tresor-Schlüssel bekommt jede Person einzeln, und jede Aufnahme
  steht einzeln signiert im Mitglieder-Protokoll. In keinem signierten Format steht eine Gruppe; „über
  Gruppe X“ kam nur aus Serverdaten. Nach dem Umbau bleibt jeder in seinen Tresoren.
- Die Übernahme von Gruppen aus dem Anmeldedienst (OpenID Connect, groups-Claim) fällt mit weg. Die
  Anmeldung über den Anmeldedienst selbst bleibt.

## Der Entwurf

### Aufbau

**Team** hat zwei Reiter: **Mitglieder** und **Tresore**. Der Reiter Gruppen entfällt.

Unter **Tresore** zwei Bereiche: links die Liste der Tresore, rechts der gewählte Tresor. Ab einer
Inhaltsbreite von 1020 px kommt rechts eine dritte Spalte mit **Verlauf** und **Rollen**. Die Breite
richtet sich nach dem Inhaltsbereich (Container Query), nicht nach dem Fenster, wie in `DESIGN.md`
für die Eintragsansicht.

| Inhaltsbreite | Aufbau |
| --- | --- |
| ab 1020 px | Liste (264 px) · Tresor · Verlauf und Rollen (300 px) |
| 600 bis 1020 px | Liste (232 px) · Tresor; Verlauf und Rollen nebeneinander unter den Personen |
| unter 600 px | eine Ebene nach der anderen: Liste, dann Tresor mit Zurück-Pfeil; Verlauf unter den Personen; Menüs und „Personen hinzufügen“ als Sheet von unten; Tippflächen mindestens 44 px |

### Liste der Tresore

- Abschnitt „Geteilte Tresore“: je Tresor Symbol, Name (eine Zeile, notfalls mit „…“), darunter
  „N Personen“ oder „Nur du“. Hat der Tresor offene Anfragen und verwaltest du ihn, rechts ein blauer
  Punkt mit der Zahl.
- Darunter „Neuer Tresor“ (öffnet das vorhandene Formular zum Anlegen).
- Abschnitt „Nur für dich“: „Persönlich“ mit Schloss und „Wird nicht geteilt“. Rechts steht dafür nur
  ein Hinweis, dass dieser Tresor nur dir gehört und sich nicht teilen lässt; keine Personen, kein
  Hinzufügen.
- Am Handy: große Überschrift „Tresore“, Zeilen 64 px mit Pfeil rechts.

### Kopf des Tresors

- Symbol (48 px), Name (22 px, am Handy 28 px), darunter Chips: „N Personen“, „N Einträge“ und grün
  „Protokoll geprüft“. Den grünen Chip nur zeigen, wenn das Gerät das Protokoll wirklich geprüft hat
  (`DESIGN.md`: Grün heißt geprüft). Verwaltest du den Tresor nicht, ein Chip „verwaltet von Sandra“.
- Rechts „⋯“ für Umbenennen und Löschen (falls vorhanden; sonst weglassen).

### Personen hinzufügen (nur wer verwaltet)

- **Desktop und Tablet:** Ein Feld direkt unter dem Kopf: Lupe, Eingabe „Person hinzufügen …“, rechts
  daneben die Rolle (Vorgabe „Lesen“, öffnet ein Menü mit den drei Rollen) und der Hauptknopf
  „Hinzufügen“ (deaktiviert, solange niemand gewählt ist).
- Beim Fokus oder Tippen klappt **im Feld** (nicht darüber schwebend) die Liste der Vorschläge auf:
  alle Personen der Firma, die noch nicht im Tresor sind, gefiltert nach Name und E-Mail. Personen ohne
  bestätigte Schlüssel stehen ausgegraut mit „Schlüssel noch nicht bestätigt, danach möglich“ und
  sind nicht wählbar.
- Gewählte Personen werden Chips im Feld (Avatar, Vorname, ×). Mehrere sind möglich. Tastatur: Pfeile
  wählen, Enter übernimmt den Vorschlag bzw. fügt hinzu, wenn das Feld leer ist, Rücktaste entfernt
  den letzten Chip, Esc schließt die Vorschläge.
- Unter dem Feld ein Satz: „Wer hinzukommt, sieht alle 23 Einträge.“ bzw. „1 Person bekommt
  Lesezugriff und sieht alle 23 Einträge.“ Rechts daneben „Befristen“: blendet ein Datum „Befristet
  bis“ ein (Tage in der Vergangenheit nicht wählbar).
- **Handy:** Statt des Felds ein breiter Hauptknopf „Personen hinzufügen“. Er öffnet ein Sheet: Suche,
  Liste mit Häkchen, die drei Rollen als Karten mit Satz, unten „Abbrechen“ und „Hinzufügen“ bzw.
  „2 hinzufügen“.
- Nach dem Hinzufügen erscheinen die Personen in ihrer Rollen-Gruppe, kurz grün hinterlegt, mit
  „gerade eben aufgenommen“. Meldung unten: „Tim hinzugefügt · Lesen“. **Kein „Rückgängig“**: Ein
  Rückgängig wäre ein Entfernen mit Schlüsselwechsel.
- Technik: `addToVault` aus `apps/web/src/vaults/vault-members.ts` je gewählter Person mit Rolle und
  `validUntil`.

### Anfragen

- Offene Anfragen stehen als blauer Hinweis zwischen Feld und Personen: Avatar, „Tim Kaya möchte
  Zugriff“, darunter „Über den Link zum Tresor angefragt“ und die Zeit, rechts „Ablehnen“ (ohne
  Rahmen) und „Freigeben“.
- „Freigeben“ nimmt mit „Lesen“ auf (Vorschlag aus Gruppen fällt weg); die Rolle lässt sich danach in
  der Zeile ändern. Technik: `grantRequest` und `declineRequest`.

### Personen nach Rolle

- Drei Abschnitte in dieser Reihenfolge, leere weglassen: **Verwalten**, **Bearbeiten**, **Lesen**.
  Jeder mit kleinem Symbol (Zahnrad, Stift, Auge), Name, Anzahl und rechts einem Satz, was die Rolle
  darf (am Handy ohne den Satz).
- Darunter eine Karte mit einer Zeile je Person (mindestens 56 px, am Handy 64 px): Avatar mit
  Initialen, Name, bei dir ein kleines „du“, darunter:
  - „seit 20.05.2026 · von Jonas“ (Zeitpunkt und Unterzeichner der letzten Aufnahme aus dem Protokoll),
  - beim Anleger „hat den Tresor angelegt“,
  - bei befristetem Zugriff vorneweg gelb in Geist Mono „bis 31.12.2026“; ist er abgelaufen,
    „abgelaufen“ wie heute.
- Rechts „⋯“ (nur wer verwaltet, nicht in der eigenen Zeile). Wer nicht verwaltet, sieht die Liste ohne
  „⋯“ und darunter: „Nur wer einen Tresor verwaltet, ändert, wer drin ist. Brauchst du etwas, frag
  Sandra.“
- Hast nur du Zugriff, darunter gestrichelt: „Bisher hast nur du Zugriff. Tippe oben einen Namen ein,
  damit andere die Einträge in Werkstatt sehen.“

### Menü „⋯“ einer Person

- Desktop und Tablet: Popover an „⋯“ (Popover-API wie das Menü der Einträge), am Handy Sheet von unten.
- Kopf: Avatar und Name. Dann die drei Rollen als `menuitemradio` mit Häkchen, je mit einem Satz und dem
  Symbol rechts. Trennlinie. „Zugriff befristen …“ bzw. „Befristet bis 31.12.2026 …“. „Aus Büro
  entfernen …“ in `--danger`.
- **Rolle wechseln** gilt sofort (`changeVaultRole`), Meldung „Max: Lesen → Bearbeiten“ mit
  „Rückgängig“ (setzt die alte Rolle wieder, das ist nur ein weiterer Protokolleintrag).
- **Befristen** öffnet einen kleinen Dialog mit Datum, „Ohne Ende“ (falls befristet), „Abbrechen“,
  „Speichern“. Technik: `changeAccessOf` mit neuer `validUntil`, Rolle unverändert.
- **Entfernen** öffnet einen echten `<dialog>` (`alertdialog`, Fokus auf „Abbrechen“):
  „Max aus Büro entfernen?“, „Max Brandt sieht Büro danach nicht mehr. Dein Gerät erledigt dafür drei
  Dinge:“ 1. Neuer Schlüssel für Büro, den Max nie bekommt. 2. Alle 23 Einträge neu verschlüsselt.
  3. Was Max lesen konnte, landet unter Zum Ändern. Darunter gelb: „Passwörter, die Max kannte,
  schützt erst ein neues Passwort beim jeweiligen Dienst. „Zum Ändern“ zeigt dir, welche.“ Knöpfe
  „Abbrechen“ und „Entfernen“ in `--danger`. Technik: `exits.remove` (`apps/web/src/vaults/exit.ts`),
  wie heute.

### Verlauf und Rollen

- **Verlauf** zeigt das Mitglieder-Protokoll des Tresors in Sätzen, neueste zuerst, höchstens fünf
  Einträge (ein „Alle anzeigen“ darf folgen). Die Daten stehen schon im geprüften Protokoll
  (`vault.log`, Felder in `packages/core/src/membership/log-entry.ts`: `action`, `accountId`, `role`,
  `validUntil`, `time`, `signerId`). Sie liegen auf dem Server, jedes Gerät lädt und prüft sie vor dem
  Öffnen; es ist die ganze Geschichte seit dem Anlegen, nicht nur die Sitzung. Kein neuer Server-Code.
  - `create`: „Jonas hat Büro angelegt“
  - `add`: „Jonas hat Max aufgenommen · Lesen“ (mit Ende: „… bis 31.12. aufgenommen“)
  - `role`: „Jonas hat Sandra auf Bearbeiten gesetzt“ (bzw. die neue Befristung)
  - `remove`: „Jonas hat Ole entfernt“
  - `rotate`: „Schlüssel gewechselt“
  - `rekey`: „Neue Schlüssel für Max eingetragen“
  - Darunter Datum, bei heute „heute, 08:12“. Symbole: Plus grün (add), Minus rot (remove), Schlüssel
    gelb (rotate), sonst grau.
  - Anfragen sind **nicht** im Protokoll und erscheinen nicht im Verlauf.
- **Rollen**: die drei Rollen mit Symbol und Satz.
- Unten mit grünem Schild: „Jede Änderung ist von einem Verwalter signiert. Dein Gerät hat das
  Protokoll vor dem Öffnen geprüft.“

### Texte

Alle Texte aus dem Prototyp über Paraglide, Deutsch und Englisch, mit Einzahl und Mehrzahl. Vorhandene
Schlüssel weiterverwenden, wo sie passen (`vault_members_*`, `vaults_*`); neue mit dem Präfix
`vault_access_`.

## Plan: vier Pull Requests

Jeder Schritt ein eigener Pull Request nach `docs/mitwirken.md` (Titel z. B. `K-608: Gruppen aus dem
Server entfernen`, Tests zuerst, `bun run check` und Playwright grün, Doku im selben Pull Request).
Schritt 1 und 2 berühren Zugriffsprüfungen in `apps/server` und sind damit sicherheitsrelevant: vor dem
Merge ein unabhängiges Review nach Skill `tdd-review` (`BAULISTE.md`, „So arbeitet der Loop“).

### 1. Oberfläche: Tresore neu, Gruppen-Reiter weg

Zuerst die Oberfläche, damit nichts mehr Gruppen aufruft.

- `apps/web/src/vaults/`: Seite und Panel nach dem Entwurf. Aus `vault-members-dialog.tsx` bleiben die
  Logik von `AddForm` und `MemberRow`; `viaGroups`/`direct`/`outside` (Zeilen etwa 14, 20, 58, 80–92,
  214, 221, 262–264) und `VaultGroups` fallen weg. `vault-groups.tsx` löschen. `dialog-state.ts` lädt
  nur noch Anfragen (`DialogApi = VaultDeps`). `vault-requests.tsx`: `suggestedRole` fällt weg,
  Freigeben mit „read“; `suggested-role.test.ts` anpassen. `role-select.tsx` bleibt, wo es passt.
- Neu, als reine Funktionen mit Vitest: Gruppierung nach Rolle, Text je Protokolleintrag für den
  Verlauf, „seit … · von …“ je Person aus `vault.log`.
- `apps/web/src/groups/` ganz löschen (mit Tests).
- `frame/team-page.tsx` (Reiter „groups“), `frame/sections.ts:35`, `frame/pages.tsx`, `frame/frame.tsx`
  (`/groups`; `/team` ohne Mitglieder-Recht fällt auf Tresore statt Gruppen zurück), `routes.ts`,
  `router.ts`, `queries.ts` (`queryKeys.groups`), `app.tsx` (`GroupsPage`, `focusGroupId`,
  `onManageGroup`), `app-stores.ts`, `vaults/vaults-page.tsx` (`onManageGroup`).
- `/groups` leitet auf `/vaults` um, damit alte Links nicht ins Leere gehen.
- Demo: `demo.ts`, `demo.json`, `demo/demo-store.ts`, `demo/seed.ts`, `demo/demo-team-routes.ts`
  (Gruppen-Handler weg, Anfragen bleiben). Die Demo-Daten aus dem Prototyp übernehmen (Tim mit
  Anfrage bei Baustellen-Tablets, Lea ohne bestätigte Schlüssel), soweit es die Demo hergibt.
- `oidc/oidc-section.tsx`: Karte „Gruppen“ (`data-testid="oidc-groups"`) weg.
- `notifications/notification-text.ts`: Text für `group-left` weg. Nicht anfassen: `PushGroup`,
  `push_group_*`, `groupOf` (Gruppierung von Push-Karten, hat mit diesem Feature nichts zu tun) und
  `settings_group_*`.
- Texte: die 45 Schlüssel des Features in `messages/de.json` und `messages/en.json` löschen
  (`groups_*`, `vault_groups_*`, `oidc_groups*`, `oidc_group_count`, `nav_groups`, `team_groups`,
  `notifications_group_left`, `push_kind_group_left`, `push_desc_group_left`); `oidc_link_text` ohne
  Gruppen umformulieren.
- Tests: `app.test.tsx`, `navigation.test.ts`, `router.test.ts`, `queries.test.ts`,
  `oidc-section.test.tsx`, `notification-text.test.ts` anpassen. Playwright: `e2e/frame.spec.ts`
  (Titel `/groups`), `e2e/vaults.spec.ts` (Block `describe("groups")` ersetzen durch die Abläufe
  unten), `e2e/oidc.spec.ts` (Gruppen-Feld und Test „group the provider names later“ weg).

### 2. Client und Server: Gruppen entfernen

- `packages/client/src/session/groups-api.ts` löschen, aus `api.ts` entfernen.
- `packages/core/src/sync/wire.ts`: `GroupsWire`, `VaultGroupsWire` und ihre Exporte in `index.ts`
  weg; `VaultRequestsWire.role` weg oder fest `null`. Tests in `sync/wire.test.ts`.
- `packages/core/src/notifications/wire.ts`: Kind `"group-left"` aus dem Enum. Achtung: gespeicherte
  Mitteilungen und Push-Einstellungen mit `group-left` würden dann nicht mehr parsen; die Migration
  (Schritt 3) löscht sie, oder das Parsen überspringt unbekannte Arten. Test dafür.
- `packages/core/src/auth/oidc.ts`: `MappedGroup`, `groupsClaim` und `groups` aus `OidcStatusWire`.
- Server: `sync/group-routes.ts` und `sync/group-links.ts` löschen, aus `app.ts` (Zeilen 32, 165)
  nehmen. `sync/request-routes.ts`: `linkedRoles` weg, Anfrage per Insert mit
  `onConflictDoNothing`, Mitteilung nur bei neuer Anfrage; `role` in der Antwort weg. `oidc/groups.ts`
  löschen; Aufrufe in `oidc/callback.ts` und `oidc/routes.ts` entfernen; `oidc/api-routes.ts`
  (`mapping()`, `groupsClaim`), `oidc/store.ts` (Ticket `groups`), `oidc/settings.ts`
  (`KENNWORT_OIDC_GROUPS_CLAIM`). `account/erase.ts`, `account/members.ts`,
  `account/privacy-export.ts` (Abschnitt `groups` im Export). Fake-IdP in `testing/` ohne Gruppen.
- Server-Tests: `sync/group-routes.test.ts`, `sync/group-review.test.ts`, `oidc/groups.test.ts`
  löschen; anpassen: `tenancy/tenancy.test.ts`, `account/members-leave.test.ts`, `oidc/oidc.test.ts`,
  `settings.test.ts`, `oidc-companies.test.ts`, `jwt.test.ts`, `provider.test.ts`,
  `adversary/oidc-attacks.test.ts` (E-27), `database.test.ts`. Angriffe, die nur über Gruppen liefen,
  fallen mit weg; die übrigen (E-27 ohne Gruppen) bleiben.

### 3. Datenbank

- Neue Migration mit `bun run db:generate` in `apps/server` (erzeugt `drizzle/00xx_*.sql` und schreibt
  `src/db/migrations.gen.ts` neu; nie von Hand ändern, nie 0016 oder 0026 ändern). Sie löscht die
  Tabellen `groups`, `group_members`, `vault_groups`, die Spalten `vault_requests.via_group` und
  `oidc_tickets.groups` und Mitteilungen der Art `group-left`.
- Schema in `src/db/sync-schema.ts` (Zeilen 90–141) und `src/db/oidc-schema.ts` (54, 66) anpassen.
- Test: Eine Datenbank mit Gruppen, Verknüpfungen und Mitgliedern aus Gruppen wird migriert; danach
  sind alle Tresor-Mitglieder unverändert da und jeder öffnet seine Tresore (Mitglieder-Protokoll
  unberührt).

Schritt 2 und 3 dürfen ein Pull Request sein, wenn die Tests sonst nicht grün werden.

### 4. Doku

- `docs/tresore.md`: Abschnitt „Gruppen“ weg; „Mitglieder eines Tresors“ nach dem Entwurf neu
  (Hinzufügen per Feld, Menü „⋯“, Verlauf).
- `docs/team.md`: zwei Reiter, Abschnitt „Gruppen“ weg.
- `docs/anmeldedienst.md`: Abschnitt „Gruppen“ und `KENNWORT_OIDC_GROUPS_CLAIM`, `groups`-Scope und
  Mapper-Hinweise für Keycloak und Entra weg.
- `docs/verwaltung.md` („Tresore und Gruppen“ → „Tresore“), `docs/datenschutz.md`,
  `docs/ueberblick.md`, `docs/index.md`, `docs/mitteilungen.md` (`group-left`), `README.md`.
- `docs/sicherheitsdesign.md`: P-25 heißt „Anmeldung über OpenID Connect“ (Anker ändern und alle Links
  darauf nachziehen, auch aus `anmeldedienst.md`), Gruppen-Teile aus P-05, P-25, P-28, der Tabelle der
  Mitteilungen und E-27 entfernen. `scripts/security-design.test.ts` muss grün bleiben.
- `docs/plan.md`: Entscheidung „Keine Gruppen“ mit Datum und Grund (siehe oben), alte
  Gruppen-Entscheidungen als ersetzt markieren.
- `DESIGN.md`: Abschnitt **Team** (zwei Reiter, Adressen `/members` und `/vaults`, `/groups` leitet um)
  und eine Regel für die Seite Tresore nach diesem Entwurf; Zeilen 95–96 und 121–122.
- Screenshots der Doku: **Actions → Update screenshots**.
- Danach diesen Ordner `entwuerfe/tresor-zugriff/` löschen und die Zeile in `AGENTS.md` entfernen,
  falls kein anderer Entwurf mehr dort liegt.

## Fertig, wenn

- Unter Team gibt es nur Mitglieder und Tresore; `/groups` leitet auf `/vaults` um.
- Die Seite Tresore sieht aus und verhält sich wie `prototyp.html` und die Bilder, hell und dunkel, bei
  den drei Breiten.
- Kein Code, keine Tabelle, kein Text und keine Doku nennt noch Gruppen dieses Features
  (`grep -ri "group" apps packages` zeigt nur KeePass-, Push- und Einstellungs-Gruppen und SQL
  `groupBy`).
- Playwright desktop und `@phone`:
  1. Jonas fügt Tim und Sandra mit „Bearbeiten“ zu Büro hinzu; beide stehen unter Bearbeiten.
  2. Lea ist im Vorschlag ausgegraut und nicht wählbar.
  3. Jonas setzt Max auf Bearbeiten, nimmt es mit „Rückgängig“ zurück.
  4. Jonas befristet Annas Zugriff; die Zeile zeigt „bis …“.
  5. Jonas entfernt Max; die Rückfrage nennt Schlüsselwechsel und Zum Ändern; danach ist Max weg und
     der Verlauf zeigt Entfernen und Schlüsselwechsel.
  6. Tim fragt über den Link an; Jonas sieht den Hinweis und gibt frei.
  7. In Lohn (verwaltet von Sandra) sieht Jonas kein Feld und kein „⋯“.
- Eine Datenbank mit Gruppen wird ohne Verlust von Tresor-Mitgliedern migriert (Test).
- Anmeldung über den Anmeldedienst funktioniert weiter (bestehende OIDC-Tests ohne Gruppen grün).
- Unabhängiges `tdd-review` ohne offene Befunde für die Schritte mit Server-Code.

## Später, nicht Teil dieses Umbaus

- Bei einer Person (Reiter Mitglieder) zeigen, in welchen Tresoren sie ist, und von dort in Tresore
  aufnehmen.
- „Zugriff wie … übernehmen“ beim Einrichten einer neuen Person.
