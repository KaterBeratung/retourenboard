# Designvorschau

Im Projektverzeichnis `npm run preview` ausführen und http://localhost:3002 öffnen.

Testkonto: **demo** / **RetourenboardDemo2026!**

Die Vorschau verwendet eine neue temporäre Datenbank mit Beispielprodukten und
Retouren. Änderungen, Importe und Uploads betreffen nur diese Vorschau. Mit Strg+C
beenden; ihre temporären Daten werden entfernt. Die Vorschau ist nur lokal
erreichbar. Einen anderen Port mit `npm run preview -- --port 3003` wählen.

Die normale Anwendung läuft weiterhin mit `npm start`. Für die Vorschau bewusst
`localhost` statt `127.0.0.1` verwenden, damit die Browser-Anmeldung getrennt bleibt.
Cookies werden zwischen Ports desselben Hostnamens geteilt.

Der Entwurf ist inzwischen in die Hauptanwendung übernommen. Der Demomodus nutzt
denselben Frontend-Build und dieselbe geschützte API. Unter `public/` liegt nur der
zusätzliche Testhinweis für die Anmeldung; er wird ausschließlich im Demomodus
ausgeliefert. Die TypeScript-Quellen stehen zentral unter `frontend/`.

Nach Quelländerungen `npm run build` ausführen. Für den normalen Start des Demomodus
ist kein Compiler erforderlich.
