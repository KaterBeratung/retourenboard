# PostgreSQL und Übernahme von Altinstallationen

Ab 3.2.58 verwendet retourenboard ausschließlich PostgreSQL 16, 17 oder 18.
Die mitgelieferte Einrichtung verwendet PostgreSQL 18. Die Anwendung benötigt
Node.js 24 und einen eigenen Datenbankbenutzer ohne Superuser-, Rollen- oder
Datenbankverwaltung. Der Benutzer muss das Anwendungsschema anlegen dürfen.
Eine Anwendung pro Datenbank ist vorgesehen; eine Datenbanklease verhindert
zwei gleichzeitig schreibende Anwendungsinstanzen.

## Suchindizes ab 4.0.10

Beim ersten Start ergänzt die transaktionale Migration 3 Suchindizes und eine
abgeleitete Tabelle `return_serial_search`. Bestehende Seriennummern werden in
Blöcken von 500 Datensätzen indexiert. Originalschreibweisen, IDs und Verläufe
werden nicht verändert. Dafür beim ersten Start eines großen Bestands zusätzliche
Zeit und Datenbankspeicher einplanen; ein abgebrochener Lauf wird zurückgerollt.

Der Vergleich verwendet dieselbe NFKC-Normalisierung und Unicode-Großschreibung
in Oberfläche, Scan-Erfassung, Suche und Entsorgungsprüfung. So werden etwa
`Straße-001` und `STRASSE-001` als dasselbe Gerät erkannt. Umlaute, Satzzeichen und
innere Leerzeichen bleiben relevant; `O` und `0` werden nicht gleichgesetzt.
Wiederholte Retouren desselben Geräts bleiben erlaubt und werden nicht vereinigt.

Portable Sicherungen behalten Format 2 und ihre bisherigen Datentabellen.
Die Suchdaten werden beim Wiederherstellen und bei der SQLite-Übernahme neu aus
den Originaldaten aufgebaut. Alte Sicherungen bleiben lesbar. SQLite bleibt eine
Migrationsquelle; ein paralleler SQLite-Anwendungsbetrieb ist nicht vorgesehen.

Für Integrationen steht zusätzlich `GET /api/returns?page=1&pageSize=50` zur
Verfügung. Die Antwort enthält `items`, `total`, `page` und `pageSize` (maximal
500). Unterstützt sind `search`, `statusId`, `reasonId`, `assignedUserId` (auch
`unassigned`) sowie `sort` mit `createdAt`, `receiptDate`, `returnNumber`,
`serialNumber`, `productName` oder `statusId` und `direction=asc|desc`.
Suche und Filter gelten vor der Seitenauswahl für den gesamten Bestand.
Ohne diese Parameter liefert die vorhandene Schnittstelle weiterhin ein Array;
das Dashboard benötigt diesen vollständigen Bestand noch für seine lokalen
Auswertungen, gespeicherten Ansichten und Filter.

## Neue Linuxinstallation

Im vollständigen PostgreSQL-Paket:

```sh
sudo bash scripts/install-linux.sh --database local
```

Der Installer verwendet signierte PGDG-Pakete. Er legt unter Debian/Ubuntu
einen eigenen Cluster `18/retourenboard` mit Port **55432**, Loopback-Bindung,
SCRAM-Anmeldung und einer eingeschränkten Anwendungsrolle an. Andere Cluster
werden nicht umkonfiguriert. Wiederholungen erhalten Zugang und Daten.
`--database local` ist bei einer neuen Installation die Voreinstellung.

Für eine bestehende externe Datenbank eine private Datei mit einer einzigen
Verbindungsadresse anlegen, Rechte `0600`, und verwenden:

```sh
sudo bash scripts/install-linux.sh --database external \
  --database-url-file /root/retourenboard-database-url \
  --database-ca-file /root/postgres-ca.pem
```

Beispiel für den **Inhalt der privaten Datei**, nicht als Kommandoargument:
`postgresql://BENUTZER:URL-CODIERTES-KENNWORT@db.example.com:5432/retourenboard?sslmode=verify-full`.
Die CA-Option entfällt bei einem öffentlich vertrauenswürdigen Zertifikat.
Hostname und Zertifikat werden geprüft. `sslmode=require` schaltet die Prüfung
nicht ab. Unverschlüsselte Verbindungen müssen ausdrücklich `sslmode=disable`
verwenden und sind für abgeschottete lokale Netze gedacht. URL-Optionen, die
diese TLS-Regeln überschreiben, werden abgelehnt.

Der Installer kopiert die Verbindung nach `/etc/retourenboard/database-url`
(`root:retourenverwaltung`, `0640`), die CA gegebenenfalls daneben. Die zentrale
Datei `/etc/retourenboard.env` verweist mit `DATABASE_URL_FILE` darauf.
Ein erneuter Installerlauf verwendet diese Verbindung. Er ersetzt sie nicht
unbemerkt durch eine andere Datenbank. Es werden passende PostgreSQL-Clienttools
installiert; im externen Modus wird kein lokaler Datenbankserver angelegt.

## SQLite-Altinstallation unter Linux

Vor dem ersten Wechsel eine externe Sicherung des bisherigen Datenordners und
der env-Datei aufbewahren. Für den Wechsel ein Wartungsfenster einplanen. Der
erste Wechsel erfolgt mit dem **Installer**, nicht mit dem alten In-App-Updater.

```sh
sudo bash scripts/install-linux.sh --database local
```

Der Installer stoppt Anwendung und Updater, legt eine private Offline-Kopie an
und übernimmt die SQLite-Daten über einen WAL-konsistenten Snapshot. Nur die
Arbeitskopie wird auf den bekannten letzten SQLite-Schemastand gebracht.
IDs, Sequenzstände, Preise in Cent, Produktbilder, Dateireferenzen, Konten,
Passworthashes, Berechtigungen, gelöschte Autoren, MFA und Schlüssel bleiben
erhalten. Laufende MFA-Einrichtungen werden verworfen. Nicht bekannte Tabellen,
Migrationen, beschädigte Zuordnungen, fehlende Dateien oder unpassende Schlüssel
brechen die Übernahme ab. Ein belegtes PostgreSQL-Zielschema wird nicht ersetzt.

Die Prüfung vergleicht alle Tabellen über Anzahl und SHA256, Dateigrößen und
Dateihashes sowie verschlüsselte Schlüsselwerte. Die SQLite-Quelle bleibt als
Altbestand erhalten. Nach erfolgreichem Start werden Schreibzugriffe freigegeben.
**Danach darf die alte SQLite-Version nicht wieder gestartet werden:** Sie würde
einen veralteten Bestand bearbeiten. Bei einem späteren Fehler muss der aktuelle
PostgreSQL-Bestand wiederhergestellt oder die Installation vorwärts repariert werden.

## Manueller Migrationsbefehl

Für individuelle Installationen zuerst PostgreSQL-Zugang über `DATABASE_URL`
oder `DATABASE_URL_FILE` konfigurieren. Genau eine Quelle verwenden. `DATA_DIR`
enthält Dateien, Schlüssel, Sicherungen und Journale; `DB_PATH` ist ausschließlich
eine optionale Legacy-Quelle und aktiviert keinen SQLite-Betrieb.

```sh
node --env-file=.env scripts/migrate-sqlite.mjs --check \
  --sqlite /alt/retouren.sqlite --source-data /alt \
  --data-dir /neu/data --report /sicherer/ort/pruefung.json

# Altanwendung und alle Hintergrundschreiber vorher vollständig stoppen:
node --env-file=.env scripts/migrate-sqlite.mjs --apply \
  --sqlite /alt/retouren.sqlite --source-data /alt --data-dir /neu/data \
  --service-stopped --confirm --report /sicherer/ort/migration.json
```

Berichte müssen neue Dateinamen verwenden und enthalten Zähler und Prüfsummen,
keine Zugangsdaten. `--check` aktiviert nichts. Ein identischer bereits
abgeschlossener Lauf meldet `already-committed` und überschreibt auch danach
erfasste PostgreSQL-Änderungen nicht. Originale nie manuell in ein laufendes
Anwendungsdatenverzeichnis kopieren.

## Docker Compose

Die Compose-Dateien stehen unter `deploy/docker/`. Der PostgreSQL-18-Container
speichert unter `/var/lib/postgresql`; die Anwendung verwendet ein separates
Volume `/data`. Der Datenbankport wird nicht auf dem Host veröffentlicht.
Die Weboberfläche bindet standardmäßig nur an `127.0.0.1:3000` des Dockerhosts.

```sh
node scripts/setup-docker.mjs
docker compose --env-file deploy/docker/.env -f deploy/docker/compose.yml config --quiet
docker compose --env-file deploy/docker/.env -f deploy/docker/compose.yml up -d --build
```

Die private Datei `deploy/docker/.env` wird einmal mit unabhängigen App- und
Administratorkennwörtern angelegt und muss erhalten bleiben. Dockeradministratoren
können Containerumgebungen einsehen. Keine aufgelöste Compose-Konfiguration mit
Zugangsdaten veröffentlichen. Für den lokalen PostgreSQL-Wechsel wird diese
Paketversion selbst gebaut. Ein bereits veröffentlichtes SQLite-`latest`-Image
ist kein geeigneter Ersatz. Ein Docker-Image wird durch diese Änderungen nicht
automatisch veröffentlicht.

### Vorhandenes Docker-Datenvolume übernehmen

Zuerst alte Anwendung stoppen und eine Offline-Kopie ihres **vollständigen**
Datenvolumes einschließlich `secrets/` und möglicher WAL-Dateien erstellen.
`RETOURENBOARD_LEGACY_DATA_VOLUME` in der privaten Compose-env-Datei auf den
tatsächlichen alten Volumenamen setzen. Es wird nur lesbar unter `/legacy`
eingebunden. `RETOURENBOARD_DATA_VOLUME` bezeichnet ein neues, separates Zielvolume;
die beiden Volumenamen müssen verschieden sein. Das PostgreSQL-Ziel muss leer sein.

```sh
docker compose --env-file deploy/docker/.env -f deploy/docker/compose.yml build retourenboard
docker compose --env-file deploy/docker/.env -f deploy/docker/compose.yml up -d database
docker compose --env-file deploy/docker/.env -f deploy/docker/compose.yml --profile migration run --rm migrate
docker compose --env-file deploy/docker/.env -f deploy/docker/compose.yml --profile migration run --rm migrate \
  --apply --sqlite /legacy/retouren.sqlite --source-data /legacy --data-dir /data \
  --service-stopped --confirm
docker compose --env-file deploy/docker/.env -f deploy/docker/compose.yml up -d retourenboard
```

Bei einem anderen SQLite-Dateinamen `--sqlite` anpassen. Dateieigentümer müssen
zum Anwendungsbenutzer im Image passen (`node`, UID/GID 1000). Der normale Start
verweigert eine vorhandene SQLite-Quelle ohne bestätigte PostgreSQL-Übernahme.
`docker compose down -v` würde die Datenvolumes entfernen und gehört nicht zu
einem Update oder Migrationslauf.

### Externe Docker-Datenbank und eigene CA

Eine eigene eingeschränkte Rolle und eine leere Datenbank bereitstellen. Die
Verbindung muss aus dem Container erreichbar sein; `localhost` bezeichnet dort
den Container selbst. Die Compose-Konfiguration zuerst einmal erzeugen:

```sh
node scripts/setup-docker.mjs --external-url-file /privat/database-url
docker compose --env-file deploy/docker/.env -f deploy/docker/compose.external.yml config --quiet
docker compose --env-file deploy/docker/.env -f deploy/docker/compose.external.yml up -d --build
```

Bei eigener CA `RETOURENBOARD_DATABASE_CA_FILE` auf den absoluten Hostpfad des
öffentlichen CA-Zertifikats setzen und jeweils zusätzlich
`-f deploy/docker/compose.ca.yml` verwenden. Das CA-Zertifikat muss für UID 1000
lesbar sein; keine privaten Zertifikatschlüssel mounten. Externe Compose enthält
ebenfalls das Profil `migration`, mit denselben `--check`/`--apply`-Befehlen.
In-App-Paketupdates bleiben unter Docker deaktiviert; ein Containerupdate erfolgt
über ein passendes neues Image beziehungsweise einen geprüften lokalen Build.

## Sicherungen, Schlüssel und Offline-Wiederherstellung

Normale herunterladbare Archive verwenden Format 2: geprüfte JSONL-Datensätze,
Produktbilder und referenzierte Dateien mit SHA256. Sie enthalten kein SQL und
keine Entschlüsselungsschlüssel. Alte Format-1-Sicherungen mit SQLite werden auf
Arbeitskopien gelesen. Hochgeladene Archive werden niemals an `pg_restore`
übergeben. Grenzen: 1 GiB pro Datei/Archiv, 2 GiB entpackter Inhalt, begrenzte
Einzelzeilen, Manifestgröße, Dateianzahl, Dekompressionsrate und Prüfzeit.

`secrets/mfa.key` separat geschützt sichern. Für eine vollständige externe
Offline-Kopie gehören ein PostgreSQL-Dump und der gesamte `DATA_DIR` einschließlich
MFA-/SMTP-Schlüsseln sowie die geschützte Verbindungs-/CA-Konfiguration zusammen.
Ein TAR nur vom Datenordner enthält die PostgreSQL-Datenbank **nicht**.

Eine integrierte Sicherung lässt sich zunächst mit `restore-backup.mjs --archive
DATEI --target LEERER_ORDNER [--mfa-key DATEI]` prüfen. Zur Offline-Aktivierung:

```sh
sudo systemctl stop retourenboard
cd /opt/retourenboard/current
sudo /opt/retourenboard/node/bin/node --env-file=/etc/retourenboard.env \
  scripts/restore-backup.mjs --apply --archive /privat/sicherung.tar.gz \
  --data-dir /var/lib/retourenboard --backup /root/vor-wiederherstellung \
  --mfa-key /privat/mfa.key --service-stopped --confirm
sudo chown -R retourenverwaltung:retourenverwaltung /var/lib/retourenboard
sudo systemctl start retourenboard
```

`--backup` muss ein neuer Ordner außerhalb von `DATA_DIR` sein. Das Werkzeug
erstellt vor Änderungen einen vertrauenswürdigen lokalen Dump mit passenden
Clienttools plus Dateikopie. Es erhält verbrauchte MFA-/Recovery-Marker, beendet
Sitzungen und setzt SMTP zurück. Schlüssel fehlen nicht stillschweigend: Ohne
zugänglichen Administrator wird die Offline-Aktivierung abgelehnt.

## Unterbrochene Vorgänge

Wartungsmarker und Journale nicht löschen. Beim Linuxinstaller denselben
Installer erneut ausführen. Er gleicht das private Rootjournal, Code, Laufzeit,
Konfiguration, PostgreSQL und Dateien ab. Vor Freigabe kann er zurückrollen;
nach bestätigter PostgreSQL-Migration repariert er vorwärts oder bleibt in Wartung.
Die privaten Offline-Kopien bleiben für den Betreiber erhalten.

Für eine manuell begonnene Migration bei weiterhin gestoppter Anwendung:

```sh
node --env-file=.env scripts/migrate-sqlite.mjs --recover \
  --data-dir /neu/data --service-stopped --confirm
```

Ein Wiederherstellungsjournal mit bereits freigegebenen PostgreSQL-Schreibrechten
wird nicht auf einen alten Stand zurückgesetzt. Bei widersprüchlichem Journal
bleibt die Anwendung gesperrt; Datenbank und Dateien gemeinsam sichern und den
Fehler untersuchen, statt eine alte SQLite-Quelle zu starten.

## Entwicklung und Tests

`npm test` und `npm run preview` verwenden isolierte PostgreSQL-Testschemas und
synthetische Dateien. `DATABASE_URL` wird dafür nicht als Standard übernommen.
Eine eigene **ausschließlich für Tests** bestimmte Verbindung kann mit
`RETOURENBOARD_TEST_DATABASE_URL` bereitgestellt werden. Alternativ erzeugt der
Teststarter einen temporären Cluster über `RETOURENBOARD_TEST_PG_BIN` (Ordner mit
`initdb`, `pg_ctl` und passenden Clienttools). Unter Linux lautet der Standard
`/usr/lib/postgresql/18/bin`. `initdb` als normaler Benutzer ausführen.
Ohne PostgreSQL-Testserver schlagen Tests ausdrücklich fehl; es gibt keinen
SQLite-Fallback. Einzelne Windows-Symlinktests benötigen zusätzliche Rechte;
die entsprechende Prüfung wird außerdem unter Linux ausgeführt.

Bei einem vorhandenen nichtleeren SQLite-Rollbackjournal (`-journal`) verweigert
die Migration die Übernahme. Zuerst mit der alten Anwendung die SQLite-Recovery
durchführen und diese sauber stoppen; danach erneut `--check` ausführen. Die
Migration verändert oder entfernt dieses Journal nicht. Datenbank und WAL
werden vor der Übernahme in einen privaten Arbeitsordner kopiert und anhand
ihrer Prüfsummen geprüft; SQLite-Hilfsdateien entstehen ausschließlich dort.

## Wiederanlauf bei einer nicht mehr vorhandenen Container-IP

`listen EADDRNOTAVAIL` bedeutet, dass `HOST` eine Adresse enthält, die der
Container nicht besitzt. Ab 3.2.59 prüft der Installer feste IP-Bindungen gegen
die aktuellen Netzwerkschnittstellen. Verfügbare eigene Bind-Adressen bleiben
erhalten; eine nicht mehr vorhandene IP wird durch die Standardbindung ersetzt.
`--lan` setzt ausdrücklich `0.0.0.0`, `--local` setzt `127.0.0.1`.

Auch ein unterbrochener Installationslauf kann seine alte Konfiguration aus dem
privaten Journal wieder einspielen. Der neue Installer korrigiert die Bindung
auch in diesem Wiederanlauf. Die PostgreSQL-Daten und der bestätigte
Migrationsstand bleiben erhalten. Mit dem neuen Installer und dem neuen TAR:

```sh
sudo bash retourenboard-install-4.0.3.sh \
  --archive ./retourenboard-linux-4.0.3.tar.gz --lan
```

Für ausschließlichen Zugriff über localhost stattdessen `--local` verwenden.
Domain, Port und Datenbankzugang werden durch die Bindungskorrektur nicht
geändert. Sicherungen und Installationsjournale nicht manuell löschen.
