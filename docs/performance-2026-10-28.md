# Performanceprüfung 4.0.72 – 28.10.2026

Die bestehende Oberfläche und die Schutzgrenzen bleiben erhalten. Drei gemessene Engpässe wurden lokal optimiert; keine neuen Abhängigkeiten, Datenbankstrukturen oder API-Verträge. GitHub wurde für diesen Auftrag nicht aktualisiert.

## Messung

Isolierte synthetische PostgreSQL-Laufzeit unter Node.js 24.22.1, identische Benchmarklast vorher/nachher. Übersetzungen und HTML-Erzeugung jeweils sieben Runden, angegeben ist der Median. Keine Aussage über die Geschwindigkeit jedes realen Arbeitsablaufs.

| Messlast | Vorher | Nachher |
| --- | ---: | ---: |
| 5.000 Übersetzungsaufrufe | 301,72 ms | 0,85 ms |
| HTML für 200 Tabellenzeilen | 180,53 ms | 2,59 ms |
| Übertragener Body von zwölf JS-/CSS-Dateien | 524.793 Bytes | 158.177 Bytes |
| Datenbankabfragen für 300 Nachrichten zum selben Ziel | 314 | 15 |
| Antwort dieser Nachrichtenabfrage, einzelne lokale Messung | 37,75 ms | 7,23 ms |

Die Text-/HTML-Prüfsummen bleiben identisch. Der dekomprimierte neue Assetinhalt hat 525.139 Bytes; die kleine Größenänderung stammt aus dem neuen Code. Der Transfer sinkt um rund 70 %. Die Zahl der Nachrichtenabfragen sinkt bei dieser Last um rund 95 %.

Gzip kostet beim ersten Zugriff CPU: Die erste lokale Runde mit zwölf Dateien benötigte 67,8 statt 27,3 ms. Warme Runden lagen bei 20,5/17,9 statt 20,8/14,4 ms. Der belegte Vorteil ist die geringere Datenmenge und weniger wiederholte Datei-/Komprimierungsarbeit; ein schnellerer erster Zugriff auf Loopback wird nicht behauptet. Reale Netze, Produktionslast und große Datenbestände sind separat zu messen.

## Änderungen

- `frontend/src/i18n.js`: abgeleiteter Rückwärtsindex statt wiederholter vollständiger Katalogsuche. Aliaspriorität und nachträglich ergänzte Übersetzungen bleiben erhalten; Nutzereingaben werden nicht gesammelt gecacht.
- `backend/src/server/static-assets.ts` (neu): asynchrones Gzip, gleichzeitige Ladevorgänge zusammengeführt, LRU-Dateicache mit maximal 16 MiB und 128 Einträgen. Dateimetadaten werden bei jedem Zugriff geprüft. Geänderte/gelöschte Dateien, Komprimierungsfehler und konkurrierende ältere Lesevorgänge werden behandelt.
- `backend/src/server/app.js`: statische Antworten verwenden den Helper, korrektes `Vary`, `Content-Encoding`, `Content-Length` und HEAD. Beide vorhandenen Sitzungsprüfungen sowie private/no-store bleiben bestehen. API-/CSRF-Antworten, Anhänge und Produktbilder werden nicht zusätzlich gecacht oder komprimiert.
- `backend/src/server/collaboration.ts`: gleiche Nachrichtenziele pro Aufruf einmal prüfen; ungültige Nachrichten gesammelt und nur für diesen Benutzer entfernen. Die nächste Anfrage prüft aktuelle Zugriffsrechte erneut.
- `scripts/design-preview.mjs`: eingesetztes Vorschau-HTML erhält passende Identitätskodierung und Antwortlänge, einschließlich HEAD. Der erste Gesamttest hatte den Konflikt mit der neuen Komprimierung sichtbar gemacht; anschließend behoben und erneut vollständig geprüft.
- `deploy/runtime-files.txt`, `deploy/compiled-runtime-files.txt`: neuer Laufzeithelper aufgenommen.
- `tests/translation-performance.test.js`, `tests/static-assets-performance.test.js`, `tests/notification-performance.test.js` (neu), `tests/design-preview.test.js`: Verhaltens-, Randfall-, Schutz- und Vorschauprüfungen.
- `package.json`, `package-lock.json`, beide Stamm-README-Dateien und beide README-Dateien unter `docs/readme/`: Version 4.0.72.
- Plan/Entscheidungen unter `docs/superpowers/specs/2026-10-28-performance-design.md` und `docs/superpowers/plans/2026-10-28-performance.md`; lokale Linuxpakete und Prüfsummen unter `releases/4.0.72/`, `releases/latest/` und `releases/release-manifest.json`.

## Prüfung

- Ausgangsregressionen gezielt beobachtet: Katalogvollsuche, wiederholte Zielprüfung, einzelne Löschabfragen, fehlendes Gzip. Auch legaler Whitespace in Accept-Encoding wurde zunächst reproduziert und korrigiert.
- 42 gezielte bestehende/neue Tests erfolgreich. Erweiterter Randfall-/Benchmarklauf: 15/15; abschließende Vorschau-/Assetprüfung: 11/11.
- `npm ci`: erfolgreich im bereinigten Paketquellstand; npm-Abhängigkeitsprüfung meldet null bekannte Schwachstellen. Dies ist kein neuer vollständiger Sicherheitsaudit.
- `npm run build`: erfolgreich, Version und Laufzeitlisten konsistent.
- `npm test` nach der Vorschaukorrektur: 1.475 Tests, 1.472 bestanden, null Fehler, drei übersprungen, 173,1 Sekunden. Die drei übersprungenen Fälle benötigen Windows-Dateisymlinkrechte beziehungsweise Linux; Verzeichnis-Junction-Prüfungen bleiben aktiv.
- Unabhängiges lesendes Schlussreview: keine konkreten wichtigen Blocker.
- Isolierte Vorschau 4.0.72: Anmeldung, Hauptansichten, Retourendialog, Deutsch/Englisch, Hell/Dunkel und 1440×900/320×852 geprüft. Keine neuen Browserfehler oder horizontalen Seitenüberläufe beobachtet. Sichtkontrollen und Screenshots unter dem lokalen Visualisierungsordner `performance-4.0.72`.
- `npm run package`: bereinigter Quellstand ohne SMTP-Testschlüssel. 1.405 Archivdateien mit Quell-/Buildvergleich kontrolliert, keine verbotenen Schlüssel-/Datenpfade; Lizenz enthalten. Alle vier lokalen Paketvarianten und Prüfsummen stimmen mit dem Manifest überein.
- Extrahiertes Paket ohne `node_modules`: Start, Version über `/api/session`, Anmeldung, private Assets, SQLite-Testmigration ohne Veränderung der Quelldaten, ID-Fortsetzung und Entsorgungsnachweis erfolgreich geprüft.
- Auftragsbezogene Whitespaceprüfung erfolgreich. Vorhandene nicht zu diesem Auftrag gehörende Änderungen bleiben erhalten.

## Grenzen und Betrieb

Der bereits laufende ältere Vorschauprozess auf Port 3022 wurde erhalten. Für die Backend-Optimierungen muss ein laufender Server mit 4.0.72 neu gestartet werden; die isolierte Prüfung erfolgte mit einem frischen 4.0.72-Prozess auf Port 3023. Dessen Testdaten werden danach entfernt.

Unverändert: Die synthetische Vorschau meldet beim parallelen Anlegen ihrer Beispieldaten eine DeprecationWarning für einen künftigen pg-9-Wechsel; derzeit ist pg 8.23.1 festgelegt und die Prüfungen sind erfolgreich. Der Website-Build weist auf fehlende Betreiber-/Hostingangaben in `website/legal.json` hin. Für diesen Performanceauftrag wurden weder Rechtsangaben ergänzt noch GitHub oder das Cloudbackup geändert.
