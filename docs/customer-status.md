# Kundenstatus ohne Anmeldung

## Verwendung

1. Eine Retoure öffnen und im Bereich **Öffentliche Kundenansicht** auf **Kundenstatus teilen** klicken.
2. Optional einen ausdrücklich öffentlichen Hinweis verfassen. Interne Notizen oder nächste Arbeitsschritte werden nicht automatisch übernommen.
3. Gültigkeit wählen: **7, 30 oder 90 Tage**; Standard **30 Tage** ab dem Speichern.
4. **Kundenlink erstellen** und **Link kopieren**. Unterstützt der Browser System-Teilen, gibt es zusätzlich **Link teilen**. **Öffnen** zeigt die Kundenansicht in einem neuen Tab.
5. Der aktive Link bleibt beim erneuten Öffnen kopierbar. **Link erneuern** ersetzt ihn sofort; **Freigabe widerrufen** sperrt ihn. Ein abgelaufener Link muss durch einen neuen ersetzt werden.

Kunden sehen Retourennummer und aktuellen Bearbeitungsstatus. Produkt, Aktualisierungszeit, öffentlicher Hinweis und ausgewählte Kommentare sind je Freigabe steuerbar. Der Status folgt der normalen Bearbeitung im Retourenboard; die Kundenansicht prüft ihn bei sichtbarer Seite alle 60 Sekunden und über **Aktualisieren**. Sie benötigt kein Konto und funktioniert auch nach vollständiger Abmeldung. Frei bearbeitbare Produkt-/Statusnamen und öffentliche Hinweise werden wie andere gespeicherte Inhalte nicht automatisch übersetzt; Bedienelemente sind DE/EN.

## Berechtigungen und Erreichbarkeit

Die neue Berechtigung **Kundenstatus teilen** (`returnsShare`) ist standardmäßig nur für Administratoren aktiv. Administratoren können sie gezielt Mitgliedskonten erteilen. Lesekonten bleiben lesend. Entzug der Berechtigung bzw. Deaktivierung des erstellenden Kontos blockiert dessen öffentlichen Link; berechtigte Personen können eine neue Freigabe erstellen.

Der Link gehört zur eigenen Installation, z. B. `https://deine-domain.example/s/<Zufallscode>`. Es gibt keinen externen Linkverkürzer. Ist eine öffentliche Adresse konfiguriert, wird sie für den Link verwendet; andernfalls die im Browser verwendete Adresse. Ein localhost- oder interner Netzlink ist entsprechend nur dort erreichbar. Diese Änderung richtet keinen Internetzugang, Reverse Proxy, Portweiterleitung oder externen Dienst ein.

Jeder, der den Link besitzt, kann die freigegebenen Angaben lesen. Er enthält einen zufälligen Code mit 128 Bit; weder Retourennummer noch fortlaufende ID bilden den Zugangscode. Seriennummern, Austauschseriennummern, Kundenreferenzen, Bestell-/Sendungsnummern, Preise, Mitarbeiterangaben, interne Notizen, nächste Arbeitsschritte, nicht freigegebene Kommentare und Anhänge bleiben außerhalb der öffentlichen API.

## Speicherung und Schutz

- Additive PostgreSQL-Migration **6** ergänzt ausschließlich die Tabelle `return_shares`; bestehende Retourenfelder und Arbeitsabläufe bleiben unverändert.
- Öffentlicher Lookup über SHA-256-Hash. Der Code wird zum späteren Kopieren mit einem eigenen AES-GCM-Schlüssel (`DATA_DIR/secrets/customer-share.key`) verschlüsselt gespeichert. Schlüssel und Codes erscheinen nicht im Änderungsverlauf; Freigabeaktionen werden ohne Zugangscode protokolliert.
- Ablauf, Widerruf, Erneuerung, Kontostatus und Berechtigung werden serverseitig geprüft. Separate Freigaberevisionen verhindern das Überschreiben paralleler Änderungen. Schreibzugriffe bleiben hinter Anmeldung, CSRF und frischer Berechtigungsprüfung der bestehenden Mutationssperre.
- Öffentliche Route nur lesend, feste Feldliste, begrenztes IP-Rate-Limit (60 Aufrufe/Minute, maximal 10.000 kurzlebige Buckets), `no-store`, `no-referrer`, `noindex`, bestehende CSP und Frame-Sperre. Die Kundenansicht verwendet keine Analyse- oder Marketingdienste, setzt keine Cookies und speichert ihre Darstellungswahl nicht dauerhaft.
- Linkpfade werden in den Anwendungslogs zusätzlich ausgeblendet. Ein vorgeschalteter Proxy verwaltet seine eigenen Zugriffslogs; die Anwendung ändert dessen Konfiguration nicht.
- Freigaben sind bewusster Zugangsstatus und **nicht Bestandteil portabler Vollsicherungen, CSV- oder Bestandsdateien**. Nach einer portablen Wiederherstellung müssen sie einschließlich öffentlicher Hinweise neu erstellt werden. So kann eine alte Sicherung widerrufene Links nicht wieder aktivieren. Normale Serverneustarts behalten Freigaben bei. Der bestehende portable Datenvertrag 4 bleibt unverändert; alte Sicherungen bleiben lesbar.

## Prüfung am 28.10.2026

Mit Node.js **24.22.1** und vorhandenen Abhängigkeiten:

- `npm run build`: erfolgreich, einschließlich TypeScript und Website.
- `npm test`: **1.399 Tests, 1.396 bestanden, 3 übersprungen, 0 Fehler**, 162,53 Sekunden. Abschließender Log: `.qa/customer-status-2026-10-28/full-tests-verified.log`.
- Gezielte API-, Auth-Lade- und Migrationsprüfung: **18/18 bestanden**. Zusätzlich sechs neue UI-Fälle und bestehende Formular-/Kopierprüfungen im vollständigen Lauf.
- CSS-Parser: **20 Dateien, 0 Warnungen**.
- Neue Fälle decken anonyme Feldliste, private API-/Asset-Sperre, Rechtevergabe/-entzug, CSRF, aktuellen Status, Ablauf, Erneuerung, Widerruf, Löschen, konkurrierende Revisionen, explizite Hinweise, Größenbegrenzung, XSS-Textdarstellung, Rate-Limit und portable Wiederherstellung ab.
- Unabhängiges statisches Review: zwei konkrete Befunde behoben und mit zuvor fehlgeschlagenen Tests abgesichert: Kommentardrafts beim Öffnen schützen; abgelaufene URL nicht per Speichern reaktivieren. Zusätzlich HTTP-Kopierfallback innerhalb des aktiven Modals abgesichert.
- Browser mit ausschließlich synthetischen Demodaten: Erstellen, Kopieren, Schließen/Wiederöffnen (gleicher Link), Statusänderung und Kundenaktualisierung, Erneuern (alter Link gesperrt), Widerruf (Details entfernt), Öffnen/Aktualisieren nach vollständiger Abmeldung.
- Kundenansicht auf Desktop und 320/440 px, Hell/Dunkel und DE/EN; Freigabedialog unter 320 px auf englischer Oberfläche inklusive Auswahlmenü. Kein horizontaler Überlauf, mobile Footeraktionen je 44 px hoch und einzeilig. Ein gefundener Dark-Mode-Hintergrundfehler wurde auf den gemeinsamen `--page`-Token korrigiert.
- Kein JavaScript-/CSP-Fehler im abschließenden Browserlog. Temporäre Viewportgrößen aufgehoben; Demokonto wieder angemeldet, Anwendung auf Dunkel/Deutsch zurückgestellt. Screenshots und Quelldiffs liegen im lokalen QA-Verzeichnis.

## Grenzen

Keine produktive Installation oder extern erreichbare Kundenfreigabe erstellt. Die Beispielseite in der lokalen Vorschau verwendet ausschließlich Demodaten. System-Teilen hängt vom Browser/Betriebssystem ab; die native Übergabe an externe Apps wurde nicht ausgeführt. Ein physisches iPhone/Safari wurde nicht getestet. Keine neue Abhängigkeit, Versionsanhebung, Veröffentlichung, Releasepakete oder Cloud-Sicherung.

## Geänderte Programm- und Testdateien

- `backend/src/server/app.js`
- `backend/src/server/customer-status-routes.ts`
- `backend/src/server/customer-status.ts`
- `backend/src/server/database/customer-status-schema.ts`
- `backend/src/server/database/migrations.ts`
- `backend/src/server/secrets.ts`
- `backend/src/server/server-log.ts`
- `backend/src/shared/permissions.ts`
- `deploy/compiled-runtime-files.txt`
- `deploy/runtime-files.txt`
- `frontend/assets/admin.html`
- `frontend/assets/customer-status.css`
- `frontend/assets/customer-status.html`
- `frontend/assets/index.html`
- `frontend/src/customer-status-public.ts`
- `frontend/src/customer-status.ts`
- `frontend/src/forms.ts`
- `frontend/src/i18n-catalog.js`
- `frontend/src/quick-actions.ts`
- `scripts/build-frontend.mjs`
- `tests/auth-loading.test.js`
- `tests/customer-status-api.test.js`
- `tests/customer-status-ui.test.js`
- `tests/disposal-schema.test.js`
- `tests/postgres-schema.test.js`
- `tests/quality-forms.test.js`
- `tests/return-search-stability.test.js`

Spezifikation und Umsetzungsplan: `docs/superpowers/specs/2026-10-28-customer-status-design.md`, `docs/superpowers/plans/2026-10-28-customer-status.md`.

## Ergänzung: Animationen der Kundenstatusseite (28.10.2026)

Die öffentliche Kundenansicht erhält kurze, zurückhaltende Bewegungen im bestehenden Glass-Stil:

- Kopfzeile, Einführung, Statuskarte und Datenschutzhinweis blenden beim Seitenaufruf leicht versetzt ein (maximal 560 ms, 6 px Bewegung).
- Der erste Datenstand blendet ein. Eine echte Statusänderung hebt nur das Statusabzeichen hervor; ein geänderter öffentlicher Hinweis blendet sanft ein. Identische automatische Abfragen animieren nicht erneut und ersetzen unveränderte Texte nicht.
- Manuelles Aktualisieren dreht das vorhandene SVG einmal in 620 ms. Schnelle Folgeaufrufe starten eine laufende Animation nicht neu. Automatische Abfragen bleiben ohne dauernden Ladeeffekt.
- Darstellungsschalter und Aktualisieren erhalten passende Hover-/Druckrückmeldungen; die Klickflächen bewegen sich nicht. Der anfängliche Ladering endet mit der Antwort bzw. dem bestehenden Anfrage-Timeout.
- `prefers-reduced-motion: reduce` unterdrückt Bewegungen. Ohne Web Animations API bleiben Daten und Bedienung verfügbar. Es gibt keine neue Abhängigkeit oder dauerhafte Darstellungseinstellung.

Geändert: `frontend/src/customer-status-public.ts`, `frontend/assets/customer-status.css`, `frontend/assets/customer-status.html`, `tests/customer-status-ui.test.js` sowie diese Dokumentation. API-Feldliste, Freigaberechte, Token-/Ablaufprüfung und Datenbank wurden in dieser Ergänzung nicht geändert.

Abschlussprüfung dieser Ergänzung mit Node.js 24.22.1:

- `npm run build`: erfolgreich. Der vorhandene Hinweis zu den Betreiber-/Hostingangaben der Werbeseite bleibt bestehen und betrifft diese Änderung nicht.
- Gezielter Lauf `node scripts/test-postgres.mjs tests/customer-status-api.test.js tests/customer-status-ui.test.js tests/auth-loading.test.js`: **25/25 bestanden, 0 Fehler, 0 übersprungen**. Darin elf UI-Fälle einschließlich Einblendung, echter Statusänderung, ruhiger automatischer Abfrage, reduzierter Bewegung, fehlender Animations-API und rascher Folgeaufrufe. Neue Regressionstests schlugen vor der jeweiligen Implementierung erwartungsgemäß fehl.
- CSS-Parser für die bearbeitete Datei: **0 Warnungen**. Build-/Testlogs unter `.qa/customer-status-motion-2026-10-28/`. Der oben dokumentierte vollständige Testlauf gehört zur vorangegangenen Funktionserweiterung; für diese Animationsergänzung wurde der gezielte Lauf ausgeführt.
- Lokale Browserprüfung mit synthetischen Demodaten: tatsächliche Einblendung und SVG-Drehung beobachtet, nach Abschluss volle Deckkraft bzw. keine verbleibende Transformation. Desktop 1280 px und schmale Ansicht 320 px, Hell/Dunkel, DE/EN ohne horizontalen Überlauf; abschließendes Warnungs-/Fehlerlog leer. Temporäre Viewportvorgabe aufgehoben und Kundenansicht auf Dunkel/Deutsch zurückgestellt. Physisches iPhone/Safari weiterhin nicht geprüft.

## Erweiterung: Sichtbare Inhalte und ausgewählte Kommentare (28.10.2026)

Unter **Kundenstatus teilen → Sichtbare Inhalte** lassen sich Produkt, letzte Aktualisierung und öffentlicher Hinweis einzeln ein-/ausschalten. Status und Retourennummer bleiben sichtbar. Ausgeschaltete Angaben fehlen bereits in der öffentlichen API und werden nicht nur optisch versteckt. Bestehende Freigaben behalten ihre bisherige Sichtbarkeit; neue Kommentare werden niemals automatisch ausgewählt.

Unter **Kommentare freigeben** bis zu 20 Kommentare markieren und die Vorschau prüfen. Kunden können sie ausschließlich lesen. Weitere vorhandene Kommentare lassen sich seitenweise (50 Einträge) laden. Ausgegeben werden nur freigegebener Text und Kommentarzeitpunkt, keine Autorenprofile, Nutzerkennungen, Erwähnungsmetadaten oder Dateien. @Erwähnungen werden in Auswahl und veröffentlichter Kopie durch @Team ersetzt. Frei verfasste Namen, Kontaktdaten oder sonstige sensible Informationen innerhalb des Textes muss die teilende Person anhand der Vorschau prüfen; dies ist keine automatische Anonymisierung sämtlicher Freitexte.

Freigegebene Kommentare bleiben als Momentaufnahme erhalten. Spätere interne Textänderungen werden auch beim Speichern anderer Freigabeoptionen nicht versehentlich übernommen. Vor der ersten Veröffentlichung prüft der Server den beim Laden erhaltenen Versionshash; wurde der Kommentar inzwischen verändert, ist Neuladen und erneutes Prüfen erforderlich. Löschen eines Quellkommentars entfernt seine Kopie aus der Kundenansicht. Zum bewussten Neuveröffentlichen eines überarbeiteten Textes den bisherigen Kommentar abwählen, speichern, den Dialog neu öffnen und erneut auswählen. Ursprünglicher Kommentartext bleibt auf 4.000 Zeichen begrenzt; Ersatz von Erwähnungen darf die öffentliche Kopie bis höchstens 5.000 Zeichen erweitern.

Additive PostgreSQL-Migration **7** ergänzt nur die Freigabetabelle um Optionen und veröffentlichte Kommentar-Momentaufnahmen. Die Prüfsumme und Anweisungen der bestehenden Migration 6 bleiben unverändert. Bestehende Kundenlinks, Rollen und Berechtigungen bleiben erhalten. Ablauf, Erneuern, Widerruf, CSRF, Konflikterkennung und anonyme Feldbegrenzung gelten weiterhin. Freigaben einschließlich veröffentlichter Kopien bleiben außerhalb portabler Sicherungen. Die normale Sicherung interner Quellkommentare als Geschäftsdaten bleibt bestehen.

Geänderte Dateien dieser Erweiterung:

- Backend: `backend/src/server/customer-status.ts`, `customer-status-routes.ts`, `app.js` sowie `database/customer-status-schema.ts` und `database/migrations.ts`.
- Oberfläche: `frontend/src/customer-status.ts`, `customer-status-public.ts`, `frontend/assets/customer-status.html` und `customer-status.css`.
- Tests: `tests/customer-status-api.test.js`, `customer-status-ui.test.js`, `postgres-schema.test.js`, `disposal-schema.test.js`.
- Dokumentation: diese Datei, `docs/superpowers/specs/2026-10-28-customer-share-options-design.md` und `docs/superpowers/plans/2026-10-28-customer-share-options.md`.

Abschlussprüfung mit Node.js **24.22.1**:

- `npm run build`: erfolgreich; TypeScript, Server und Website gebaut. CSS-Parser der bearbeiteten Datei: **0 Warnungen**.
- Gezielte API-/UI-/Migrationsfälle nach den Reviewkorrekturen: **34/34 bestanden**, keine Fehler oder übersprungenen Fälle.
- Abschließendes `npm test`: **1.414 Tests, 1.411 bestanden, 3 übersprungen, 0 Fehler**, 180,62 Sekunden. Übersprungen wurden zwei Linux-Installer-Dateisymlinkfälle und ein Dateianhang-Dateisymlinkfall wegen fehlender Windows-Symlinkrechte; bestehende Verzeichnis-Junction-Fälle liefen weiter.
- Unabhängiges Review: drei reproduzierte Befunde behoben, jeweils mit zuvor fehlgeschlagenen Regressionstests: geänderter Text zwischen Vorschau und erster Freigabe, Textlänge nach Erwähnungsersatz, überholte Paginierungsantwort während Neuladen. Ein neuer Ladezyklus verwirft nun alte Antworten einschließlich ihrer Abschlussrückmeldungen.
- Browser mit synthetischen Demodaten: Auswahl einzelner Kommentare, ausdrücklich nicht ausgewählter interner Kommentar, deaktivierte öffentliche Felder, Speichern und Wiederöffnen mit identischer Auswahl. Öffentliche Seite ohne Eingabe-/Antwortfeld und ohne internen Kommentar. Öffentliches Fehler-/Warnungslog beim Abschluss leer.
- Dialog und Kundenansicht auf Desktop sowie bei 320 px, Hell/Dunkel und DE/EN geprüft. Kein horizontaler Überlauf im schmalen Dialog und auf der Kundenansicht. Gespeicherte Schalter und Kommentarwahl blieben beim Sprachwechsel erhalten. Öffentliche Freitexte/Produkt-/Statusnamen bleiben gemäß vorhandener Funktion in ihrer ursprünglichen Sprache.
- Keine Prüfung auf physischem iPhone/Safari und keine produktive oder extern erreichbare Freigabe. Vorhandener Vorschauhinweis von pg 8 zur parallelen `client.query`-Nutzung sowie der Website-Buildhinweis zu Betreiber-/Hostingangaben bleiben außerhalb dieser Änderung. Keine neue Abhängigkeit, Versionsanhebung, Veröffentlichung oder Cloud-Sicherung.

Logs und Quelldiff: `.qa/customer-share-options-2026-10-28/`. Screenshots sind als lokale QA-Artefakte im Visualisierungsordner `customer-share-options-1028` hinterlegt.

## Korrektur: Aktualisieren ohne Positionssprung (28.10.2026)

Ursache: Der sichtbare Wechsel von „Aktualisieren“ zu „Wird aktualisiert …“ verbreiterte den rechts ausgerichteten Button im Desktoptest von 141,33 auf 176,44 px und verschob seine linke Kante um 35,11 px. Der sichtbare Buttontext bleibt jetzt während der Anfrage gleich. `aria-busy`, vorübergehende Deaktivierung, drehendes SVG und ein vorübergehender zugänglicher Name („Wird aktualisiert …“ / „Refreshing …“) erhalten die Laderückmeldung. Nach Abschluss wird der zugängliche Name zurückgesetzt. Keine zusätzlichen CSS-Überlagerungen oder festen Buttonbreiten erforderlich.

Geändert: `frontend/src/customer-status-public.ts`, `tests/customer-status-ui.test.js` und diese Dokumentation. Ein neuer Regressionstest verwendet den tatsächlichen Seitenstart mit gezielt ausstehender Anfrage und prüft DE/EN, stabile sichtbare Beschriftung und die Rückkehr aus dem Ladezustand. Er schlug vor der Korrektur erwartungsgemäß fehl.

Prüfung: `npm run build` erfolgreich; **16/16 UI-Tests bestanden**. Abschließendes `npm test`: **1.415 Tests, 1.412 bestanden, 3 wegen Windows-Dateisymlinkrechten übersprungen, 0 Fehler**, 159,56 Sekunden. Browser: Position/Breite nach dem Klick unverändert, Desktop Deutsch/Dunkel und 320 px Englisch/Hell; horizontaler Versatz jeweils **0 px**, auf Mobilgeräten kein Überlauf. Die ausstehende Anfrage wird zusätzlich durch den Regressionstest abgesichert. Abschließendes Browserfehlerlog leer; Deutsch/Dunkel und reguläre Viewportgröße wiederhergestellt. Physisches iPhone/Safari nicht getestet. Keine Backend-, Datenbank-, Berechtigungs- oder Versionsänderung. QA-Protokoll und Quelldiff: `.qa/customer-refresh-stability-2026-10-28/`.

## Erweiterung: Retourenfortschritt als Phasenleiste (28.10.2026)

Die Kundenstatusseite zeigt unter dem konkreten Status eine verbundene Leiste mit **Eingegangen → In Bearbeitung → Abgeschlossen**. Vergangene Phasen erhalten grüne Häkchen, der aktuelle offene Schritt eine blaue Uhr und spätere Phasen zurückhaltende Symbole. Der Statuskopf ist kompakter angeordnet. Verbindungen und Marker wechseln ihre Darstellung mit kurzen Übergängen; reduzierte Bewegung deaktiviert diese Übergänge.

Die Leiste ist eine Übersicht des aktuellen Prozessstandes, kein datierter Änderungsverlauf. Es werden keine angeblichen Zeitpunkte oder einzelnen Prüfschritte erfunden. Vorhandene öffentliche Angaben reichen aus: `received` entspricht Eingang, `checking` und `working` der Bearbeitungsphase. Erst `isClosed=true` schließt die letzte Phase ab. Bei anderen offenen benutzerdefinierten Statuswerten wird keine Phase geraten; dann bleibt der konkrete Status ohne Phasenleiste sichtbar. Auch ein grüner `done`-Farbton allein behauptet keinen tatsächlichen Abschluss. Nach Wiederöffnung oder ungültigem Link werden vorherige Abschlussmarkierungen zurückgesetzt.

Die drei Elemente sind als beschriftete Liste angelegt; der aktuelle Eintrag trägt `aria-current="step"`. Zusätzliche zugängliche Texte benennen „Erledigt“, „Aktueller Schritt“ und „Noch offen“. Icons sind dekorative lokale SVGs. Die Daten-/Kommentarfreigabeoptionen und der gegen Positionssprünge korrigierte Aktualisieren-Button bleiben erhalten. Keine Änderung an öffentlicher Feldliste, Datenbank, Berechtigungen, Version oder Abhängigkeiten.

Geändert: `frontend/src/customer-status-public.ts`, `frontend/assets/customer-status.html`, `frontend/assets/customer-status.css`, `tests/customer-status-ui.test.js` und diese Dokumentation. Neue CSS-Regeln sind auf die Fortschrittskomponente begrenzt und nutzen vorhandene Akzent-, Informations-, Rahmen- und Oberflächentokens. Vorhandene Regeln des Statuskopfs wurden direkt angepasst, statt mehrere widersprechende Varianten anzuhängen.

Abschlussprüfung mit Node.js 24.22.1:

- `npm run build`: erfolgreich. Abschließende UI-Prüfung **18/18 bestanden**, CSS-Parser **0 Warnungen**.
- `npm test`: **1.417 Tests, 1.414 bestanden, 3 wegen fehlender Windows-Dateisymlinkrechte übersprungen, 0 Fehler**, 171,30 Sekunden. Die abschließende kleine Anpassung des Beschriftungsumbruchs bei 320 px und expliziter Listensemantik wurde danach zusätzlich gebaut, mit den 18 UI-Fällen und im Browser geprüft.
- Neue Tests schlugen vor der Implementierung fehl und decken semantische Phasenzuordnung, freie Statusnamen, unklare offene Statuswerte, tatsächlichen Abschluss, zugänglichen aktuellen Schritt, Wiederöffnung und ungültige Links ab. Bestehende Tests zu Animationen, ruhigen Abfragen, optionalen Angaben, öffentlichen Kommentaren und stabiler Buttonbeschriftung bestehen weiter.
- Browserprüfung mit synthetischen Demodaten: Eingang, laufende Prüfung (erste Phase erledigt, mittlere aktiv), abgeschlossener Vorgang (drei Häkchen, letzter Schritt aktuell). Zusätzliche lokale Demolinks dienten ausschließlich der Sichtprüfung; die ursprünglich geöffnete Retoure wurde nicht bearbeitet.
- Desktop 1280 px und Mobilansicht 320 px, Hell/Dunkel und DE/EN: kein horizontaler Überlauf. Die mittlere deutsche Beschriftung bricht auf sehr schmalen Ansichten gezielt in zwei Zeilen um. Bestehende Freitexte und Statusnamen werden weiterhin nicht automatisch übersetzt.
- Physisches iPhone/Safari und eine vollständige Prüfung mit Screenreader wurden nicht ausgeführt. Keine produktiven Daten oder externen Freigaben verwendet.

Quelldiff und Logs: `.qa/customer-progress-2026-10-28/`. Lokale Screenshots: Visualisierungsordner `customer-progress-1028` mit Eingang, Bearbeitung, Abschluss und schmaler heller/dunkler Ansicht.


## Gemeinsame Kommunikation in Retouren und Geräteaufträgen (28.10.2026)

In den Retourendetails und Entsorgungsdetails gibt es jetzt denselben Bereich **Kommentare & Kundenstatus**. Der bisherige separate Freigabedialog und seine zweite Kommentarliste entfallen. Jeder Kommentar hat für berechtigte Personen direkt im Verlauf einen Schalter **Für Kunden sichtbar** mit einer Vorschau des tatsächlich veröffentlichten Textes. Neue Kommentare bleiben intern. Auswahl und Optionen werden erst mit **Kundenlink erstellen** beziehungsweise **Freigabe speichern** angewendet. Entwürfe im separaten Kommentarfeld bleiben beim Speichern der Freigabe erhalten.

Kundenlink, Kopieren/Teilen/Öffnen, öffentlicher Hinweis, sichtbare Produkt-/Aktualisierungsangaben, Laufzeit, Erneuern und Widerruf befinden sich in derselben Detailansicht. Die bisherige Begrenzung auf 20 freigegebene Kommentare, Autoren-Ausblendung, Erwähnungsersatz und geprüfte Momentaufnahmen gelten für beide Vorgangsarten. Auch beim Ab- und erneuten Anwählen eines bereits veröffentlichten Kommentars bleibt die gespeicherte Kundenkopie maßgeblich. Eine spätere interne Bearbeitung wird nicht automatisch veröffentlicht. Eine vollständig entfernte und gespeicherte Freigabe des einzelnen Kommentars kann anschließend anhand einer neuen Vorschau wieder ausgewählt werden.

### Entsorgungsaufträge

- Interne Kommentare: `GET/POST /api/disposals/:id/comments`, `PUT/DELETE /api/disposals/:id/comments/:commentId`; mit vorhandener Paginierung, Bearbeitung eigener Kommentare, Moderation und weicher Löschung.
- Freigabe: `GET/POST/PUT/DELETE /api/disposals/:id/customer-status`, geprüfte Kommentarmetadaten unter `/comments` mit Paginierung oder bis zu 50 ausdrücklich angeforderten IDs.
- Öffentliche Kurzlinks: `/d/:token`, Daten unter `/api/public/disposal-status/:token`. Retouren verwenden unverändert `/s/:token` und ihre bisherigen Endpunkte.
- Öffentliche feste Felder: Vorgangsart, Auftragsnummer, Statusschlüssel, Statusbezeichnung, semantische Farbe und Abschlusskennzeichnung. Produktname, Aktualisierungsdatum, öffentlicher Hinweis und ausgewählte Kommentartexte sind optional. Seriennummer, interne Notizen, Standort, Referenzen, Verfahrens-/Nachweisdaten, Bearbeitende und Anhänge werden nicht ausgegeben.
- Phasenleiste: **Vorgemerkt → Freigegeben → Durchgeführt**. Stornierte Aufträge zeigen ihren konkreten Status ohne irreführend abgeschlossenen Fortschritt.
- Neue Rechte: `disposalsCommentsCreate` (Mitglied/Administrator standardmäßig), `disposalsCommentsModerate` und `disposalsShare` (standardmäßig nur Administrator). Ohne `disposalsRead` sind auch die übrigen Geräteauftragsrechte unwirksam. Lesende Konten erhalten keinen Schreibzugriff.
- Erwähnungen benachrichtigen berechtigte Lesende mit einem festen Hinweis und einem internen Auftragslink. Nachrichtentext wird nicht in die Benachrichtigung kopiert; bei Verlust der Leserechte wird der Hinweis entfernt. Keine zusätzliche E-Mail-Versendung.

Kommentaränderungen verändern weder Nachweisrevision noch dokumentierte Freigabe-/Durchführungsereignisse. Interne Kommentare stehen unabhängig vom Nachweisverlauf zur Verfügung.

### Speicherung und Schutz

Die additive PostgreSQL-Migration **8** legt `disposal_comments` und `disposal_shares` an. Die Migrationen 1–7 und ihre Prüfsummen bleiben unverändert. Der portable Sicherungsstand **5** enthält interne Gerätekommentare; die Feldliste für frühere Sicherungen wurde als `SCHEMA4_TABLE_CONTRACTS` eingefroren. Sicherungsstände 1–4 bleiben einlesbar. Öffentliche Freigaben beider Vorgangsarten bleiben außerhalb portabler Sicherungen und werden beim Restore nicht wieder aktiviert.

Entsorgungslinks nutzen dieselben zeitlich begrenzten, widerrufbaren und versionsgeprüften Freigaben wie Retouren, jedoch mit getrennten Tabellen, Pfaden und Verschlüsselungskontexten. Es bleiben separate Teilerechte, aktuelle Rechteprüfung, CSRF-/Origin-Schutz, begrenzte anonyme Abfragen, feste öffentliche Felder, No-Store-/No-Referrer-/Noindex-Header und ausgeblendete Tokens in Protokollen wirksam.

### Oberfläche und Abschlussprüfung

Die gemeinsame Komponente verwendet bestehende Oberflächen-, Rahmen-, Akzent-, Text- und Statustokens. Keine neue Designpalette oder Frontend-Abhängigkeit. Veraltete CSS-Regeln für den separaten Freigabedialog, die doppelte Auswahl und deren Vorschau wurden entfernt. Die kräftige Darstellung eigener Chatnachrichten ist jetzt auf Chatnachrichten begrenzt, damit Kommentare und Kundenvorschauen auf ruhigen Flächen lesbar bleiben. Lange Auftragsaktionen brechen auf kleinen Geräten um; unter 380 px stehen die unteren Auftragsaktionen untereinander. Bestätigungsdialoge schützen neue Kommentar-/Freigabeentwürfe beim Wechsel zu einer Auftragsaktion. Fokus auf Kommentaraktionen bleibt auch bei geänderten Hintergrundabfragen erhalten.

Prüfung mit Node.js **24.22.1**:

- `npm run build` erfolgreich. Der bereits vorhandene Website-Hinweis zu unvollständigen Betreiber-/Hostingangaben bleibt außerhalb dieser Änderung.
- Vollständiges `npm test`: **1.430 Tests, 1.427 bestanden, 3 übersprungen, 0 Fehler**, 170,35 Sekunden. Die drei übersprungenen Fälle benötigen auf Windows Dateisymlinkrechte.
- Nach letzten Darstellungs- und Textkorrekturen: erneuter vollständiger Build und **113/113 gezielte Oberflächen-/Dialogtests bestanden**.
- Neue API-Tests decken getrennte Rechte, eigene/fremde Kommentare, fremde IDs, konstante Nachweisrevisionen, öffentliche Feldbegrenzung, Freigabeversionen, interne spätere Änderungen, Löschung, Entzug von Rechten, Widerruf, Erneuern, Ablauf, Stornierung, Erwähnungen sowie Sicherung/Restore ab. Historische Testbestände wurden um die neue Tabelle beziehungsweise neue Schemastände ergänzt.
- Unabhängiges Review: fünf konkrete Befunde korrigiert und erneut geprüft (Entwurfsschutz, Vorschau beim erneuten Anwählen, Tastaturfokus bei Hintergrundänderungen, Erwähnungsbenachrichtigungen, englische Rechtebezeichnungen). Keine offenen konkreten Befunde im geprüften Änderungsumfang.
- Browserprüfung mit ausschließlich synthetischen lokalen Daten: Retouren und Entsorgung, Kommentar erstellen, intern belassen, einzeln freigeben, Link öffnen, erneut öffnen mit identischer Auswahl, fortbestehender ungesendeter Kommentar während Freigabespeicherung und Abbruch eines Aktionswechsels. Kundenansicht enthält nur den freigegebenen Kommentar und kein Eingabeformular.
- Desktop und 320 px, Hell/Dunkel, DE/EN: gemeinsame Komponenten und öffentliche Seiten geprüft. Nach Korrektur des langen Auftragsbuttons hat der mobile Dialog **269 px Inhaltsbreite und 269 px Scrollbreite**; keine horizontale Überlappung der Felder. Kundenansicht bei 320 px ebenfalls ohne horizontalen Überlauf.
- Kein physisches iPhone/Safari und keine produktive extern erreichbare Freigabe getestet. Direkte automatisierte DOM-Interaktion mit dem gesamten Inline-Binder bleibt eine Abdeckungslücke; Zustands-/API-/Dialogtests und Browserprüfung decken die zentralen Abläufe ab. Der vorhandene pg-8-Vorschauhinweis zur parallelen Abfrageausführung ist unverändert.

Alle bisherigen Retourenaktionen, Dateianhänge, Historie, Verknüpfungen, Etiketten und Nachweise bleiben erreichbar. Keine Versionsanhebung, Releasepakete, Veröffentlichung, Commits, Pushes oder Cloud-Sicherung für diesen Auftrag.

Geänderte Quellen und Nachweise: siehe `docs/record-communication-2026-10-28-files.md`; Testprotokolle und Vorherkopien unter `.qa/record-communication-2026-10-28/`. Screenshots im lokalen Visualisierungsordner `record-communication-1028`.
