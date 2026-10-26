# Einheitliche Listenanordnung am 26.10.2026

Stand: Retourenboard 4.0.70.

## Gemeinsamer Aufbau

Retouren, Produkte und Geräteaufträge verwenden dieselbe record-workspace-Hülle: Überschrift und Import/Export/Anlegen, danach Tabellenansicht/Scannen/gespeicherte Ansichten soweit vorhanden, Statusfilter soweit vorhanden und anschließend die Liste mit Suche und Fachfiltern. Die Entsorgung behält ihren fachlichen Ablaufhinweis.

- Import und Export stehen als beschriftete Aktionen zusammen. CSV-Aktionen behalten ihre ausführlichen zugänglichen Namen und bestehenden Berechtigungsprüfungen.
- Überschrift und Aktionen stehen bei ausreichend Platz nebeneinander, sonst in klaren Zeilen untereinander. Die Anpassung richtet sich per Container Query nach der tatsächlichen Inhaltsbreite.
- Suchleiste und Filter erhalten gemeinsame Abstände, Feldhöhen und Radien. Desktopfilter haben 200 px Platz für ihre Beschriftung; bei kleiner Breite stehen sie unter der Suche und können lesbar umbrechen.
- Statusleisten verwenden dasselbe Raster, dieselben Zähler und dieselben Zustände. Die gemeinsame statusTabLayout-Funktion verteilt auch zusätzliche Statuswerte über vollständige Zeilen. Statische CSS-Klassen berücksichtigen die bestehende Richtlinie ohne Inline-Stile.
- Bei sehr schmaler Ansicht wird Scannen als Icon mit zugänglicher Beschriftung angezeigt. Mobile Hauptaktionen bleiben über die vorhandene Navigation erreichbar.

## Geänderte Dateien und Zusammenführung

- frontend/src/app.ts: gemeinsame Hülle für Produkte/Retouren, Export zu den Kopfaktionen, kurze sichtbare Import-/Exportbeschriftungen und bestehende Bedienungshooks.
- frontend/src/disposals.ts: gleiche Hülle und Reihenfolge, Scannen in die Werkzeugzeile, Statusleiste vor der Listenkarte.
- frontend/src/ui.ts: gemeinsame Berechnung der Statusaufteilung.
- frontend/assets/workspace-refinements.css: zentrale Listenregeln und responsive Varianten.
- frontend/assets/design.css: bisherige mehrfach verteilte Statusleistenregeln entfernt.
- frontend/assets/workflow.css: bisherige Werkzeugleisten-Anordnung entfernt.
- frontend/assets/disposals.css: eigene Kopf-, Werkzeug- und Statusleisten-Anordnung entfernt.
- tests/return-filter-counts.test.js: bestehende Zählerprüfung um die gemeinsame Renderabhängigkeit ergänzt; Erkennung des Statuscontainers erlaubt zusätzliche Layoutklassen.

Keine neuen Farb- oder Oberflächen-Tokens: vorhandene Kontrollhöhen, Abstände, Radien, Segmentfarben und Farbschemata werden weiterverwendet. Geschäftsabläufe und Datenbank wurden nicht verändert.

## Abschlussprüfung

- Node.js 24.22.1: npm run build erfolgreich.
- 57 ausgewählte Tests mit npm test und isolierter PostgreSQL-Datenbank erfolgreich, 0 Fehler: Retourenfilter/Zähler, Entsorgung einschließlich Berechtigungen und Revisionen, Tabellenpräferenzen, gespeicherte Ansichten, Menüs, Personalisierung und native Auswahlfelder.
- Alle vier betroffenen CSS-Dateien ohne esbuild-Parserwarnung. Die Statusklassen für 1–64 Auswahlmöglichkeiten geprüft: vollständige Zeilen und gültige Spaltenbelegung.
- Synthetische lokale Vorschau: Retouren, Produkte und Entsorgung am Desktop (1440 px), Retouren zusätzlich bei mittlerer Breite (960 px), alle drei mobil (440 px), Retouren zusätzlich bei 320 px. Dunkle deutsche und helle englische Ansichten visuell kontrolliert.
- Gemessene Listenhülle ohne horizontalen Überlauf: 1093 px Desktopbreite, 629 px mittlere Breite, 393 px mobile Breite sowie 273 px bei 320-px-Viewport; scrollWidth jeweils gleich der Breite.
- Retourengrund Defekt: 2 passende Datensätze und konsistente Statuszähler; Zurücksetzen stellt 10 Datensätze wieder her. Verschobener Export öffnet den bestehenden Dialog. Tabellen- und Ansichtsmenüs bleiben mobil innerhalb des Bildschirms (links 18 px, oben 84 px).

Die Prüfung erfolgte mit Chromium in der lokalen Vorschau. Ein echtes iPhone/Safari und die öffentliche Live-Demo wurden nicht separat nachgeprüft. Bestehende gespeicherte Einstellungen werden durch die Änderungen nicht umgeschrieben.
