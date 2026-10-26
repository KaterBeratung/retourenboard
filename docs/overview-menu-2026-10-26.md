# Menü „Übersicht anpassen“ – 26.10.2026

Stand: Retourenboard 4.0.70.

## Anpassung

Die vier Bereiche verwenden eine gemeinsame segmentierte Auswahl mit vorhandenen Symbolen. Karten stehen in klar getrennten Zeilen; die Verschiebepfeile sind als zusammengehörige Aktionsgruppe gestaltet. Ausgeblendete Karten erhalten eine zurückhaltende Beschriftung. Die Option für kompakte leere Karten und der Hinweis zur kontobezogenen Speicherung sind optisch gegliedert; Fertig verwendet das bestehende Bestätigungssymbol.

Die vorhandenen Oberflächen-, Rahmen-, Radius-, Akzent- und Bewegungsvariablen werden weiterverwendet. Es gibt keine neuen Design-Tokens und keine weiteren Frameworks. Die bestehenden Stilregeln in frontend/assets/workspace-personalization.css wurden überarbeitet statt ein weiteres Theme darüberzulegen.

Auf sehr schmalen Bildschirmen stehen die Verschiebeaktionen unter dem Kartennamen. Der Resetknopf zeigt dort „Zurücksetzen“, behält aber den zugänglichen Namen „Standard wiederherstellen“. Bei einer Fensterhöhe bis 720 px scrollt der gesamte Einstellungsinhalt, während der Dialogabschluss erreichbar bleibt. Dadurch wird die Kartenliste nicht auf eine unbrauchbar kleine Resthöhe zusammengedrückt.

## Dateien und Erhalt der Funktionen

- frontend/src/workspace-personalization.ts: vorhandene Gruppensymbole, visuelle Spaltenüberschriften, zugängliche Aktionsgruppen, Speicherungshinweis und responsive Resetbeschriftung.
- frontend/assets/workspace-personalization.css: gemeinsame Auswahlfläche, Zeilen, Schalterumgebung, Pfeilgruppe, Footer und schmale/kurze Ansichten.

Speicherschlüssel, Reihenfolge, Sichtbarkeit, Standardwerte, Kontoisolation und Eventbindungen bleiben erhalten. Schalterknoten werden bei Sichtbarkeitsänderungen weiterhin nicht ersetzt. Testweise geänderte Sichtbarkeit und Reihenfolge der lokalen Demovorschau wurden anschließend auf die zuvor sichtbaren Werte zurückgestellt; kein pauschales Zurücksetzen anderer Nutzerkonfigurationen.

## Abschlussprüfung

- Node.js 24.22.1: npm run build erfolgreich.
- npm test -- tests/workspace-personalization.test.js tests/workspace-interactions.test.js tests/appearance.test.js tests/workflow-dialogs.test.js: 20 erfolgreich, 0 Fehler, isolierte PostgreSQL-Testdatenbank.
- Nach der letzten schmalen Beschriftungskorrektur die fünf Personalisierungstests erneut erfolgreich. CSS mit esbuild ohne Parserwarnung geprüft.
- Lokale Chromium-Vorschau: dunkles deutsches Desktopmenü bei 1440×1000, dunkle deutsche und helle englische Mobilansicht bei 440×956 sowie schmale/kurze Ansicht bei 320×640.
- Verschieben von Offene Retouren nach unten und zurück: dieselbe Reihenfolge sofort im Editor und in den Dashboard-Karten. Ausblenden und Wiedereinblenden funktionieren unmittelbar.
- Bereichswechsel per Home/End geprüft. Im kurzen Fenster ist der untere Einstellungsinhalt per Tastatur erreichbar; der innere Scrollbereich bewegt sich bis zum Ende. Der Footer bleibt im Bildschirm.
- Bei 320 px kein horizontaler Überlauf des Dialogs oder der Kartenzeilen; lange deutsche/englische Bezeichnungen kontrolliert. Im schmalen Test gefundene einzelne Buchstabenumbrüche an Tabs und Resetknopf behoben.

Ein echtes iPhone/Safari und ein Deployment der öffentlichen Demo wurden nicht separat geprüft. Die Prüfung erfolgte lokal mit synthetischen Daten.
