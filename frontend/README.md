# Oberfläche

Die freigegebene Oberfläche liegt unter `src/` als TypeScript; HTML und zusätzliche
Stylesheets unter `assets/`. `npm run build` kompiliert die Browsermodule und kopiert
die Vorlagen nach `dist/public`. Hauptanwendung und Demomodus verwenden denselben
Build. Der zentrale Build kompiliert auch `backend/src/` nach `dist/` und bündelt
alle Serverbibliotheken samt Lizenzen.

Zum Bauen wird TypeScript benötigt. Falls es lokal fehlt:

```sh
npm ci
npm run build
```

Für `npm start` und die Linuxinstallation ist kein Compiler notwendig.

Alle HTML-Einstiege laden zunächst `bootstrap.js` und ausschließlich die Module
für Login, Ersteinrichtung und 2FA. Erst nach Bestätigung der Sitzung über
`/api/session` lädt ein dynamischer Import `app.js` und seine Anwendungsmodule.
Auch direkte Abrufe dieser Module und des PDF-Renderers benötigen eine gültige
Sitzung; private Dateien werden mit `Cache-Control: private, no-store` ausgeliefert.
Bei Abmeldung oder Ablauf der Sitzung startet die Seite wieder mit dem öffentlichen
Login-Einstieg. Der Browsercode bleibt nach der Anmeldung in den Entwicklertools
einsehbar; Geheimnisse und Berechtigungsprüfungen gehören weiterhin auf den Server.

Die Suche bündelt Eingaben mit 100 ms Verzögerung; beim Seitenwechsel wird der
ausstehende Suchlauf abgebrochen. Die Aktualisierung alle 30 Sekunden vergleicht
Produkte, Retouren und Stammdaten, bevor sie Listen neu zeichnet. Eingaben und
geöffnete Dialoge unterbrechen diese Aktualisierung wie bisher. Beginnt eine
Eingabe erst während einer laufenden Abfrage, wird deren Ergebnis ebenfalls
zurückgestellt; der nächste sichere Abruf übernimmt dann den aktuellen Stand.

Animationen verwenden nur kurze Änderungen an Deckkraft und Position. Bei
`prefers-reduced-motion: reduce` werden Animationen und Übergänge deaktiviert.

Die Listen filtern vor der Pagination und springen bei Filterwechsel auf Seite 1.
Produkt- und Retourenlisten zeigen 25 Einträge pro Seite. Die frühere globale
Darstellungsverwaltung mit Firmenname, Logo und Listenoptionen wurde entfernt.
Theme und reduzierte Bewegung gehören zum persönlichen Konto; die
Systemvorgabe für reduzierte Bewegung wird ebenfalls berücksichtigt.
Dateianhänge benötigen eine Anmeldung und die entsprechenden Kontorechte.

## Escaping in Markup

`html`…`` setzt eingesetzte Werte unverändert ein. Nutzerdaten (Namen, Notizen, Dateinamen, Seriennummern …) werden deshalb immer mit `h(…)` ausgegeben; Beschriftungen mit `t(…)`. `tests/html-escaping.test.js` prüft das automatisch: Stellen, die nicht als sicher nachweisbar sind, stehen in `tests/fixtures/html-interpolation-baseline.json`; neue Stellen sowie Muster wie `document.write`, `eval`, Inline-Ereignisattribute und unquotierte Attribute lassen den Test fehlschlagen. Ist ein neuer Wert nachweislich kein Text (ID, Zähler), die Baseline mit `UPDATE_HTML_BASELINE=1 node --test tests/html-escaping.test.js` aktualisieren und die Änderung begründen.
