#!/usr/bin/env bash
# Pause the helper before a manual installer touches the application release.
pause_in_app_updater() {
  local data_dir="$1" state_dir="$2" node="${3:-$(command -v node || true)}" candidate
  updater_was_active=false
  if systemctl is-active --quiet retourenboard-updater.service; then
    systemctl stop retourenboard-updater.service || return 1
    updater_was_active=true
  fi
  # The root-owned installer journal is reconciled by managed-install.mjs before
  # any new release is activated. It may own the maintenance marker itself.
  if [[ -z "$node" ]]; then
    for candidate in /opt/retourenboard/node/bin/node /opt/retourenverwaltung/node/bin/node; do
      if [[ -x "$candidate" ]]; then node="$candidate"; break; fi
    done
  fi
  if [[ -n "$node" && -f "$state_dir/install-transaction.json" && ! -L "$state_dir/install-transaction.json" ]]; then
    if "$node" "$(dirname -- "${BASH_SOURCE[0]}")/install-maintenance.mjs" "$data_dir" "$state_dir"; then return 0; fi
  fi
  if [[ -e "$data_dir/.update-maintenance" || -e "$state_dir/transaction.json" ]]; then
    systemctl start retourenboard-updater.service || true
    echo 'Ein In-App-Update wurde unterbrochen oder benötigt Wiederherstellung. Der Updater wurde zum Wiederanlauf gestartet; Installation später erneut versuchen.' >&2
    return 1
  fi
}
