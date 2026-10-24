# Docker mit PostgreSQL

Das vollständige Linuxpaket enthält den geprüften Build sowie Compose-Dateien für PostgreSQL 18 oder eine externe PostgreSQL-Datenbank. Im Quellcheckout zuerst mit Node.js ab Version 24 `npm ci` und `npm run build` ausführen. Das Image `retourenboard:local` wird aus diesem Paket gebaut; es setzt keine Veröffentlichung auf GitHub voraus.

## Einrichtung

Im Paketverzeichnis:

```sh
node scripts/setup-docker.mjs
docker compose --env-file deploy/docker/.env -f deploy/docker/compose.yml config --quiet
docker compose --env-file deploy/docker/.env -f deploy/docker/compose.yml up -d --build
```

Das Setup erzeugt getrennte zufällige Datenbankkennwörter in der privaten Datei `deploy/docker/.env` und überschreibt keine vorhandene Konfiguration. Die Anwendung ist unter `http://127.0.0.1:3000` erreichbar; der Datenbankport wird nicht veröffentlicht. Beim ersten Aufruf den Administrator einrichten. Die Konfigurationsdatei für weitere Starts sicher aufbewahren.

Im Quellcheckout kann mit Docker Compose ab 2.20.3 auch die Root-Datei verwendet werden. Im Linuxpaket die oben gezeigte Datei unter `deploy/docker/` verwenden:

```sh
docker compose --env-file deploy/docker/.env up -d --build
```

Sie bindet dieselbe PostgreSQL-Konfiguration ein und verwendet dieselben Volumes. Das explizite `--env-file` vermeidet Verwechslungen mit einer `.env` für einen nativen Anwendungsstart. Bei älterem Compose die erste Befehlsvariante mit `-f deploy/docker/compose.yml` verwenden. Die Voraussetzungen für `include` beschreibt die [Docker-Dokumentation](https://docs.docker.com/compose/how-tos/multiple-compose-files/include/).

Für einen vorhandenen Datenbankserver `node scripts/setup-docker.mjs --external-url-file /privater/pfad/database-url` verwenden und bei allen Befehlen `compose.external.yml` statt `compose.yml` wählen. Die [PostgreSQL-Anleitung](POSTGRESQL.md#docker-compose) beschreibt TLS/CA, Migration und Dateirechte. Für HTTPS hinter einem Reverse Proxy `PUBLIC_ORIGIN`, `SECURE_COOKIES` und gegebenenfalls `TRUSTED_PROXIES` über `RB_PUBLIC_ORIGIN`, `RB_SECURE_COOKIES` und `RB_TRUSTED_PROXIES` konfigurieren. Ein LAN-Binding mit `RB_BIND_IP=0.0.0.0` benötigt eine passende Firewall.

## Sicherung und Update

Vor einem Update unter **Adminbereich → Sicherungen** eine vollständige Anwendungssicherung erstellen und herunterladen. Erforderliche MFA-Schlüssel separat sichern. Für eine komplette Offline-Wiederherstellung zusätzlich die PostgreSQL-Datenbank mit passenden Clienttools sowie den vollständigen Datei-/Schlüsselordner sichern. Das Anwendungsvolume allein enthält keine PostgreSQL-Datenbank. Bei externer PostgreSQL-Datenbank deren Sicherung gesondert organisieren.

Das neue vollständige Paket in einem eigenen Verzeichnis entpacken. Die private Docker-Konfiguration und die bestehenden Volume-/Projektnamen übernehmen, dann denselben Compose-Aufruf mit `up -d --build` ausführen. Anschließend `/health`, die Versionsanzeige, Anmeldung und vorhandene Daten prüfen. `docker compose down -v` entfernt verwaltete Volumes und ist kein Updateschritt. Eine alte SQLite-Installation zuerst über den dokumentierten Migrationsablauf übernehmen; ihre Quelle und Sicherung erhalten.

Der Versionscheck funktioniert im Container. Der systemd-basierte In-App-Installer ersetzt keine Dockercontainer; Aktualisierungen erfolgen über den lokalen Build oder ein ausdrücklich veröffentlichtes Image der gewünschten Version.

## Veröffentlichte Images

Der Workflow **Build and publish Docker image** prüft das Linux-Releasepaket und seine SHA256-Datei und veröffentlicht bei einem ausdrücklichen GitHub-Release Images für `linux/amd64` und `linux/arm64` unter `ghcr.io/katerberatung/retourenboard:<Version>`. Das `latest`-Tag erhält nur das aktuellste reguläre Release. Für PostgreSQL nur ein nachweislich passendes Image verwenden; ein älteres SQLite-Image ist ungeeignet. Ein privates Registry-Paket benötigt eine berechtigte Anmeldung des Dockerhosts.
