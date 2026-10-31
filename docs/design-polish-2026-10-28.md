# Design-Feinschliff · 28.10.2026

## Ziel und Rahmen

Bestehenden, bereits freigegebenen Glasstil in Werbeseite und Anwendung verfeinern: neutralere Materialien, ruhigeres Punktmuster, besser lesbare Hierarchie, kompaktere und verlässlichere Anordnung. Bestehendes Branding, Funktionen, Berechtigungen, persönliche Ansichten, Daten und reduzierte Bewegung erhalten. Kein neuer Theme-Layer, keine Frameworks, erfundenen Funktionen oder Kennzahlen. Die 4K-Desktop- und vorhandenen mobilen Produktbilder der Website bleiben erhalten.

Die technische Ausführung bleibt in der vorhandenen CSS-/TypeScript-Struktur. Anstelle eines neuen Designs werden vorhandene Tokens und Komponentenregeln gezielt konsolidiert. Eine komplette Neugestaltung würde die bereits akzeptierte Richtung und bewährte Bedienung unnötig verändern. Dies ist die Fortführung des vom Nutzer beauftragten Stils; keine Veröffentlichung, Versionserhöhung, Releasepakete oder Backups.

## Befunde vor der Umsetzung

- Werbeseite: Navigation klein; starkes Punktmuster; nahezu quadratische Hero-Bildbühne und zusätzliche Fußzeile beanspruchen viel Höhe bis zur Produktvorschau.
- Anwendung: Übersichtskarten teilen schmale Karten nochmals in zwei Spalten. Die gemessenen Retourennummern benötigen 39 statt 19,5 px Zeilenhöhe bei nur 82–99 px Breite.
- Mehrere ältere responsive Regeln verkleinern Metatexte stark. Sie sollen zentral vereinheitlicht werden, statt neue Korrekturblöcke anzuhängen.

## Umsetzungsplan

1. **Gemeinsame Materialien der Anwendung:** Farb-/Flächen-Tokens neutralisieren, Dot-Kontrast reduzieren, Radien und Abstände kontrollieren. Semantische Statusfarben erhalten.
2. **Hierarchie und Übersicht:** KPI-Karten maßvoll verdichten, Metatexte lesbar halten; Aufgabenlisten abhängig von der tatsächlichen Kartenbreite in klare kompakte Zeilen umstellen. Inhalte und Ziele der Links bleiben unverändert.
3. **Gemeinsame Komponenten:** alte kleine Typografie in Überschriften, Formularhilfen, Tabellen-Metadaten und Footer bereinigen. Chat-Bubbles lesbarer, aber kompakt; Menüs, Dialoge und Mobile-Touchflächen erhalten.
4. **Werbeseite parallel:** vorhandene site.css-Regeln für Navigation, Hero-Rhythmus, Vorschau, Features, Workflow, Installation und Footer überarbeiten. Kein Wechsel von Links, Text-/i18n-Verträgen oder Privacy-Verhalten.
5. **Abschlussprüfung:** Build mit Node24, CSS-Parser, bestehende vollständige Testsuite; visuelle Stichproben in Dunkel/Deutsch und Hell/Englisch auf Desktop und 320/440 px. Anwendungsansichten Übersicht, Retouren, Produkte, Entsorgung, Scan, Chat und Admin sowie Dialoge/Menüs; Website inklusive Vorschaugeräte, FAQ, Cookie-Dialog und Installation. Screenshots und Messungen sichern.

## Prüfschwerpunkte

Keine horizontalen Seitenüberläufe, keine abgeschnittenen Status-/Retourennummern, keine überdeckten Menüaktionen, sichtbarer Tastaturfokus, kein erneutes Hover-Flackern. Alte Hover-Fixes beibehalten: Hintergrundbilder nicht per Hover-Kurzschreibweise entfernen, Klickflächen nicht verschieben. Aktive Dateneinstellungen nicht speichern; lokale Vorschau ausschließlich mit synthetischem Demokonto.

## Ausführung

Die vorhandene Arbeitskopie D:/retourenboard enthält den vom Nutzer gewünschten aktuellen Stand. Quelldatei-Snapshots liegen für diesen Auftrag unter .qa/design-polish-2026-10-28/before/. Keine Git-Metadaten oder fremden Änderungen zurücksetzen. Website-CSS wird getrennt bearbeitet; zentrale Builds und Browserprüfung liegen beim Hauptagenten.

## Fortschritt

- Bestandsaufnahme und gemessener Layoutfehler dokumentiert.


## Ergebnis und geänderte Quelldateien

| Datei | Änderung |
| --- | --- |
| `public/theme.css` | Zentrale Flächen, Licht-/Dunkelmaterialien, Punktmuster und Radien verfeinert. |
| `frontend/assets/design.css` | Alte Mikrotypografie in responsiven Überschriften, Metadaten, Tabellen und Footer bereinigt; KPI-/Leerzustandsabstände verdichtet. |
| `frontend/assets/workspace-refinements.css` | Gemeinsame Panelüberschrift auf 16 px abgestimmt. |
| `frontend/assets/workspace-insights.css` | Containerabhängige Aufgabenlisten: schmale Karten erhalten klare Zeilen statt nochmals geteilter Spalten. Fristen bleiben zugeordnet. |
| `frontend/assets/chat.css` | Bubbles mit weniger Innenabstand und 14 px Nachrichtentext; eigene Nachrichten behalten mobil ihre spiegelbildliche Rundung, Fokus verändert keine Ecken mehr. |
| `website/src/site.css` | Navigation, Hero-Bildbühne, Produktvorschau, Workflow, Features, Installation, FAQ, Footer und Privacy-Dialog über vorhandene Regeln abgestimmt. |
| `frontend/src/disposal-copy.ts` | Gemeinsame Kalenderdatumsanzeige für Entsorgung (DE/EN, ohne Zeitzonenverschiebung). |
| `frontend/src/disposals.ts` | Durchführungsdatum im Detaildialog lokalisiert. |
| `frontend/src/disposal-labels.ts` | Gleiche Datumsanzeige in Nachweis und Kurzkennzeichnung. |
| `tests/disposal-ui.test.js` | Vorhandenen Test für lokalisierte Nachweisdatumsanzeige erweitert. |

### Tokens und bereinigte Regeln

Keine zweite Theme-Schicht eingeführt. Die vorhandenen Variablen `--surface`, `--surface-subtle`, `--surface-raised`, `--surface-input`, `--surface-hover` sowie Blatt-/Feld-/Chrome-Gradienten und Hintergrund-Washes sind neutraler abgestimmt. Der helle Seitenhintergrund ist #f1f4f7; die dunkle Grundfläche #151b22. Das Punktraster ist zurückhaltender (13 % statt 22 % Farbmischung, Raster 24 statt 22 px). Panelradius 24 statt 28 px, Dialogradius 28 statt 32 px. Semantische Statusfarben und Branding bleiben erhalten.

Entfernt wurden alte responsive Sonderregeln, die Aktionsbuttons, Seitenbeschreibungen, Paneltexte, Tabellenmetadaten und Footer auf 7–11 px verkleinerten. Diese Bereiche erben nun die bereits vorhandenen gemeinsamen Größen. Mobile Website-Abstände und Typografie wurden in den vorhandenen Breakpoints zusammengeführt. Hover-/Fokus-Hintergründe verwenden weiterhin `background-color`, damit Glasgradienten beim Interagieren erhalten bleiben; keine neuen Hover-Transformationen an Karten oder Schaltflächen.

Die Queue-Korrektur wurde vor/nachher gemessen: Retourennummern in der schmalen dritten Dashboardkarte zuvor 39 px hoch bei 82–99 px Breite, danach 19,5 px hoch bei 238 px Breite. Die Nummern bleiben auch bei 320 px Seitenbreite einzeilig. Lange Inhalte bleiben über vorhandene Links/Tooltips erreichbar; keine Daten entfernt.

### Visuelle und funktionale Abschlussprüfung

- Lokale isolierte Demo-Vorschau über `npm run preview -- --port 3022`; Website über `npm run website:preview -- --port 3020`. Nur synthetische Demodaten verwendet.
- Desktop dunkel/DE: Übersicht, Retouren, Produkte, Entsorgung, Scan-Erfassung, Chat und Stammdaten geprüft; Screenshots angelegt.
- Mobil 440 px: Stammdaten und Retourenformular dunkel/DE; Retouren, Produkte, Entsorgung, Scan-Erfassung und Chat hell/EN. Kompaktes Auswahlmenü und zentrierter Entsorgungsdialog geprüft. Eingangsdatum 44 px hoch, kein Überstand gegenüber dem Elternfeld.
- Zusätzlich 320 px: Retourenliste und Übersicht dunkel/DE ohne horizontalen Seitenüberlauf. Die vorhandenen mobilen Datensatzkarten bleiben aktiv.
- Website: 320 px dunkel/DE und hell/EN, 440 px hell/EN, Desktop beide Farbschemata. Header bei 1.021 und 1.100 px geprüft, auch mit englischer Beschriftung; keine Überschneidungen oder seitlichen Seitenüberläufe festgestellt.
- Website-Produktvorschau Desktop/Mobil umgeschaltet, Retouren/Übersicht gewählt; vorhandene 3.840 × 2.160-Assets bleiben erhalten. Mobile Präsentationsbilder bleiben wie zuvor als 16:9-Kompositionen mit Telefonansicht eingebunden.
- Mobile Navigation, Workflow-/Feature-/Installationsanordnung, FAQ und Cookie-Dialog geprüft. Cookie-Dialog verdeckt den Bildschirm mit unscharfem Hintergrund und hat weiterhin kein X. Keine Consent-Logik geändert.
- Browserkonsole im Abschlussstand ohne erfasste Warnungen/Fehler. Sprach-/Farb-/Animationsauswahl nach Prüfung auf Dunkel/Deutsch und aktivierte Animationen zurückgestellt; temporäre Viewportgrößen aufgehoben.
- Unabhängiges statisches Review der sechs CSS-Dateien und der zusätzlichen Datumsänderung: keine konkreten Findings.

### Build und Tests

Node.js 24.22.1; vorhandene Abhängigkeiten genutzt, kein Neuinstallieren erforderlich.

- `npm run build`: erfolgreich, einschließlich TypeScript-Frontend und Website.
- CSS-Parserprüfung mit vorhandener esbuild-Version: 19 CSS-Dateien, 0 Warnungen.
- `npm test` nach dem finalen Code: 1.386 Tests, 1.383 bestanden, 3 übersprungen, 0 Fehler (167,99 s).
- Gezielte Entsorgungs-UI-Tests: 9/9 bestanden, zusätzlich unter `TZ=America/Los_Angeles` geprüft. Der bestehende Nachweistest wurde zuerst mit erwartetem Fehler gegen die rohe ISO-Ausgabe ausgeführt und nach der Korrektur erfolgreich wiederholt.
- Testlogs: `.qa/design-polish-2026-10-28/tests-final.log`; Quelldiffs, Snapshots und Screenshots ebenfalls unter diesem QA-Verzeichnis.

### Erhaltene Funktionen und Grenzen

Keine Datenbank-, API-, Berechtigungs- oder Workflowänderung. Formulare und Exporte speichern Datumswerte weiterhin im ursprünglichen Format; nur deren Anzeige wurde vereinheitlicht. Die geprüften Navigationen, Listenaktionen, Formulare, Menüs und Dialoge sind weiterhin erreichbar. Individuelle Tabellenansichten, Dashboardkonfigurationen, reduzierte Bewegung und die bereits behobenen Hover-/Dropdownprobleme wurden beibehalten.

Die Prüfung erfolgte in der lokalen Browser-Vorschau; kein physisches iPhone/Safari und kein produktiver Server wurden getestet. Sie ist eine breite visuelle Stichprobe, keine Zusage, dass jeder mögliche Datenbestand und jede Dialogkombination fehlerfrei ist. Der Website-Build meldet unverändert, dass Betreiber-/Hostingangaben in `website/legal.json` zu ergänzen sind. Keine Veröffentlichung, Versionserhöhung, Installationspakete oder automatische Cloud-Backups ausgeführt.
