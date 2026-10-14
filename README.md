# retourenboard.

**Ein Ort für alle Rückläufer.**

retourenboard. ist eine Webanwendung zum Selbsthosten für Produkte, Retouren und die Zusammenarbeit im Team. Alle Konten arbeiten mit demselben Bestand; welche Aktionen erlaubt sind, entscheidet die Kontoverwaltung. Bestandsdaten, Chats und Dateianhänge sind ausschließlich nach Anmeldung zugänglich.

**Projektstand: 3.2.55** · [Neueste veröffentlichte Version herunterladen](https://github.com/KaterBeratung/retourenboard/releases/latest) · [Alle Releases](https://github.com/KaterBeratung/retourenboard/releases)

### Schnellstart mit Docker Compose (Version 3.2.55)

Dieses Release enthält `Dockerfile`, `compose.yaml` und einen fertigen `dist/`-Build. Nach dem Entpacken im Projektordner:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f retourenboard
```

**Öffnen:** http://127.0.0.1:3000 auf dem Docker-Host. Beim ersten Aufruf wird der Administrator im Browser eingerichtet. Für LAN-Zugriff `.env.compose.example` nach `.env` kopieren, `RB_BIND_IP=0.0.0.0` setzen und `docker compose up -d` erneut ausführen. Die Daten bleiben im Docker-Volume `retourenboard-data` erhalten. [Docker-Details, HTTPS und Backups](#docker).

Die Oberfläche verwendet abgestimmte Karten, Suchfelder, Statusanzeigen und Formularabstände. Farbige Workflow-Icons kennzeichnen Eingang, Prüfung, Bearbeitung und Abschluss; Kennzahlenkarten bleiben auch bei mehrzeiligen Texten gleich hoch. Übersicht, Konto, Administration, Chat und Login sind für Desktop und mobile Ansichten in beiden Sprachen und Farbschemata gestaltet.

In Übersicht und Retourenliste lassen sich Retourennummer und Seriennummer direkt über die Schnellaktionen kopieren. Das Barcode-Icon kopiert die Seriennummer; bei fehlender Seriennummer ist es deaktiviert.

Die Schnellaktionen zeigen gestaltete Tooltips und bestätigen das Kopieren kurz mit einem Häkchen. Statuswechsel und Seriennummer-Kopieren sind direkt erreichbar; weitere Aktionen stehen im Drei-Punkte-Menü. Retourendetails gliedern Gerät, Seriennummer, Zuordnung, Bearbeitung, Dateien und Kommentare. Auf kleinen Bildschirmen sind Übersicht, Retouren und Produkte über eine untere Navigationsleiste erreichbar; „Mehr“ öffnet die weiteren Bereiche. Berechtigte Konten können über die feste Hauptaktion neue Retouren oder Produkte anlegen. Dezente Ladeplatzhalter erscheinen beim ersten Laden und beachten die Einstellung für reduzierte Animationen.

Die Übersicht lässt sich pro Konto anpassen: Karten innerhalb ihrer Bereiche verschieben oder ausblenden und leere Aufgaben kompakter anzeigen. Produkt- und Retourenlisten lassen sich vor der Seiteneinteilung sortieren; auf Mobilgeräten ist die Sortierung über eine Auswahl erreichbar.

Neue Retouren werden im jeweiligen Browser als kontogetrennte Entwürfe für höchstens 24 Stunden zwischengespeichert. Nach einem Neuladen kann der Entwurf ausdrücklich wiederhergestellt oder verworfen werden. Dateien und Anmeldedaten werden dabei nicht gespeichert. Das Feld für eine Austauschseriennummer erscheint bei einer Austauschlösung oder vorhandenen Daten und lässt sich für eigene Lösungen zusätzlich öffnen.

Retourenetiketten enthalten Gerätekennungen einschließlich vorhandener Austauschseriennummer sowie auf größeren Formaten Produkt-, Eingangs- und Bearbeitungsdaten. Die Druckvorschau bietet A4, 103 × 164 mm, 62 × 29 mm und das allgemeine Drucklayout. Optionale Angaben können ausgeblendet werden; überlange Inhalte blockieren das Drucken, bevor Kennungen abgeschnitten werden. Im Druckerdialog das passende Papierformat und tatsächliche Größe / 100 % wählen und Browser-Kopf-/Fußzeilen deaktivieren. Der QR-Code enthält ausschließlich die Retourennummer.

Die Anmeldung hat eine eigene Seite unter `/login`, ohne Dashboard im Dokument. Nicht angemeldete Aufrufe geschützter Bereiche werden dorthin geleitet. Nach vollständiger Anmeldung einschließlich 2FA öffnet sich der zuvor gewünschte Bereich; Abmeldung und abgelaufene Sitzungen führen ebenfalls zur Loginseite. Weiterleitungsziele sind auf lokale Anwendungsseiten beschränkt.

Bereichswechsel beginnen ihre kurze Bewegung direkt beim Anzeigen; nachgeladene Daten und Filter lösen keine zweite Animation aus. Dialoge, Detailansichten, Menüs und Schalter verwenden abgestimmte Übergänge. Die Systemeinstellung und „Animationen reduzieren“ im Konto deaktivieren Bewegung einschließlich Dropdowns und Dialoghintergründen.

Der lokale Projektstand und das neueste veröffentlichte GitHub-Release können voneinander abweichen.

## Inhalt

- [Funktionen](#funktionen)
- [Installation auf Debian / Ubuntu / LXC](#installation-auf-debian--ubuntu--lxc)
- [Updates und Dienstverwaltung](#updates-und-dienstverwaltung)
- [Domain, Reverse Proxy und HTTPS](#domain-reverse-proxy-und-https)
- [Konten und Berechtigungen](#konten-und-berechtigungen)
- [Produkte, Stammdaten und Retouren](#produkte-stammdaten-und-retouren)
- [CSV-Import und Export](#csv-import-und-export)
- [Dateianhänge](#dateianhänge)
- [Chat, Kommentare und Benachrichtigungen](#chat-kommentare-und-benachrichtigungen)
- [Sprache, Darstellung und Währung](#sprache-darstellung-und-währung)
- [Sicherungen und Wiederherstellung](#sicherungen-und-wiederherstellung)
- [Lokaler Start und Entwicklung](#lokaler-start-und-entwicklung)
- [Produktwebseite](#produktwebseite)
- [Docker](#docker)
- [Projektstruktur und Releasepakete](#projektstruktur-und-releasepakete)
- [Projekt unterstützen](#projekt-unterstützen)
- [Fehlerbehebung](#fehlerbehebung)

## Funktionen

| Bereich | Möglichkeiten |
| --- | --- |
| Übersicht | Kennzahlen, aktuelle Retouren, Bearbeitungsstatus und Warenwert offener Vorgänge |
| Produkte | Artikelnummer, EAN, Hersteller, Lieferant, Kategorie, EUR-Preis, Beschreibung und Archivierung |
| Retouren | Zuständigkeit, nächster Schritt, Zeitleiste, Mehrfachaktionen, Produktsuche, Seriennummer, Kundenreferenz, Erfassungszeit, optionales Eingangsdatum, Bestellnummer, Lieferant, Grund, Zustand, Status, Lösung und Notizen |
| Dateien | Upload, Download sowie Vorschau für PDF, PNG, JPEG und WebP |
| Datenaustausch | CSV-Vorlagen, Spaltenzuordnung, geprüfte Importvorschau, Importprofile und Export |
| Team | Gemeinsamer Chat, Privatnachrichten, öffentliche und geschlossene Gruppen, Retourenkommentare und @Erwähnungen |
| Konten | Erster Account als Admin, weitere Konten durch Admins, Einzelrechte, TOTP-2FA, Recovery-Codes und Sitzungsverwaltung |
| Administration | Stammdaten, Retourenregeln, Sicherungen, Benachrichtigungen, Änderungsverlauf, Diagnose, Serverlogs und Neustart |
| Updates | Automatischer und manueller Versionscheck sowie In-App-Installation auf verwalteten Linuxinstallationen |
| Oberfläche | Deutsch / Englisch, Hell- / Dunkelmodus, reduzierte Bewegung, responsive Navigation und persönliche EUR- / USD-Anzeige |

Die Anwendung verwendet Node.js und SQLite. Server und Oberfläche werden aus den Quellen unter `backend/` und `frontend/` gebaut; neue Module und die Oberfläche verwenden TypeScript. Für den Betrieb ist eine einzelne Serverinstanz mit dauerhaftem Datenspeicher vorgesehen.

## Installation auf Debian / Ubuntu / LXC

### Voraussetzungen

- Debian oder Ubuntu mit laufendem systemd, als Server oder LXC.
- x86_64 oder ARM64, Internetzugang und root beziehungsweise sudo für die Installation.
- Eine erreichbare Container-/Server-IP. Standardport der Anwendung: **3000**.

Bei einem unprivilegierten Proxmox-LXC kann die systemd-Isolation die Containerfunktion **Nesting** benötigen. Falls der Dienst daran scheitert, diese unter **Optionen → Features** aktivieren und den Container neu starten.

### Schnellstart mit dem Downloadskript

1. Im [neuesten GitHub-Release](https://github.com/KaterBeratung/retourenboard/releases/latest) das kleine Downloadskript `retourenboard-install-<Version>.sh` herunterladen. Ein dort vorhandener Installer mit dem Namen `retourenboard-install.sh` funktioniert ebenfalls.
2. Die Datei beispielsweise mit SCP oder WinSCP auf den Container übertragen und für die folgenden Befehle als `retourenboard-install.sh` speichern.
3. In der Containerkonsole installieren:

   ```sh
   sudo bash retourenboard-install.sh
   ```

   In einer root-Konsole genügt `bash retourenboard-install.sh`.

4. Die am Ende ausgegebene Adresse **`http://CONTAINER-IP:3000`** im Browser öffnen und den ersten Administrator anlegen. Bei einem anderen aktiven Port gibt der Installer diesen aus.

Der Installer lädt bei jedem Start das neueste veröffentlichte TAR-Paket aus den GitHub-Releases von `KaterBeratung/retourenboard`. Dazu ermittelt er das aktuelle Release und lädt TAR sowie die zugehörige `.sha256`-Datei aus derselben Version. Nach erfolgreicher Prüfsummenprüfung installiert er eine geprüfte offizielle Node.js-24-Laufzeit und richtet den automatisch startenden Dienst ein. Die kleine Skriptdatei enthält keine eingebettete Anwendung und kann auch bei späteren Releases wiederverwendet werden. Zum Download werden `curl` und CA-Zertifikate benötigt; falls nötig vorher `sudo apt install curl ca-certificates` ausführen. Ein npm-Installationsschritt auf dem Server ist nicht nötig. Das Paket enthält keine lokalen Konten, Bestandsdaten oder Anhänge des Entwicklers.

Standardmäßig bindet die Linuxinstallation an `HOST=0.0.0.0`. Eine Firewall muss den verwendeten Port für die gewünschten Geräte freigeben. Den ersten Administrator einrichten, bevor die Anwendung öffentlich zugänglich wird. HTTP im LAN ist unverschlüsselt; für eine öffentliche Domain HTTPS verwenden.

### Vor der Installation testen

```sh
# Paket und Installationsplan prüfen, ohne Systemänderungen:
bash retourenboard-install.sh --dry-run

# Temporär starten, automatisch prüfen und wieder beenden:
bash retourenboard-install.sh --test --once

# Im LAN mit frischen Testdaten ausprobieren:
bash retourenboard-install.sh --test --lan

# Einen anderen Testport verwenden:
bash retourenboard-install.sh --test --lan --port 3002
```

Der Testmodus verwendet standardmäßig **Port 3001** und eine eigene temporäre Datenbank. Test und Probelauf benötigen kein root, ändern keine bestehende Installation und übernehmen keine Testkonten in den späteren Betrieb. Strg+C beendet den Test und entfernt seine Daten; nach einem erzwungenen Abbruch kann der ausgegebene temporäre Ordner zurückbleiben.

Für den Test werden Linux-Grundprogramme, `curl`, CA-Zertifikate, `xz-utils` und `tar` benötigt. Fehlt eine Node.js-Laufzeit ab Version 24, lädt der Test sie mit Prüfsummenprüfung in einen temporären Ordner. Dabei werden keine apt-Pakete oder systemd-Dienste installiert. `--dry-run` führt keinen Node-Download aus.

| Option | Wirkung |
| --- | --- |
| `--dry-run` / `--check` | Paketdateien und Installationsplan prüfen |
| `--test` | Temporären Testbetrieb auf Port 3001 starten |
| `--once` | Teststart automatisch prüfen und beenden; benötigt `--test` |
| `--port 3002` | Port für Testbetrieb oder eine Neuinstallation festlegen |
| `--lan` | Bindung an alle IPv4-Schnittstellen ausdrücklich setzen |
| `--local` | Zugriff auf localhost beschränken |
| `--domain retouren.example.com` | HTTPS-Adresse bei der Neuinstallation vorbereiten; Proxy und Zertifikat separat einrichten |
| `--help` | Hilfe anzeigen |

`--lan` und `--local` sind Alternativen. `--test` lässt sich nicht mit `--dry-run` oder `--domain` kombinieren. Für eine vorhandene Installation bleiben Domain und Port erhalten.

### Alternative: TAR-Paket

Das Release enthält auch `retourenboard-linux-<Version>.tar.gz`. In einen eigenen Ordner entpacken und dort starten; im Befehl die tatsächliche Version einsetzen:

```sh
mkdir retourenboard-package
tar -xzf retourenboard-linux-<Version>.tar.gz -C retourenboard-package
cd retourenboard-package
bash scripts/install-linux.sh --dry-run
sudo bash scripts/install-linux.sh
```

Bei mitgelieferten `.sha256`-Dateien lässt sich der Download vorab im selben Ordner mit `sha256sum --check DATEINAME.sha256` prüfen. Das Skript unter `scripts/` benötigt den vollständigen Paketordner; das kleine Downloadskript lädt diesen bei jedem Start von GitHub. Auch `--dry-run` und `--test` laden und prüfen zuerst das aktuelle TAR; `--help` funktioniert ohne Internet.

## Updates und Dienstverwaltung

### Update über den Installer

Das kleine Downloadskript erneut ausführen; es lädt automatisch die neueste veröffentlichte Anwendungsversion:

```sh
sudo bash retourenboard-install.sh
```

Konten, Datenbank, Anhänge, Domain und Port bleiben erhalten. Frühere Programmversionen bleiben unter `/opt/retourenverwaltung/releases/` verfügbar. Vor einem Update eine Sicherung außerhalb des Servers aufbewahren.

Eine bisherige localhost-Bindung wird beim normalen Installerlauf auf Container-Zugriff umgestellt. Individuelle andere Bind-Adressen bleiben erhalten. Wer ausschließlich localhost verwenden möchte, führt den Installer mit `--local` aus; `--lan` öffnet die Bindung ausdrücklich.

### In-App-Update

Beim regulären Serverstart wird das neueste stabile Release von `KaterBeratung/retourenboard` automatisch geprüft; danach läuft der Check alle sechs Stunden. Das Ergebnis und der nächste Prüfzeitpunkt stehen unter **Adminbereich → Version & Updates**. Die geöffnete Ansicht liest alle 30 Sekunden den gespeicherten Prüfstatus. **Jetzt prüfen** bleibt für manuelle Abfragen verfügbar. Installationen starten weiterhin über die Updateaktion.

Auf der verwalteten Debian-/Ubuntu-Installation können Administratoren ein neueres Release direkt installieren. Dafür sind das aktuelle Passwort, gegebenenfalls ein 2FA-/Recovery-Code und eine ausdrückliche Bestätigung erforderlich. Das Release muss das versionierte TAR-Paket und seine `.sha256`-Datei enthalten.

Vor dem Update werden eine normale Sicherung und ein vollständiger privater Offline-Datenstand erstellt. Anschließend startet der Dienst neu; alle Personen melden sich erneut an. Bei einem Startfehler setzt der Updater die vorherige Programmversion und den Datenstand zurück. In-App-Updates ersetzen die Anwendung; Änderungen am Updaterdienst oder an der Node-Laufzeit benötigen einen Installerlauf. Windowsvorschauen und Docker ohne die verwaltete systemd-Installation bieten diese Installation nicht an.

Einrichtung, Speicherbedarf und Wiederanlauf nach Unterbrechungen: [In-App-Updates](docs/IN-APP-UPDATES.md).

### Dienste und Speicherorte

```sh
sudo systemctl status retourenboard --no-pager
sudo journalctl -u retourenboard -f
sudo systemctl restart retourenboard
sudo systemctl status retourenboard-updater --no-pager
```

| Pfad / Name | Zweck |
| --- | --- |
| `retourenboard.service` | Anwendungsdienst |
| `retourenboard-updater.service` | Separater privilegierter Linux-Updater und Dienstneustart |
| `/opt/retourenverwaltung/current` | Aktive Programmversion |
| `/opt/retourenverwaltung/releases/` | Installierte Programmversionen |
| `/opt/retourenverwaltung/node/bin/node` | Vom Installer verwaltete Node.js-Laufzeit |
| `/var/lib/retourenverwaltung/` | Datenbank, Anhänge, Sicherungen und lokale Schlüssel |
| `/etc/retourenverwaltung.env` | Konfiguration; nur root darf lesen |
| `/var/lib/retourenboard-updater/` | Private Updateaufträge, Downloads und Offline-Kopien |

Der Dienst heißt **retourenboard**. Die bestehenden Verzeichnisse und der Dienstbenutzer `retourenverwaltung` bleiben aus Kompatibilitätsgründen erhalten; `retourenverwaltung.service` ist ein Alias.

Unter **Servereinstellungen → Serverbetrieb** lassen sich Logs ansehen und Neustarts anstoßen. Ein Neustart erfordert einen Bestätigungsschalter und bei aktiver 2FA einen gültigen Faktor; das Passwort wird dafür nicht erneut verlangt. Gespeicherte Netzwerkeinstellungen werden übernommen und laufende Sitzungen beendet. Updates, Sicherungen und Wiederherstellungen können den Neustart vorübergehend sperren.

Der Installer hat derzeit keinen `--uninstall`-Schalter. Zum Stilllegen, unter Erhalt aller Dateien und Daten:

```sh
sudo systemctl disable --now retourenboard-updater.service
sudo systemctl disable --now retourenboard.service
```

## Domain, Reverse Proxy und HTTPS

Bei einer Neuinstallation kann die öffentliche Adresse vorbereitet werden:

```sh
sudo bash retourenboard-install.sh --domain retouren.example.com
```

DNS, HTTPS-Zertifikat und Reverse Proxy werden separat eingerichtet. Bei einer bestehenden Installation die öffentliche Adresse und den Port unter **Adminbereich → Servereinstellungen** ändern, speichern und den Server neu starten. Im Adminbereich gespeicherte Netzwerkeinstellungen haben Vorrang vor der Konfigurationsdatei.

Beispiel für `/etc/retourenverwaltung.env`, wenn noch keine abweichenden Netzwerkeinstellungen gespeichert sind:

```ini
HOST=0.0.0.0
PORT=3000
DB_PATH=/var/lib/retourenverwaltung/retouren.sqlite
PUBLIC_ORIGIN=https://retouren.example.com
SECURE_COOKIES=true
TRUSTED_PROXIES=127.0.0.1,::1
NODE_ENV=production
```

`TRUSTED_PROXIES` enthält ausschließlich die tatsächlichen IP-Adressen eigener Reverse-Proxys. Bei einem getrennten Proxy dessen IP verwenden. Nur von diesen Verbindungen werden weitergeleitete Clientadressen ausgewertet.

Für einen Nginx-Proxy **im selben Container** zunächst die Pakete installieren:

```sh
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

Dann die folgende Konfiguration unter `/etc/nginx/sites-available/retourenboard` speichern. Domain und internen Port anpassen:

```nginx
server {
    listen 80;
    server_name retouren.example.com;
    client_max_body_size 11m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Die Konfiguration aktivieren, prüfen und das Zertifikat einrichten:

```sh
sudo ln -s /etc/nginx/sites-available/retourenboard /etc/nginx/sites-enabled/retourenboard
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d retouren.example.com --redirect
sudo systemctl restart retourenboard
```

Für die Zertifikatseinrichtung müssen DNS sowie Ports 80 und 443 passen. `client_max_body_size` an die eingestellte Uploadgröße anpassen; für das Hochladen großer Sicherungen muss der Proxy zusätzlich ausreichend große Anfragen erlauben.

### Lokaler Zugang bleibt verfügbar

Mit `HOST=0.0.0.0` bleibt **`http://PRIVATE-CONTAINER-IP:PORT`** neben der HTTPS-Domain erreichbar. Die Anwendung erkennt die direkt verbundene private Server-IP und verwendet dafür eine getrennte Sitzung. Öffentliche IPs und weitergeleitete Proxy-Anfragen erhalten diese HTTP-Ausnahme nicht. Lokales HTTP überträgt Daten unverschlüsselt; Anmeldung, 2FA und Berechtigungen gelten trotzdem.

Mit `--local` bleibt nur localhost erreichbar. Alternativ einen SSH-Tunnel öffnen:

```sh
ssh -L 3001:127.0.0.1:3000 BENUTZER@SERVER
```

Danach auf dem eigenen Rechner `http://127.0.0.1:3001` öffnen. Die öffentliche Adresse muss exakt zur tatsächlich verwendeten HTTPS-Adresse passen, einschließlich eines abweichenden externen Ports; Varianten mit und ohne `www` sind unterschiedliche Adressen.

## Konten und Berechtigungen

Der erste Account wird beim Browseraufruf als **Administrator** angelegt. Danach gibt es keine öffentliche Registrierung. Weitere Konten erstellen Administratoren unter **Benutzerkonten**.

- **Administrator:** Voller Zugriff; Einzelrechte schränken diese Rolle nicht ein.
- **Mitarbeiter:** Bestandsbearbeitung, CSV und Teamfunktionen als Standard; Rechte können einzeln eingeschränkt oder um delegierte Verwaltungsaufgaben ergänzt werden.
- **Lesekonto:** Lesender Zugriff; Exporte, Dateizugriff, Verlauf und Diagnose können separat vergeben werden. Schreibrechte bleiben ausgeschaltet.

Es gibt **25 Einzelrechte** für Produkte, Retouren, Dateianhänge, Chat / Kommentare und Verwaltungsaufgaben. Stammdaten, CSV-Profile, Retourenregeln, Änderungsverlauf und Diagnose können gezielt delegiert werden. Kontenverwaltung, Servereinstellungen, Sicherungen, Updates und die zentrale Benachrichtigungskonfiguration bleiben Administratoren vorbehalten. Rechte werden auch bei direkten API-Aufrufen serverseitig geprüft. CSV-Importrecht ersetzt keine fehlenden Anlege- oder Bearbeitungsrechte.

Konten können deaktiviert werden. Deaktivierung und Passwortwechsel beenden bestehende Sitzungen; der letzte aktive Administrator bleibt geschützt. Passwörter benötigen 12–256 Zeichen, Benutzernamen 3–64 zulässige Zeichen. Die Anmeldung unterscheidet bei Benutzernamen nicht zwischen Groß- und Kleinschreibung.

Unter **Mein Konto** lassen sich Anzeigename, Passwort, persönliche Darstellung und Sitzungen verwalten. Sitzungen bleiben standardmäßig acht Stunden gültig; Administratoren können die Dauer zwischen 1 und 24 Stunden einstellen. Ein Serverneustart beendet alle Sitzungen.

### Zwei-Faktor-Anmeldung

2FA verwendet eine Authenticator-App mit TOTP. Die Einrichtung erfordert das aktuelle Passwort, einen bestätigten App-Code und die Bestätigung, dass die **zehn Recovery-Codes** gesichert wurden. Jeder Recovery-Code funktioniert einmal. Sensible Kontoaktionen verlangen bei aktiver 2FA ebenfalls einen gültigen Faktor.

Administratoren können den Faktor eines anderen Kontos nach eigener Identitätsprüfung zurücksetzen. Anschließend muss dieses Konto nach der Passwortanmeldung erneut 2FA einrichten. Ein Passwortreset entfernt den Faktor nicht. Für ausgesperrte Konten steht ein Offline-Werkzeug zur Verfügung; siehe [Fehlerbehebung](#fehlerbehebung).

## Produkte, Stammdaten und Retouren

1. Lieferanten, Hersteller, Kategorien sowie Gründe, Zustände, Status und Lösungen unter **Stammdaten** anlegen oder anpassen.
2. Produkte mit Artikelnummer und Namen erfassen und vorhandene Stammdaten auswählen.
3. Retouren dem Produkt zuordnen und die passenden Optionen auswählen.

Beim Erfassen lässt sich das Produkt nach Name, Artikelnummer oder EAN suchen. Die Trefferliste unterstützt Pfeiltasten, Enter und Escape. Das zuletzt gespeicherte Produkt lässt sich innerhalb der laufenden Browseransicht erneut übernehmen. „Speichern & weitere Retoure“ öffnet nach erfolgreichem Speichern einen neuen Vorgang mit demselben Produkt und seinem aktiven Lieferanten; Seriennummer, Kundenreferenz und weitere Vorgangsdaten werden neu eingegeben.

**Bestand durchsuchen:** Die globale Suche im Kopfbereich oder mit `Strg/Cmd + K` findet Produkte und Retouren anhand von Name, Artikelnummer, EAN, Retouren- und Seriennummer, Austauschseriennummer, Sendungsnummer, Kundenreferenz oder Lieferant. Auf dem Smartphone ist die Suche unter **Mehr** erreichbar. Ein Treffer öffnet direkt seine Details.

**Gespeicherte Ansichten:** In Produkt- und Retourenlisten lässt sich die aktuelle Suche mit ihren Filtern benennen und erneut aufrufen. Bis zu 20 Ansichten bleiben pro Konto in diesem Browser gespeichert. Schnellfilter öffnen offene, überfällige oder eigene Retouren. Zuständigkeiten sind zusätzlich nach Person oder ohne Zuordnung filterbar. Die Statuszähler berücksichtigen Suche, Retourengrund und Zuständigkeit; sie zeigen die verfügbaren Treffer je Status unabhängig vom gerade ausgewählten Statusreiter.

**Bearbeitung:** Optional können ein aktives Konto als verantwortliche Person und ein nächster Arbeitsschritt (maximal 500 Zeichen) hinterlegt werden. Der Verlauf in den Details zeigt Erfassung, Status, Zuständigkeit, nächste Schritte, bestehende Kommentare und erlaubte Dateiuploads. Gelöschte Kommentare/Dateien werden nicht angezeigt. Ältere Aktivitäten lassen sich nachladen; bei Änderungen direkt im Vorgang aktualisiert sich der Verlauf.

**Mehrfachaktionen:** Berechtigte Konten wählen bis zu 200 Retouren aus, auch über mehrere Listenseiten. Ein Statuswechsel wird gemeinsam validiert und gespeichert; der Export enthält ausschließlich die ausgewählten Vorgänge. Filter- oder Bereichswechsel heben die Auswahl auf.

Formulare zeigen Fehler direkt am betroffenen Feld. Bereits verwendete Seriennummern führen zu einem Hinweis mit den vorhandenen Vorgängen; eine erneute Retoure desselben Geräts bleibt möglich. Die Prüfung beim Speichern bleibt maßgeblich.

In Retourenlisten stehen Schnellaktionen für Statusänderung, das Kopieren der Retourennummer und das Öffnen der Details bereit. Von der Produktliste aus lässt sich direkt eine Retoure zum gewählten aktiven Produkt anlegen. Die jeweiligen Kontoberechtigungen gelten auch hier.

Neue Retouren benötigen eine **Seriennummer**. Eine optionale **Kundenreferenz** kann erfasst, gesucht und als CSV importiert oder exportiert werden. Zusätzlich lässt sich eine **Sendungsnummer** mit maximal 250 Zeichen beim Anlegen, Bearbeiten und in der Scan-Erfassung hinterlegen. Sie wird als Text gespeichert, damit führende Nullen erhalten bleiben, und erscheint in Übersicht, Liste, Details und auf größeren Etiketten mit eingeblendeten Bearbeitungsinformationen. Suche, Entwürfe, Änderungsverlauf sowie CSV- und JSON-Transfer berücksichtigen sie ebenfalls. Die CSV-Zuordnung erkennt „Sendungsnummer“ und „Tracking number“. Der automatisch gespeicherte Erfassungszeitpunkt wird mit Datum und Uhrzeit in Übersicht, Liste und Details angezeigt; das Eingangsdatum bleibt davon unabhängig. Das **Eingangsdatum ist optional** und bei neuen Retouren mit dem aktuellen Tag in der eingestellten Retouren-Zeitzone vorbelegt. Das Datum kann geändert oder entfernt werden; vorhandene Datumswerte werden beim Bearbeiten erhalten. Ohne Datum wird keine Bearbeitungsfrist berechnet. Lieferant, Bestellnummer und Notizen sind standardmäßig ebenfalls optional. Unter **Retourenregeln** können zusätzliche Pflichtfelder, Nummernpräfix, Zeitzone und Bearbeitungsfrist festgelegt werden. Die Standardfrist beträgt 14 Kalendertage in `Europe/Berlin`; 0 deaktiviert die Frist. Historische Retouren ohne Seriennummer bleiben bearbeitbar, eine vorhandene Seriennummer lässt sich nicht leeren.

Bei Produktwahl wird dessen aktiver Lieferant vorausgewählt. Die Retoure speichert ihre Zuordnung unabhängig; eine spätere Produktänderung überschreibt sie nicht. Stammdaten können umbenannt, archiviert und reaktiviert werden. Verwendete Werte bleiben beim Entfernen als archivierte Zuordnungen lesbar. Bei Status bestimmt die Abschlussoption, welche Vorgänge als abgeschlossen zählen.

**Tabellenansicht:** Produkte und Retouren bieten ein Menü für sichtbare Spalten und kompakte oder großzügige Zeilenabstände. Produktidentität und Aktionen bleiben verfügbar. Die Einstellungen werden getrennt pro Konto und Liste in diesem Browser gespeichert; Filter, Auswahl und Listenseite bleiben beim Umstellen erhalten.

**Seitenpanel:** Details und Bearbeitung bestehender Produkte und Retouren öffnen am rechten Rand. Nach dem Speichern zeigt das Panel die aktualisierten Details; die gefilterte Liste bleibt im Hintergrund erhalten.

**Aufgaben und Auswertungen:** Die Übersicht zeigt eigene offene Retouren, heute fällige Vorgänge und offene Retouren ohne Zuständigkeit samt nächstem Schritt. Tagesgrenzen richten sich nach der eingestellten Retouren-Zeitzone. Auswertungen zeigen die häufigsten Gründe, Erfassungen und dokumentierten Abschlüsse der letzten sechs Monate sowie die durchschnittliche Bearbeitungsdauer. Historische Abschlüsse ohne belegten Zeitpunkt werden gesondert ausgewiesen und nicht als heutige Abschlüsse gezählt.

**Rückgängig:** Nach einem einzelnen oder gemeinsamen Statuswechsel steht für bis zu zwölf Sekunden „Rückgängig“ bereit. Die Aktion gilt nur für den eigenen Statuswechsel, benötigt weiterhin die Statusberechtigung und wird abgelehnt, wenn ein Vorgang inzwischen geändert wurde. Der Verlauf bleibt nachvollziehbar.

**Scannen und Etiketten:** „Scannen“ findet Produkte und Retouren anhand einer EAN, Seriennummer oder Retourennummer. Formulare bieten Scanaktionen für EAN und Seriennummern. Kamera, Foto und manuelle Eingabe bzw. USB-Scanner werden unterstützt; die Kamera startet ausschließlich nach ausdrücklicher Auswahl. Kamerazugriff benötigt HTTPS oder localhost. Fotos und Kamerabilder werden lokal im Browser verarbeitet. Gedrehte Barcodes und mehrere Etiketten in einem Bild werden als auswählbare Treffer gelesen. Bei der Kamera wird nur der sichtbare Scanrahmen ausgewertet; zwei übereinstimmende Lesungen und deine Auswahl bestätigen einen Barcode. „Text aus Kamerabild lesen“ hält den Bildausschnitt für die Texterkennung fest. Aufgedruckte Seriennummern in Fotos und in PDF-Seiten ohne erkannten Seriennummerntext werden mit lokal gebündelter Tesseract.js-Texterkennung gelesen. Programm, Sprachmodelle (Deutsch/Englisch) und Verarbeitung bleiben auf deinem Server bzw. im Browser, ohne externe OCR-Dienste. Erkannte Texte immer vor der Übernahme prüfen; ähnliche Zeichen werden nicht automatisch ersetzt. Über „PDF auswählen“ lassen sich auch Seriennummern aus PDF-Etiketten einlesen. Erkannte Nummern erscheinen mit Seitenangabe in einer Auswahlliste. „Im Original prüfen“ zeigt Foto oder PDF-Seite; verlässlich zugeordnete Fundstellen werden hervorgehoben. Fotos können auf einen Ausschnitt begrenzt und erneut gelesen werden. Einzelne Formfelder übernehmen eine Nummer; die Scan-Erfassung kann mehrere ausdrücklich ausgewählte Nummern sammeln. PDF-Text wird direkt gelesen, Barcodes werden auch auf Seiten mit sonstigem Text zusätzlich gesucht. Die Verarbeitung bleibt lokal im Browser und ist auf 20 MiB sowie die ersten 20 Seiten begrenzt. Gespeicherte Retouren können mit Exportberechtigung ein Etikett mit Retourennummer, ursprünglicher Seriennummer, vorhandener Austauschseriennummer und QR-Code drucken. A4, 103 × 164 mm, 62 × 29 mm sowie das allgemeine Drucklayout stehen zur Auswahl. Der QR-Code enthält ausschließlich die Retourennummer; Produkt und Kundenreferenz lassen sich in der Druckvorschau ein-/ausblenden. Dies ist ein internes Geräteetikett, kein Versandlabel.

**Scan-Erfassung:** Der eigene Bereich `/#scan-intake` ist mit der Berechtigung zum Anlegen von Retouren erreichbar. Zuerst ein aktives Produkt und gemeinsame Angaben auswählen, anschließend einzelne Geräte scannen oder Seriennummern zeilenweise einfügen. Jede ausgewählte Seriennummer wird als eigene Retoure erfasst. Nummern werden nicht gekürzt; doppelte Listeneinträge werden zusammengeführt. Bereits vorhandene Retouren müssen bewusst als erneuter Rückläufer bestätigt werden. Vor dem Anlegen zeigt eine Bestätigung Produkt und Seriennummern. Erfolgreiche Einträge werden bei Wiederholungen ausgelassen; bei unklarer Serverantwort zuerst den Bestand prüfen. Die Liste bleibt beim Wechsel innerhalb der laufenden Oberfläche erhalten, bis sie ausdrücklich verworfen wird.

**Chat-Suche und Anheftungen:** Die Nachrichtensuche durchsucht auch ältere Nachrichten der gewählten Unterhaltung. Wichtige Nachrichten können entsprechend den bestehenden Schreib- und Moderationsrechten angeheftet werden. Private Unterhaltungen bleiben auf ihre Mitglieder beschränkt; gelöschte Nachrichten erscheinen weder in Suchtreffern noch in Anheftungen.

## CSV-Import und Export

Unter **Daten & Werkzeuge → CSV importieren** eine Datei hochladen oder Text einfügen. Bekannte deutsche und englische Spalten sowie Produkt- oder Retourenexporte werden automatisch erkannt. Danach **Vorschau prüfen → Importieren**. Eine manuelle Spaltenzuordnung ist nur bei eigenen, unbekannten Überschriften nötig. CSV-Vorlagen sind im Importdialog erhältlich.

| Import | Erforderliche Spalten |
| --- | --- |
| Produkte | Artikelnummer und Produktname |
| Retouren | Artikelnummer und Seriennummer; zusätzliche Pflichtfelder gemäß Retourenregeln |

- UTF-8; Komma, Semikolon oder Tabulator als Trennzeichen. Anführungszeichen und mehrzeilige Felder werden unterstützt.
- Höchstens 2 MB CSV-Text, 10.000 Datenzeilen und 50 Spalten.
- Preise in **EUR**, beispielsweise `29,95` oder `29.95`; Datum als `YYYY-MM-DD`.
- EAN und Seriennummer werden als Text behandelt. EAN darf leer sein oder 8, 12, 13 oder 14 Ziffern enthalten.
- Der Dateityp wird anhand der deutschen oder englischen Spaltenüberschriften automatisch erkannt. Bei eigenen Überschriften kann die Importart manuell gewählt und die Zuordnung angepasst werden. Ein ausgewähltes CSV-Profil legt die Importart fest.
- Fehlende Lieferanten, Hersteller, Kategorien, Retourengründe, Zustände, Status und Lösungen werden mit Stammdatenberechtigung beim bestätigten Import angelegt. Unveränderte Standardwerte werden auch unter ihren englischen Bezeichnungen erkannt. Ohne dieses Recht müssen die Stammdaten bereits vorhanden sein.
- Retouren können fehlende Produkte automatisch mit anlegen, wenn das Konto Produkte anlegen darf. Optionale Produktspalten sind Produktname, EAN, Hersteller, Kategorie, Produktpreis und Produktbeschreibung. Ohne Produktnamen wird die Artikelnummer verwendet; ohne Preis wird 0 EUR gespeichert. Jede Artikelnummer wird nur einmal angelegt. Fehlende Angaben werden aus weiteren Zeilen ergänzt; widersprüchliche Produktangaben führen zu einem Fehler. Bestehende und archivierte Produkte werden dabei nicht verändert oder reaktiviert.
- Die Vorschau zeigt sämtliche neuen Produkte und Stammdaten. Das automatische Anlegen lässt sich unter **Zuordnung & Importoptionen** ausschalten. Bei Fehlern wird nichts gespeichert.

Produkte werden über ihre Artikelnummer zugeordnet und standardmäßig aktualisiert, wenn das Konto das Bearbeitungsrecht besitzt; andernfalls werden vorhandene Produkte übersprungen. Bestehende Retourennummern werden beim CSV-Import standardmäßig übersprungen. Mit **Aktualisieren** lassen sich vorhandene Retouren über ihre Retourennummer ändern, einschließlich Status, Seriennummer und weiterer zugeordneter Felder. Dafür sind das Bearbeitungsrecht und bei Statusänderungen zusätzlich das Statusrecht erforderlich. Nicht zugeordnete Felder und vorhandene Produktbilder bleiben erhalten. Eine importierte Retourennummer muss eindeutig sein. Ohne diese Nummer wird eine neue vergeben; für wiederholbare Importe eigene eindeutige Retourennummern mitliefern. Retourenexporte enthalten auch den Produktnamen, damit sich fehlende Produkte beim Wiederimport zuordnen und anlegen lassen.

Ohne zugeordnete Lieferantenspalte wird bei Retouren ein aktiver Produktlieferant übernommen. Eine zugeordnete leere Zelle bedeutet „Keine Zuordnung“. Fehler verhindern den gesamten Import; vor dem Speichern werden alle Zeilen erneut geprüft und in einer Transaktion geschrieben.

CSV-Profile speichern Spaltenzuordnung, Importart, Trennzeichen und Dublettenstrategie. Beide Importarten erlauben Aktualisieren, Überspringen oder Fehler. Ein Profil für Retourenaktualisierungen kann Artikelnummer, Retourennummer und Status zuordnen; beim Anlegen neuer Retouren bleibt die Seriennummer erforderlich. Nach einer Profiländerung ist eine neue Vorschau nötig.

Normale CSV-Exporte enthalten den vollständigen Bestand einschließlich archivierter Produkte; **Auswahl exportieren** enthält nur die markierten Retouren. Zuständigkeiten und nächste Schritte werden ebenfalls übertragen. Konto-IDs müssen auf dem Zielsystem existieren; ein unbekanntes Konto wird beim Import als Fehler gemeldet. Formelverdächtige Zellen erhalten ein führendes Apostroph, das beim erneuten Import erhalten bleibt. Beim Öffnen in Excel Artikelnummern, EAN und Seriennummern ausdrücklich als Text behandeln.

**Produkte und Retouren gemeinsam übertragen:** Im Exportdialog lädt **Alles exportieren** eine `retourenboard-bestand.json` herunter. Die Datei enthält Produkte, eingebettete Produktbilder und Retourendaten einschließlich Produktzuordnung, Originalpreisen in EUR, Status, Seriennummern, Austauschseriennummern, Sendungsnummern, Kundenreferenzen und Erfasst-Zeitpunkten. Benötigte Stammdaten werden mitgeführt; neue Status behalten ihren Abschlusszustand und ihre Farbe. Archivierte Produkte und referenzierte Stammdaten bleiben archiviert. Bilder werden mit Dateinamen und Base64-Daten übertragen und beim Import wie ein normaler Bildupload geprüft.

Die JSON-Datei im normalen Importdialog auswählen. Sie wird automatisch als Gesamtbestand erkannt. Die Vorschau zählt Produkte und Retouren getrennt. Vorhandene Produkte und Retouren lassen sich aktualisieren, überspringen oder als Fehler melden. Die Zuordnung erfolgt über Artikelnummer und Retourennummer. Fehlende Bildfelder in älteren Dateien erhalten vorhandene Bilder; ausdrücklich `image: null` entfernt das Bild. Fehlende Stammdaten lassen sich mit entsprechender Berechtigung anlegen. Beide Importrechte und die jeweiligen Anlege- oder Bearbeitungsrechte sind erforderlich; Statusänderungen benötigen zusätzlich das Statusrecht. Der Gesamtexport benötigt beide Exportrechte. Es gelten maximal 32 MB JSON, 10.000 Produkt- und Retoureneinträge zusammen sowie 1.000 Produktbilder mit insgesamt 20 MB Bilddaten und höchstens 1 MB je Bild. Fehler verhindern den gesamten Import; die Vorschau verändert keine Bestandsdaten.

Der Gesamtexport überträgt Bestandsdaten und Produktbilder. Für Retouren-Dateianhänge, Kommentare, Konten und Einstellungen die vollständige Sicherung im Adminbereich verwenden.

## Produktbilder

Beim Anlegen und Bearbeiten eines Produkts lässt sich ein optionales Bild hochladen, ersetzen oder entfernen: PNG, JPG, JPEG oder WebP, maximal 1 MB pro Produkt. Die Vorschau erscheint im Formular, in Produktlisten und Details, bei zugehörigen Retouren und in der Produktsuche. Ohne Bild werden weiterhin die Anfangsbuchstaben angezeigt.

Bilder sind nur nach Anmeldung abrufbar. Hochladen und Entfernen verwenden die bestehenden Produktberechtigungen. Produktdaten und Bild werden gemeinsam gespeichert; vollständige Sicherungen und der Bestands-JSON-Export enthalten die Bilder. CSV-Dateien enthalten keine Bilddateien; CSV-Aktualisierungen erhalten vorhandene Produktbilder.

## Dateianhänge

In den Retourendetails Dateien auswählen und hochladen. Unterstützt werden **PDF, PNG, JPEG (`.jpg` / `.jpeg`) und WebP**. Dateiendung und Binärsignatur werden serverseitig geprüft. Bilder und PDFs haben eine integrierte Vorschau; PDFs lassen sich zusätzlich öffnen oder herunterladen. Die PDF-Vorschau verwendet lokal mitgeliefertes [Mozilla PDF.js](https://mozilla.github.io/pdf.js/) ohne externen Vorschaudienst.

Standardmäßig sind **10 Dateien pro Retoure mit jeweils 10 MiB** erlaubt. Administratoren können unter **Servereinstellungen** die Dateigröße auf 1–50 MiB und die Anzahl auf 1–30 setzen. Vorschau, Download, Upload und Löschen benötigen die jeweiligen Kontorechte. Beim Löschen einer Retoure werden ihre Anhänge entfernt; dafür sind gegebenenfalls zusätzliche Dateilöschrechte nötig.

Dateien liegen unter `attachments/` neben der SQLite-Datenbank. Datenbank und Anhänge immer gemeinsam sichern.

## Chat, Kommentare und Benachrichtigungen

Über **Dateien anhängen → Dateien senden** lassen sich PDF, PNG, JPG/JPEG und WebP im Chat senden. Mehrere ausgewählte Dateien werden nacheinander als einzelne Nachrichten hochgeladen; ein vorhandener Textentwurf bleibt erhalten. Bei einem fehlgeschlagenen Upload lassen sich die verbleibenden Dateien erneut senden. Die Dateigröße folgt der eingestellten Uploadgrenze (standardmäßig 10 MiB), pro Unterhaltung gelten höchstens 200 Dateien und insgesamt 250 MiB. Zugriff und Löschrechte folgen der jeweiligen Unterhaltung; auch Administratoren erhalten keinen zusätzlichen Zugriff auf private Chats. Beim Löschen der Dateinachricht wird der Anhang entfernt. Die Dateien liegen unter `chat-attachments/` neben der Datenbank und sind in vollständigen Sicherungen enthalten.

Der **Chat** bietet einen gemeinsamen Teamchat, Privatnachrichten und Gruppen. „Öffentlich“ bedeutet sichtbar für angemeldete Personen mit Chatrecht. Private Unterhaltungen sind auf ihre Teilnehmer beschränkt, geschlossene Gruppen auf ihre Mitglieder – auch in der Administrationsoberfläche. Neue Gruppenmitglieder sehen den bisherigen Verlauf. Öffentlichen Gruppen kann man beitreten und sie verlassen.

Kommentare in den Retourendetails halten Absprachen am Vorgang fest. `@Benutzername` oder **Person erwähnen** öffnet eine Auswahl und erzeugt einen persönlichen Hinweis unter **Nachrichten**. In privaten Unterhaltungen können nur Teilnehmer erwähnt werden. Eigene Texte lassen sich bearbeiten oder mit einem Löschhinweis entfernen; Moderation anderer Texte hat eigene Rechte.

Die persönliche Inbox enthält auch Hinweise zu neuen Retouren und überfälligen Vorgängen. Sicherungsfehler gehen an Administratoren. Gelesen-Zustände sind persönlich. SMTP-Versand ist optional und standardmäßig deaktiviert; die zentrale Konfiguration und ein Testversand liegen unter **Benachrichtigungen**. SMTP verwendet TLS beziehungsweise erforderliches STARTTLS mit Zertifikatsprüfung. Das SMTP-Passwort wird separat verschlüsselt gespeichert.

Chats liegen in derselben geschützten Datenbank und sind Teil der Sicherungen. Private Chats sind **nicht Ende-zu-Ende-verschlüsselt gegenüber dem Serverbetreiber**; dieser kann auf Datenbank und Backups zugreifen.

## Sprache, Darstellung und Währung

Die Oberfläche lässt sich auf der Loginseite und im Kopfbereich zwischen **Deutsch und Englisch** umschalten. Vorgegebene Gründe, Zustände, Status und Lösungen werden mitübersetzt. Eigene Bezeichnungen, umbenannte Standards, Produkte, Kommentare und CSV-Werte bleiben unverändert.

Hell- / Dunkelmodus folgt beim ersten Besuch der Systemeinstellung. Die persönliche Auswahl und reduzierte Bewegung lassen sich im Konto einstellen. Konto und Adminuntermenüs wechseln innerhalb der Anwendung, ohne einen vollständigen Seitenneustart. Die Systemeinstellung für reduzierte Bewegung wird berücksichtigt.

Interne Links verwenden passende Adressen: `/#overview` für die Übersicht, `/admin#settings` für Servereinstellungen, `/account` für das Konto und `/chat#channel-42` für eine Unterhaltung. Bereichswechsel, Zurück und Vorwärts bleiben in der geladenen Anwendung. Ältere Links wie `/admin#admin?section=settings`, `/admin.html` oder `/account.html` werden weiterhin unterstützt. Ungespeicherte Formulare bleiben geschützt.

Auswahllisten übernehmen in unterstützenden Browsern die Farben der Oberfläche mit abgerundeten Menüs, Auswahlhäkchen und Tastaturbedienung. Lange Texte werden im geschlossenen Feld gekürzt und in der Liste vollständig angezeigt. Andere Browser behalten die native Auswahl. Dezente Farben kennzeichnen offene Retouren, Prüfung, abgeschlossene Vorgänge und Produkte.

Im Kopfbereich kann jedes Konto die **Anzeigewährung EUR oder USD** wählen. Das Währungsmenü enthält Kurs, Datum und Quelle; **Board-Standard verwenden** setzt die eigene Auswahl zurück. Administratoren setzen den Standard unter **Servereinstellungen → Währung & Umrechnung**.

**Gespeicherte Preise, Preiseingabe und CSV bleiben in EUR.** Die USD-Anzeige rechnet mit dem EUR/USD-Referenzkurs der Europäischen Zentralbank über Frankfurter um. Der Server ruft nur den Kurs ab; Bestandsdaten und Beträge werden nicht an die Quelle gesendet. Ein gespeicherter älterer Kurs wird bei einer Störung mit Hinweis verwendet. Ohne verfügbaren Kurs bleiben Beträge als EUR ausgewiesen. Sprach- und Währungswahl sind unabhängig voneinander.

## Sicherungen und Wiederherstellung

Unter **Adminbereich → Sicherungen** können Administratoren manuelle TAR-Sicherungen erstellen, Archive herunterladen und Sicherungen wiederherstellen. Automatische Sicherungen sind zunächst täglich um **02:00 Uhr, Europe/Berlin**, mit sieben aufzubewahrenden automatischen Archiven aktiv. Rhythmus, Uhrzeit, Zeitzone und Aufbewahrung von 1–90 lassen sich ändern. Manuelle Archive werden nicht automatisch rotiert.

Ein Archiv enthält einen konsistenten SQLite-Snapshot, referenzierte Anhänge und ein Integritätsmanifest. Es kann im laufenden Betrieb erstellt werden. Archive liegen unter `backups/` neben der Datenbank und sind nur für Administratoren herunterladbar. Grenzen: 1 GiB je Datei und komprimiertem Archiv, 2 GiB entpackter Inhalt. Größere Bestände über das gestoppte Datenverzeichnis sichern.

### Wiederherstellen im Dashboard

1. Unter **Sicherungen → Wiederherstellen** ein vorhandenes Archiv auswählen oder `.tar.gz` hochladen.
2. Die Vorschau mit Datum, Version und Anzahl der Datensätze prüfen. Sie gilt 15 Minuten und ist an die aktuelle Sitzung gebunden.
3. Mit aktuellem Passwort, gegebenenfalls 2FA-/Recovery-Code und ausdrücklicher Bestätigung wiederherstellen.

Vor dem Austausch wird der aktuelle Bestand automatisch gesichert. Bestand, Konten und Anwendungseinstellungen werden ersetzt; alle Sitzungen enden. Die aktive Domain, HTTPS-Einstellung und der Port bleiben erhalten. Bei einem unterbrochenen Austausch unterstützt ein dauerhaftes Journal die Wiederherstellung des vorherigen Datenstands. SMTP danach neu konfigurieren.

### Schlüssel und zusätzliche Offline-Kopie

**`secrets/mfa.key` separat und geschützt sichern.** Dieser Schlüssel neben der Datenbank entschlüsselt die gespeicherten 2FA-Faktoren und ist bewusst nicht im herunterladbaren Archiv enthalten. Unter Linux liegt er unter `/var/lib/retourenverwaltung/secrets/mfa.key`. Ein passender Schlüssel kann bei der Wiederherstellung ergänzt werden. Ein verlorener Schlüssel schaltet 2FA nicht aus; Recovery-Codes oder Offline-Recovery bleiben nötig. SMTP-Passwort und SMTP-Schlüssel sind ebenfalls nicht Teil des herunterladbaren Archivs.

Für eine vollständige Offline-Kopie zuerst den Dienst stoppen. Das folgende Beispiel legt das Archiv mit restriktiven Rechten im root-Verzeichnis ab und startet den Dienst nur nach erfolgreicher Sicherung wieder:

```sh
sudo systemctl stop retourenboard
sudo sh -c 'umask 077; tar -czf "/root/retourenboard-data-$(date +%F-%H%M%S).tar.gz" -C /var/lib/retourenverwaltung . && systemctl start retourenboard'
```

Wenn `tar` fehlschlägt, den Fehler prüfen, bevor der Dienst wieder gestartet wird. Das gesamte Datenverzeichnis inklusive `attachments/`, `secrets/` und möglicher SQLite-WAL-Dateien sichern. `/etc/retourenverwaltung.env` ebenfalls separat geschützt sichern. Kopien außerhalb des Servers aufbewahren; Archive enthalten Geschäftsdaten, Konten, Passwort-Hashes und Chats.

### Archiv in einen leeren Ordner prüfen

```sh
cd /opt/retourenverwaltung/current
sudo /opt/retourenverwaltung/node/bin/node scripts/restore-backup.mjs \
  --archive /sicherer/ort/sicherung.tar.gz \
  --target /sicherer/ort/restore-test \
  --mfa-key /sicherer/ort/mfa.key
```

Dieses Werkzeug ist für die **integrierten Sicherungsarchive** vorgesehen, nicht für die vollständige Offline-Kopie aus dem vorigen Beispiel. Der Zielordner muss neu beziehungsweise leer sein. `--mfa-key` ist optional; ohne passenden Schlüssel bleiben aktive Faktoren erhalten und können Recovery-Codes benötigen. Das Werkzeug prüft Archivpfade, Dateitypen, Prüfsummen und SQLite-Integrität und überschreibt keinen vorhandenen Bestand. Vor einem manuellen Austausch den Dienst stoppen, Originaldaten sichern und die Eigentümer auf `retourenverwaltung:retourenverwaltung` setzen.

## Lokaler Start und Entwicklung

Benötigt **Node.js ab 22.16**, empfohlen **Node.js 24**. Ein vollständiges Release enthält den fertigen `dist/`-Build und gebündelte Laufzeitbibliotheken; zum Start sind weder Compiler noch `node_modules` nötig. Für Quellcodeänderungen werden die Entwicklungsabhängigkeiten aus der Lockdatei installiert.

Im Projektordner:

```sh
npm ci
npm run build
```

Konfiguration beim ersten Start kopieren:

```powershell
# Windows / PowerShell:
Copy-Item .env.example .env
```

```sh
# Linux / macOS:
cp .env.example .env
```

Eine vorhandene `.env` beim Aktualisieren behalten. Dann:

```sh
npm start
```

Die Anwendung ist standardmäßig unter **http://127.0.0.1:3000** erreichbar. Dort den ersten Administrator anlegen. Die lokalen Daten liegen standardmäßig in `data/retouren.sqlite` sowie benachbarten Ordnern für Anhänge, Sicherungen und Schlüssel. Für lokalen LAN-Zugriff in `.env` beispielsweise `HOST=0.0.0.0` setzen. Gespeicherte Netzwerkeinstellungen können den Port aus `.env` übersteuern.

Nach Quellcodeänderungen erneut `npm run build` ausführen und den laufenden Prozess neu starten. Ein fehlender, unvollständiger oder nicht zur Paketversion passender Build wird abgelehnt.

### Demo mit Beispieldaten

```sh
npm run preview
# Optional anderer Port:
npm run preview -- --port 3010
```

Standardadresse: **http://localhost:3002**. Testkonto: **`demo` / `RetourenboardDemo2026!`**. Die Vorschau enthält synthetische Produkte, Retouren und Teamgespräche und nutzt eine eigene temporäre Datenbank. Strg+C beendet die Vorschau und entfernt ihre Daten. Sie wird separat von der Hauptanwendung gestartet.

### Entwicklungsbefehle

| Befehl | Zweck |
| --- | --- |
| `npm start` | Anwendung mit `.env` und vorhandenem Build starten |
| `npm run build` | Server, Oberfläche und Produktwebseite bauen |
| `npm test` | Automatisierte Tests ausführen |
| `npm run preview` | Demo mit temporären Beispieldaten starten |
| `npm run website:build` | Nur die Produktwebseite bauen |
| `npm run website:preview` | Produktwebseite lokal auf Port 3020 ansehen |
| `npm run package` | Versionierte Linuxpakete, aktuelle Kopien und Prüfsummen erzeugen |

Die Tests enthalten API-, Berechtigungs-, CSV-, 2FA-, Sicherungs-, Update-, Oberflächen- und Installerprüfungen. Eine echte apt-/systemd-Installation, Docker-Ausführung oder HTTPS-Zertifikatseinrichtung muss zusätzlich in der jeweiligen Zielumgebung geprüft werden.

## Produktwebseite

Die separate Werbeseite stellt retourenboard. als Projekt zum Selbsthosten vor. Sie verwendet ausschließlich erfundene Vorschauinhalte und hat keinen Zugriff auf die Datenbank der Anwendung. Sie bietet Deutsch / Englisch, responsive Produktvorschauen und Animationen mit Unterstützung für reduzierte Bewegung.

```sh
npm run website:build
npm run website:preview
```

Lokal unter **http://127.0.0.1:3020** öffnen. Mit `npm run website:preview -- --port 3021` lässt sich der Port ändern.

Die Downloadbuttons ermitteln bei jedem normalen Klick den neuesten veröffentlichten GitHub-Release und laden den Installer beziehungsweise das TAR-Paket. Bei Fehlern oder ohne JavaScript führen sie zur neuesten Release-Seite. Die lokale Projektversion legt den Download nicht fest.

Die fertigen Dateien unter `website/dist/` können separat statisch gehostet werden. Der Linuxinstaller veröffentlicht die Werbeseite nicht automatisch. Betreiberangaben sowie Impressum und Datenschutz vor einer öffentlichen Veröffentlichung ergänzen. Vorschau, Sicherheitsheader und Veröffentlichungshinweise: [Produktwebseite](website/README.md).

## Docker

Die Release-Version **3.2.55** enthält bereits den fertigen `dist/`-Build und ein `Dockerfile` auf Basis von Node.js 24. Die mitgelieferte **`compose.yaml` baut das Image lokal** aus diesem Paket und benötigt weder `npm install` noch ein Registry-Login. Verzeichnisstruktur beim Start:

```text
retourenboard/
├── README.md
├── compose.yaml
├── Dockerfile
├── .dockerignore
├── .env.compose.example
├── dist/
├── scripts/
└── package.json
```

### Installation mit Docker Compose

Voraussetzungen: Docker Engine mit Docker-Compose-Plugin (`docker compose`), ein freier TCP-Port 3000 und der **vollständig entpackte** Release-Ordner. Im Ordner mit der `compose.yaml`:

```bash
# Optional: nur wenn du Port, Netzwerkschnittstelle oder HTTPS einstellen möchtest.
cp .env.compose.example .env

# Container aus dem enthaltenen Release bauen und starten.
docker compose up -d --build

# Status und Protokolle ansehen.
docker compose ps
docker compose logs --tail=100 -f retourenboard
```

Ohne `.env` ist die Weboberfläche **nur auf dem Docker-Host** unter **http://127.0.0.1:3000** erreichbar. Beim ersten Aufruf wird der erste Administrator angelegt. Die Container-Gesundheitsprüfung nutzt `GET /health` auf dem internen Port 3000. Das Image läuft als nichtprivilegierter Benutzer `node`.

Die Compose-Datei nutzt das benannte Volume **`retourenboard-data`** unter `/data`. Dort liegen `retouren.sqlite` einschließlich SQLite-WAL-Dateien sowie `attachments/`, `chat-attachments/`, `backups/`, `secrets/` und weitere zur Laufzeit angelegte Daten. Es ist kein separater Datenbankcontainer notwendig.

### LAN-Zugriff und Port ändern

Im Projektordner die Datei `.env` aus `.env.compose.example` erzeugen und beispielsweise Folgendes eintragen:

```dotenv
RB_BIND_IP=0.0.0.0
RB_PORT=3000
RB_NODE_ENV=development
RB_SECURE_COOKIES=false
```

Danach `docker compose up -d` ausführen und **http://SERVER-IP:3000** im LAN öffnen. `RB_PORT=3001` würde **nur den Host-Port** ändern (`http://SERVER-IP:3001`); der interne Container-Port muss **3000** bleiben. Diesen internen Port auch nicht über die Admin-Netzwerkeinstellungen der App ändern, da die Compose-Portzuordnung und der Healthcheck davon ausgehen. Bei LAN-Freigabe Firewall und Netzwerksegmentierung beachten. HTTP überträgt Anmeldedaten unverschlüsselt; es ist nur für ein vertrauenswürdiges LAN geeignet.

### HTTPS und Reverse Proxy

Für externen Zugriff **HTTPS** und einen Reverse Proxy (z. B. Nginx Proxy Manager, Traefik oder Pangolin) verwenden. Beispiel für `.env`:

```dotenv
RB_BIND_IP=127.0.0.1
RB_PORT=3000
RB_NODE_ENV=production
RB_SECURE_COOKIES=true
RB_PUBLIC_ORIGIN=https://retouren.example.com
RB_TRUSTED_PROXIES=
```

`RB_PUBLIC_ORIGIN` ist die echte öffentliche HTTPS-Adresse **ohne Pfad**. `RB_TRUSTED_PROXIES` enthält ausschließlich die IP-Adresse(n) tatsächlich eingesetzter Reverse-Proxys, wenn deren `X-Forwarded-For`-Header ausgewertet werden sollen. Ohne vertrauenswürdigen Proxy ist der Wert leer. Für einen Proxy in einem **anderen Docker-Container** ist `127.0.0.1` des Proxycontainers nicht der Anwendungscontainer: dort einen gemeinsamen Docker-Netzwerkzugang mit dem Dienst `retourenboard:3000` herstellen oder den Host-Port bewusst für diesen Proxy freigeben. **Keinen ungeschützten Port ins Internet weiterleiten.**

Die Konfiguration ist auf einen bereits eingerichteten HTTPS-Reverse-Proxy ausgelegt; sie stellt selbst kein TLS-Zertifikat aus. Weitere Informationen zu Weiterleitungsheadern stehen unter [Domain, Reverse Proxy und HTTPS](#domain-reverse-proxy-und-https). Nach Änderungen:

```bash
docker compose up -d
```

### Updates

Um **diese Paketversion** neu zu bauen:

```bash
docker compose up -d --build
```

Für eine **neuere Version** das neue vollständige Release-Paket in einen neuen Ordner entpacken, dort die Compose-Konfiguration übernehmen und `docker compose up -d --build` ausführen. Der feste Docker-Volume-Name `retourenboard-data` sorgt dafür, dass die bestehenden Anwendungsdaten erhalten bleiben, selbst wenn sich der Paketordner ändert. Vor einem Versionswechsel eine vollständige Sicherung erstellen und nicht zwei Retourenboard-Instanzen gleichzeitig mit demselben Volume starten. Die Image-Version in `compose.yaml` (`retourenboard:3.2.55`) sollte beim Versionswechsel ebenfalls angepasst werden.

Alternativ gibt es das veröffentlichte Registry-Image `ghcr.io/katerberatung/retourenboard:latest` (amd64 / arm64). Dafür in `compose.yaml` den `build:`-Abschnitt entfernen und `image:` auf das gewünschte Registry-Tag setzen; danach `docker compose pull && docker compose up -d`. `latest` kann eine andere Version als dieses Paket enthalten. **In-App-Updates mit systemd-Updater sind kein Ersatz für ein Docker-Image-Update.**

### Sicherungen

Im Dashboard unter **Adminbereich → Sicherungen** konsistente TAR-Backups erstellen und herunterladen. Zusätzlich sollte regelmäßig eine *vollständige Offline-Kopie des Volumes* angelegt werden, weil z. B. `secrets/mfa.key` **nicht** Teil eines herunterladbaren App-Backups ist. Container vorher stoppen, um eine konsistente SQLite-Kopie zu erhalten:

```bash
docker compose stop retourenboard
mkdir -p ./retourenboard-sicherung
docker compose cp retourenboard:/data/. ./retourenboard-sicherung/
docker compose start retourenboard
```

Die Offline-Kopie muss sicher und außerhalb des Dockerhosts aufbewahrt werden; sie enthält sensible Geschäfts- und Zugangsdaten. Prüfe nach der Sicherung, dass der Container wieder läuft. Dateien im Volume nie gleichzeitig über mehrere Instanzen beschreiben lassen. **`docker compose down -v` oder `docker volume rm retourenboard-data` löschen die gespeicherten Daten**. Dagegen entfernt `docker compose down` alleine das Volume nicht.

### Fehlerbehebung

| Problem | Prüfung |
| --- | --- |
| Seite nicht erreichbar | `docker compose ps`, `docker compose logs --tail=100 retourenboard`, Host-Port, Firewall und `RB_BIND_IP` prüfen |
| Container `unhealthy` | `docker compose logs` und interne Port-Einstellung (3000) kontrollieren |
| Port 3000 belegt | In `.env` z. B. `RB_PORT=3001` setzen, anschließend `docker compose up -d` |
| Login/Origin hinter HTTPS fehlerhaft | `RB_PUBLIC_ORIGIN`, `RB_SECURE_COOKIES`, tatsächliche HTTPS-Adresse und vertrauenswürdige Proxys prüfen |
| Daten nach Neuinstallation fehlen | Prüfen, ob wirklich dasselbe Docker-Volume `retourenboard-data` verwendet wird; keine leere zweite Instanz initialisieren |

Weitere Hinweise stehen unter [Fehlerbehebung](#fehlerbehebung).

## Projektstruktur und Releasepakete

| Pfad | Inhalt |
| --- | --- |
| `backend/src/` | Maßgebliche Serverquellen und gemeinsame Datenlogik |
| `frontend/src/`, `frontend/assets/` | Browserquellen, HTML und Stylesheets |
| `dist/` | Kompilierte Anwendung und gebündelte Serverbibliotheken |
| `compose.yaml`, `Dockerfile`, `.env.compose.example`, `.dockerignore` | Docker-Compose-Installation und lokale Image-Build-Konfiguration |
| `website/` | Separate Produktwebseite und ihre Dokumentation |
| `previews/design/` | Zusatzdateien für die Demo |
| `scripts/`, `deploy/` | Build, Installation, Start, Recovery und systemd-Vorlagen |
| `tests/` | Automatisierte Prüfungen |
| `docs/` | Weitere Dokumentation |
| `server/`, `shared/`, `public/` | Kompatibilitätseinstiege und mitgelieferte Assets; Anwendung verwendet den Build |
| `data/` | Lokale Laufzeitdaten; kein Bestandteil der Pakete |
| `releases/<Version>/` | Installer und TAR einer bestimmten Version mit SHA256-Dateien |
| `releases/latest/` | Aktuelle Pakete mit gleichbleibenden Dateinamen |
| `releases/release-manifest.json` | Paketversion, relative Pfade und Prüfsummen |

`npm run package` erzeugt aus dem vorhandenen aktuellen Build:

- `releases/<Version>/retourenboard-install-<Version>.sh` als kleines Downloadskript und `.sha256`
- `releases/<Version>/retourenboard-linux-<Version>.tar.gz` und `.sha256`
- `releases/latest/retourenboard-install.sh` und `.sha256`
- `releases/latest/retourenboard-linux.tar.gz` und `.sha256`
- das gemeinsame Release-Manifest

Für ein GitHub-Release das TAR und seine passende `.sha256`-Datei zusammen mit dem kleinen Installer veröffentlichen. Der Versionsname des Installers bezeichnet seinen lokalen Build; welche Anwendung er installiert, bestimmt bei jedem Lauf das neueste veröffentlichte GitHub-Release.

Alte versionierte Pakete bleiben erhalten. Private Laufzeitdaten, `.env`, Datenbanken und `node_modules` werden nicht eingepackt. `package.json` ist die Versionsquelle; Lockdatei, Build und Pakete müssen dazu passen. Die Version erscheint auf der Loginseite, im Dashboard und in `/api/session`.

Gemäß [Projektregeln](AGENTS.md) steigt die Patchnummer einmal je abgeschlossenem Änderungsauftrag um **0.0.1**, einschließlich Dokumentationsänderungen. GitHub wird nur auf ausdrücklichen Auftrag aktualisiert; lokales Bauen oder Paketieren veröffentlicht nichts.

Weitere Hinweise: [Oberfläche](frontend/README.md), [Demo](previews/design/README.md), [In-App-Updates](docs/IN-APP-UPDATES.md).

## Projekt unterstützen

Wenn dir retourenboard. hilft, kannst du die Weiterentwicklung über [Ko-fi unterstützen](https://ko-fi.com/katerberatung). Der Link ist auch in der Anwendung und auf der Produktwebseite erreichbar.

## Fehlerbehebung

### Die Container-IP ist nicht erreichbar

Dienststatus und Logs prüfen. Sicherstellen, dass `HOST=0.0.0.0`, der tatsächlich aktive Port und die Firewall zusammenpassen. Der Installer nennt die erkannte Container-IP; `0.0.0.0` ist eine Bind-Adresse, keine Browseradresse. Eine bestehende Installation lässt sich mit `sudo bash retourenboard-install.sh --lan` auf LAN-Bindung umstellen. Im Adminbereich gespeicherte Ports haben Vorrang vor der env-Datei.

### „Diese Anfrage ist nicht erlaubt“ hinter dem Reverse Proxy

Die öffentliche Adresse muss exakt stimmen. Unter **Servereinstellungen** Domain, Protokoll und gegebenenfalls externen Port korrigieren, speichern und neu starten. Der Proxy muss `Host` und `X-Forwarded-Proto` passend weiterleiten; `TRUSTED_PROXIES` auf die eigenen Proxy-IP-Adressen setzen. Der lokale LAN-Zugang oder ein SSH-Tunnel kann zur Korrektur dienen.

Falls kein Adminzugang gelingt, die env-Datei korrigieren und ausschließlich die gespeicherten Netzwerkeinstellungen zurücksetzen:

```sh
sudo systemctl stop retourenboard
sudo -u retourenverwaltung env DB_PATH=/var/lib/retourenverwaltung/retouren.sqlite \
  /opt/retourenverwaltung/node/bin/node \
  /opt/retourenverwaltung/current/dist/server/reset-settings.js
sudo systemctl start retourenboard
```

Konten, Produkte, Retouren und andere Einstellungen bleiben erhalten. Danach gelten Domain und Port aus `/etc/retourenverwaltung.env`; den Proxy entsprechend abstimmen.

### Build fehlt / Versionen stimmen nicht überein

Im Quellprojekt `npm ci` und `npm run build` ausführen. Für Linux ein vollständiges Releasepaket verwenden. Ein einzelner kopierter Quellordner ersetzt keinen Build. Beim Aktualisieren das neue Paket vollständig installieren und den laufenden Prozess neu starten.

### Port ist bereits belegt

Den bestehenden Prozess prüfen oder einen anderen Vorschauport wählen, etwa `npm run preview -- --port 3010`. Für die Hauptanwendung den Port in den Servereinstellungen ändern; bei noch nicht eingerichteter Anwendung in `.env`. Demo, Hauptanwendung und Produktwebseite sind separate Prozesse.

### 2FA-Zugang verloren

Zuerst einen noch gültigen Recovery-Code verwenden oder einen anderen Administrator um einen Faktorreset bitten. Für Offline-Recovery den Dienst stoppen und mit einem neuen Sicherungspfad in einem vorhandenen geschützten Verzeichnis ausführen:

```sh
sudo systemctl stop retourenboard
cd /opt/retourenverwaltung/current
sudo /opt/retourenverwaltung/node/bin/node scripts/recover-account.mjs \
  --db /var/lib/retourenverwaltung/retouren.sqlite --username Max \
  --backup /sicherer/ort/vor-2fa-reset.sqlite --service-stopped --confirm
sudo systemctl start retourenboard
```

Das Werkzeug erstellt zuerst eine Datenbanksicherung, entfernt kein Passwort und erzwingt nach der Passwortanmeldung eine neue 2FA-Einrichtung.

### Update oder Wiederherstellung wurde unterbrochen

Die Logs beider Dienste prüfen und die [Wiederanlaufhinweise](docs/IN-APP-UPDATES.md) beachten. Wartungsmarker, Journale und private Offline-Kopien nicht vor einer geprüften Wiederherstellung entfernen.
