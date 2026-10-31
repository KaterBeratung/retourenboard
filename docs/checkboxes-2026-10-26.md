# Einheitliche Checkboxen und mobile Retourenauswahl – 26.10.2026

## Umsetzung
- `public/styles.css`: zentrale abgerundete 20-px-Checkboxen für gewöhnliche native Eingaben. Eigene Häkchen-/Minusdarstellung für ausgewählt/teilweise ausgewählt, klare Hover-/Tastatur-/Disabledzustände. Native Semantik bleibt erhalten; bestehende Switches sind ausdrücklich ausgenommen. Für Windows-Kontrastmodi wird die native Darstellung verwendet.
- `frontend/assets/settings.css`: drei konkurrierende ältere Checkboxregeln entfernt bzw. auf Radiobuttons begrenzt, damit Dialoge dieselbe zentrale Gestaltung verwenden.
- `frontend/assets/workflow.css`: ruhigerer Auswahlhintergrund, einheitliche Auswahlleiste, 44-px-Touchflächen mobil und geordnete Kartenköpfe mit Retourennummer und Status neben der Checkbox. Mobil kurze Aktionsbeschriftungen; vollständige Namen bleiben für Screenreader erhalten.
- `frontend/src/app.ts`: Seitenauswahl auch oberhalb der mobilen Karten. Desktop- und Mobilsteuerung sind an dieselbe bestehende Auswahl gebunden.
- `frontend/src/workflow-actions.ts`: gemeinsame Synchronisation der nativen checked-/indeterminate-Eigenschaften für alle Seitenauswahlfelder. Vorhandene Auswahlgrenze, Berechtigungen, Statuswechsel und CSV-Ziele bleiben unverändert.
- `frontend/assets/design.css`: mobile Kartenraster mit schrumpfbaren Spalten. Ein gemessener Überstand bei 320 px durch fünf Schnellaktionen wurde behoben; dort bleiben alle Aktionen 44 × 44 px groß, mit angepassten Abständen und Umbruch als Rückfall für noch schmalere Flächen.
- `tests/page-selection.test.js`: drei neue Regressionstests für gemeinsame Leer-/Teil-/Vollauswahl, Seitenwechsel und unveränderte Auswahl auf anderen Seiten. Vor Implementierung fehlgeschlagen, danach bestanden.

## Prüfung
Node.js 24.22.1. `npm run build` erfolgreich. Gezielter Testlauf:

`npm test -- tests/page-selection.test.js tests/workflow-actions.test.js tests/workflow-dialogs.test.js tests/return-selection-escaping.test.js tests/app-language.test.js tests/appearance.test.js tests/chat-panels.test.js`

51 Tests bestanden, keine fehlgeschlagen. Geprüft werden u. a. Auswahlgrenzen, atomare Seitenauswahl, Aktionsberechtigungen, unveränderte/geschützte Beschriftungen, Übersetzungen und Dialogzustände.

Browserprüfung in der synthetischen lokalen Demo:
- Desktop 1440 × 1000: einzelne und ganze Seite auswählen; native Teil-Auswahl als Minus sichtbar.
- Mobil 440 × 956, Dunkel/DE: Einzel-/Seitenauswahl und Auswahl aufheben, geordnete Kartenköpfe und Auswahlleiste.
- 320 × 640, Dunkel/DE und Hell/EN: keine seitlichen Überstände der Auswahlleiste; nach Korrektur Kartencontainer clientWidth = scrollWidth = 271 px. Alle fünf geprüften Schnellaktionsbuttons weiterhin 44 × 44 px.
- Space-Taste auf dem mobilen Seitenauswahlfeld aktiviert beide Seitenauswahlzustände. Teil-Auswahl wird nativ als gemischter Wert an die Accessibility-Ansicht gemeldet.
- Dialog-Mitgliederauswahl: gleicher zentraler Checkboxstil und unveränderte Bedienung; kein Gruppenentwurf gespeichert.

## Grenzen
Viewportprüfung im Browser, kein physischer Safari-/iPhone-Test und kein vollständiger Test aller Berechtigungs-/Datenkombinationen. Keine geschäftlichen Retourendaten oder Statuswerte verändert, keine Exporte ausgelöst. Kein neues Framework, keine neue Version oder Veröffentlichung.