# Kompakte Nachrichten – 26.10.2026

## Umsetzung
- `frontend/assets/settings.css`: Kartenabstände und Radien zentral überarbeitet; doppelte spätere Inbox-Regeln entfernt. Titel und runder Lesestatus oben, Text darunter, Zeit und Aktionen gemeinsam in der unteren Zeile. Typische Desktopkarte jetzt 109 px hoch. Keine dicke grüne Seitenkante; ungelesene Nachrichten erhalten eine dezente gemeinsame Kontrollfläche und ein grünes Status-Badge.
- `frontend/src/notifications.ts`: vorhandene Aktionen in beschriftete Spans gefasst; explizite übersetzte ARIA-Namen und Tooltips ergänzt. Mobil erscheinen zwei Icon-Buttons mit 44 × 44 px Touchfläche. Ereignisbehandlung, Zieladressen, Lesestatus-APIs, Daten und Berechtigungen unverändert.
- Sehr schmale Fenster zeigen die beiden Abschlussbuttons untereinander, damit lange Beschriftungen keine hohen schmalen Kapseln bilden. Die Nachrichtenliste scrollt unabhängig vom Dialogkopf und Dialogfuß.

## Prüfung
- Node.js 24.22.1: `npm run build` erfolgreich.
- `npm test -- tests/notifications.test.js tests/app-language.test.js`: 13 bestanden, 0 fehlgeschlagen. Enthalten sind private Lesestände, nur für Administratoren sichtbare Sicherungsfehler, Vermeidung doppelter Nachrichten und Übersetzungen mit unveränderten Nutzerinhalten.
- Dunkel/DE auf Desktop 1440 × 1000 und mobil 440 × 956 sowie 320 × 640 visuell geprüft. Hell/EN bei 320 × 640; zusätzlich 844 × 390 Querformat. Dialog, Nachrichtenkarten und Inhalte ohne horizontalen Überstand. Zeit und Aktionen überlappen nicht. Abschlussbuttons bleiben sichtbar.
- Icon-Aktionen haben in der Accessibility-Ansicht weiterhin die übersetzten Namen „Öffnen“/„Als gelesen markieren“ bzw. „Open“/„Mark as read“. Tab-Navigation erreicht die Aktion; Öffnen schließt den Nachrichtendialog und führt zum Ziel.
- Prüfungen in der isolierten lokalen Demo. Keine produktiven Nachrichten oder Berechtigungen verändert. Sprache/Farbschema nach Prüfung wieder Deutsch/Dunkel.

## Grenzen
Browsergrößen simuliert; kein physischer iPhone-/Safari-Test. Lese- und Benachrichtigungsregeln über vorhandene Integrationstests geprüft. Keine erneute vollständige Sicherheitsprüfung oder neue Version/Release erzeugt.