#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo 'Updaterinstallation benötigt root.' >&2; exit 1; }
lib_dir=/usr/local/lib/retourenboard-updater
state_dir=/var/lib/retourenboard-updater
unit=retourenboard-updater.service
[[ ! -L "$lib_dir" && ! -L "$state_dir" ]] || { echo 'Ungültiger Updaterordner.' >&2; exit 1; }
if systemctl is-active --quiet "$unit"; then systemctl stop "$unit"; fi
install -d -m 755 -o root -g root "$lib_dir" "$lib_dir/server" "$lib_dir/vendor" "$lib_dir/server/database" "$lib_dir/shared"
install -d -m 700 -o root -g root "$state_dir"
for module in updater-entry update-linux update-worker update-download update-package version-check service-control service-control-routes server-log; do
  install -m 644 -o root -g root "$source_dir/dist/server/$module.js" "$lib_dir/server/$module.js"
done
install -m 644 -o root -g root "$source_dir/dist/vendor/archive.js" "$lib_dir/vendor/archive.js"
install -m 644 -o root -g root "$source_dir/dist/vendor/postgres.js" "$lib_dir/vendor/postgres.js"
cp -a -- "$source_dir/dist/server/database/." "$lib_dir/server/database/"
cp -a -- "$source_dir/dist/shared/." "$lib_dir/shared/"
chown -R root:root "$lib_dir/server/database" "$lib_dir/shared"
install -m 644 -o root -g root "$source_dir/dist/package.json" "$lib_dir/package.json"
install -d -m 755 -o root -g root "$lib_dir/vendor/licenses"
cp -a -- "$source_dir/dist/vendor/licenses/." "$lib_dir/vendor/licenses/"
chown -R root:root "$lib_dir/vendor/licenses"
sed 's/\r$//' "$source_dir/deploy/$unit" > "$lib_dir/$unit"
install -m 644 -o root -g root "$lib_dir/$unit" "/etc/systemd/system/$unit"
systemctl daemon-reload
systemctl enable --now "$unit"
sleep 1
systemctl is-active --quiet "$unit" || { journalctl -u "$unit" -n 20 --no-pager >&2; exit 1; }
echo 'In-App-Updater eingerichtet. Unter Version & Updates verfügbar.'
