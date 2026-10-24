#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

usage() {
  cat <<'HELP'
retourenboard. unter Ubuntu/Debian installieren oder aktualisieren:
  sudo bash scripts/install-linux.sh
  sudo bash scripts/install-linux.sh --lan
  sudo bash scripts/install-linux.sh --local
  sudo bash scripts/install-linux.sh --domain retouren.example.com
  sudo bash scripts/install-linux.sh --domain retouren.example.com --lan
  sudo bash scripts/install-linux.sh --database local
  sudo bash scripts/install-linux.sh --database external --database-url-file /root/database-url
  bash scripts/install-linux.sh --dry-run
  bash scripts/install-linux.sh --test --lan
  bash scripts/install-linux.sh --test --port 3002 --once

Standard: direkt über http://CONTAINER-IP:3000 erreichbar (HOST=0.0.0.0).
Die erkannte Container-/Server-IP und der aktive Port werden am Ende ausgegeben.
Mit --local: nur localhost; optional SSH-Tunnel für den Zugriff vom eigenen Rechner.
Mit --lan: Container-Zugriff ausdrücklich setzen, auch bei bestehenden Bind-Adressen.
Mit --domain: HTTPS-Domain plus direkter HTTP-Zugang über die private Container-IP.
DNS, HTTPS-Zertifikat und Reverse Proxy werden separat eingerichtet.
Updates erhalten Daten, Konten, Domain und Port. Eine alte localhost-Bindung wird
standardmäßig auf Container-Zugriff umgestellt; --local behält localhost bei.
--dry-run / --check: Paket und geplante Einstellungen ohne Installation prüfen.
--test: temporäre Testdatenbank auf Port 3001; Strg+C entfernt alle Testdaten.
--port: Testport oder Port einer neuen Installation wählen (1024–65535).
--once: Testserver einmal prüfen und automatisch wieder beenden.
Test und Probelauf benötigen weder root noch einen systemd-Dienst.
PostgreSQL wird lokal eingerichtet oder über eine private Verbindungsdatei genutzt.
SQLite-Altbestände werden bei gestopptem Dienst geprüft und übernommen.
HELP
}

source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
source "$source_dir/scripts/install-options.sh"
if parse_install_options "$@"; then :; else status=$?; [[ $status -eq 2 ]] && exit 0; exit "$status"; fi
select_app_layout "$source_dir"
source "$source_dir/scripts/install-network.sh"
if [[ "$mode" == check ]]; then print_install_plan "$source_dir"; exit 0; fi
if [[ "$mode" == test ]]; then source "$source_dir/scripts/test-linux.sh"; run_test_app "$source_dir"; exit 0; fi
[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo 'Bitte mit sudo ausführen.' >&2; exit 1; }
[[ $(uname -s) == Linux && -f /etc/debian_version ]] || { echo 'Unterstützt werden Ubuntu/Debian mit systemd.' >&2; exit 1; }
command -v systemctl >/dev/null && [[ -d /run/systemd/system ]] || { echo 'Ein laufendes systemd ist erforderlich.' >&2; exit 1; }
case "$(uname -m)" in
  x86_64) arch=x64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) echo 'Unterstützt werden x86_64 und ARM64.' >&2; exit 1 ;;
esac

source "$source_dir/scripts/start-service.sh"
app_dir=/opt/retourenboard
data_dir=/var/lib/retourenboard
config=/etc/retourenboard.env
# Use an existing legacy runtime until the stopped installation is moved below.
[[ ! -d /opt/retourenverwaltung || -L /opt/retourenverwaltung ]] || app_dir=/opt/retourenverwaltung
[[ ! -d /var/lib/retourenverwaltung || -L /var/lib/retourenverwaltung ]] || data_dir=/var/lib/retourenverwaltung
[[ ! -f /etc/retourenverwaltung.env || -L /etc/retourenverwaltung.env ]] || config=/etc/retourenverwaltung.env
service=retourenboard.service
state_dir=/var/lib/retourenboard-updater
if [[ -e "$state_dir" ]]; then
  [[ -d "$state_dir" && ! -L "$state_dir" && "$(stat -c '%u:%a' "$state_dir")" == '0:700' ]] || { echo 'Installerstatus benötigt einen privaten Rootordner.' >&2; exit 1; }
fi
install -d -m 700 -o root -g root "$state_dir"
exec 9>"$state_dir/install.lock"
flock -n 9 || { echo 'Eine weitere Installation läuft bereits.' >&2; exit 1; }
source "$source_dir/scripts/install-updater-guard.sh"
pause_in_app_updater "$data_dir" /var/lib/retourenboard-updater
temp_dir="$(mktemp -d)"
had_postgresql=false; managed_transaction_started=false; configuration_prepared=false
if [[ -f "$config" ]]; then cp -- "$config" "$temp_dir/previous.env"; if grep -Eq '^DATABASE_URL(_FILE)?=' "$config"; then had_postgresql=true; fi; fi
trap 'rm -rf -- "$temp_dir"; if [[ "$updater_was_active" == true ]]; then if [[ "$had_postgresql" == true ]] || ! grep -Eq "^DATABASE_URL(_FILE)?=" "$config" 2>/dev/null; then systemctl start retourenboard-updater.service || true; fi; fi' EXIT
installer_failed() {
  if [[ "$managed_transaction_started" == false && "$configuration_prepared" == true ]]; then
    if [[ -f "$temp_dir/previous.env" ]]; then install -m 600 "$temp_dir/previous.env" "$config"; else rm -f -- "$config"; fi
  fi
  echo 'Installation fehlgeschlagen. Daten und privates Installationsjournal bleiben erhalten. Vorhandene SQLite-Dateien nicht entfernen; nach einem bestätigten PostgreSQL-Wechsel keine alte SQLite-Version starten.' >&2
}
trap installer_failed ERR

echo '[1/6] Voraussetzungen installieren …'
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl xz-utils tar
echo '[2/6] Offizielle Node.js-24-Laufzeit laden und Prüfsumme prüfen …'
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt' -o "$temp_dir/SHASUMS256.txt"
archive="$(awk -v arch="$arch" '$2 ~ ("^node-v24\\.[0-9]+\\.[0-9]+-linux-" arch "\\.tar\\.xz$") {print $2; exit}' "$temp_dir/SHASUMS256.txt")"
[[ "$archive" =~ ^node-v24\.[0-9]+\.[0-9]+-linux-(x64|arm64)\.tar\.xz$ ]] || { echo 'Kein passendes offizielles Node.js-Paket gefunden.' >&2; exit 1; }
runtime_dir="$app_dir/${archive%.tar.xz}"
install -d -m 755 "$app_dir" "$app_dir/releases"
if [[ ! -x "$runtime_dir/bin/node" ]]; then
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "https://nodejs.org/dist/latest-v24.x/$archive" -o "$temp_dir/$archive"
  awk -v file="$archive" '$2 == file {print}' "$temp_dir/SHASUMS256.txt" > "$temp_dir/checksum"
  (cd "$temp_dir" && sha256sum --check checksum)
  # Extract a verified official archive into a fresh staging directory.
  install -d -m 755 "$temp_dir/runtime"
  tar -xJf "$temp_dir/$archive" -C "$temp_dir/runtime" --strip-components=1
  "$temp_dir/runtime/bin/node" -e "if(Number(process.versions.node.split('.')[0])!==24)process.exit(1);require('node:sqlite');"
  [[ ! -e "$runtime_dir" ]] || { echo "Unvollständige Laufzeit bereits vorhanden: $runtime_dir" >&2; exit 1; }
  mv -- "$temp_dir/runtime" "$runtime_dir"
  chmod -R a+rX "$runtime_dir"
fi

echo 'Installationspfade prüfen und bestehende Installation bei gestopptem Dienst umstellen …'
if systemctl cat retourenboard.service >/dev/null 2>&1; then systemctl stop retourenboard.service;
elif systemctl cat retourenverwaltung.service >/dev/null 2>&1; then systemctl stop retourenverwaltung.service; fi
"$runtime_dir/bin/node" "$source_dir/scripts/install-paths.mjs"
runtime_dir="/opt/retourenboard/${archive%.tar.xz}"
app_dir=/opt/retourenboard
data_dir=/var/lib/retourenboard
config=/etc/retourenboard.env
systemctl daemon-reload
if [[ -f "$config" ]]; then cp -- "$config" "$temp_dir/previous.env"; fi
configuration_prepared=true

echo '[3/6] Dienstbenutzer und Datenverzeichnis einrichten …'
if ! id retourenverwaltung >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "$data_dir" --shell /usr/sbin/nologin retourenverwaltung
fi
install -d -m 700 -o retourenverwaltung -g retourenverwaltung "$data_dir"
if [[ ! -e "$config" ]]; then
  {
    bind_host=127.0.0.1
    if [[ "$lan" == true ]]; then bind_host=0.0.0.0; fi
    printf 'HOST=%s\nPORT=%s\nDB_PATH=/var/lib/retourenboard/retouren.sqlite\n' "$bind_host" "${port:-3000}"
    if [[ -n "$domain" ]]; then printf 'PUBLIC_ORIGIN=https://%s\nSECURE_COOKIES=true\nNODE_ENV=production\nTRUSTED_PROXIES=127.0.0.1,::1\n' "$domain";
    else printf 'PUBLIC_ORIGIN=\nSECURE_COOKIES=false\nNODE_ENV=development\n'; fi
  } > "$config"
else
  apply_install_binding "$config" "$lan" "${binding_set:-false}" "${runtime_dir:+$runtime_dir/bin/node}"
  echo 'Update: vorhandene Konten, Daten und Servereinstellungen bleiben erhalten.'
  if [[ -n "$domain" ]]; then echo 'Eine neue Domain ggf. in /etc/retourenboard.env eintragen.'; fi
fi
# Vorhandene Werte bleiben als Konfiguration für einen möglichen Versionsrückfall
# erhalten. Die neue Anwendung ignoriert das frühere SHARED_PASSWORD vollständig.
chown root:root "$config"
chmod 600 "$config"
source "$source_dir/scripts/install-postgres.sh"
configure_install_database "$source_dir" "$runtime_dir/bin/node" "$config" "$data_dir"

echo '[4/6] Anwendung bereitstellen …'
release_dir="$(mktemp -d "$app_dir/releases/$(date +%Y%m%d-%H%M%S)-XXXXXX")"
for dir in "${runtime_dirs[@]}"; do cp -a -- "$source_dir/$dir" "$release_dir/"; done
cp -- "$source_dir/package.json" "$source_dir/README.md" "$source_dir/.env.example" "$release_dir/"
chown -R root:root "$release_dir"
chmod -R u=rwX,go=rX "$release_dir"
"$runtime_dir/bin/node" --check "$release_dir/$app_entry"
"$runtime_dir/bin/node" --check "$release_dir/${app_entry%index.js}app.js"

echo '[5/6] Dienst installieren und starten …'
old_release="$(readlink "$app_dir/current" || true)"
old_runtime="$(readlink "$app_dir/node" || true)"
service_unit="/etc/systemd/system/$service"
legacy_unit=/etc/systemd/system/retourenverwaltung.service
old_unit=''
prepare_application_service "$service_unit" "$legacy_unit" "$temp_dir/previous.service"
if [[ -f "$temp_dir/previous.service" ]]; then old_unit="$temp_dir/previous.service"; fi
# Normalize Windows line endings before matching the entry at the line end.
sed -e 's/\r$//' -e "s| server/index.js$| $app_entry|" "$source_dir/deploy/retourenboard.service" > "$temp_dir/new.service"
binding_mode=auto
if [[ "$binding_set" == true ]]; then binding_mode=local; [[ "$lan" == true ]] && binding_mode=lan; fi
managed_args=(--release "$release_dir" --runtime "$runtime_dir" --unit "$temp_dir/new.service" --binding "$binding_mode")
ln -sfn -- "$service_unit" "$legacy_unit"
[[ ! -f "$temp_dir/previous.env" ]] || managed_args+=(--previous-config "$temp_dir/previous.env")
[[ -z "$old_unit" ]] || managed_args+=(--previous-unit "$old_unit")
"$runtime_dir/bin/node" --check "$source_dir/scripts/managed-install.mjs"
managed_transaction_started=true
"$runtime_dir/bin/node" --env-file="$config" "$source_dir/scripts/managed-install.mjs" "${managed_args[@]}"
ln -sfn -- "$service_unit" "$legacy_unit"
bash "$source_dir/scripts/install-updater.sh"
echo '[6/6] Installation abgeschlossen.'
echo 'Beim ersten Browseraufruf den Administrator anlegen, bevor die Seite öffentlich freigegeben wird.'
printf '\nKonfiguration: %s\nDatenbank: PostgreSQL\nDateien und Schlüssel: %s\n' "$config" "$data_dir"
echo 'Status: sudo systemctl status retourenboard'
echo 'Logs:   sudo journalctl -u retourenboard -f'
echo 'Updater: sudo systemctl status retourenboard-updater'
print_install_access "$config" "$app_dir"
