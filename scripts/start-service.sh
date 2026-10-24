#!/usr/bin/env bash

prepare_application_service() {
  local service_unit="$1" legacy_unit="$2" previous_unit="$3"
  # Preserve the matching entry point for a failed install's version rollback.
  if [[ -f "$service_unit" ]]; then cp -L -- "$service_unit" "$previous_unit" || return 1
  elif [[ -f "$legacy_unit" ]]; then cp -L -- "$legacy_unit" "$previous_unit" || return 1; fi
  if systemctl is-active --quiet retourenboard.service; then systemctl stop retourenboard.service || return 1; fi
  if [[ -e "$legacy_unit" || -L "$legacy_unit" ]]; then
    if [[ "$(readlink -f -- "$legacy_unit")" != "$(readlink -f -- "$service_unit")" ]]; then
      if systemctl is-active --quiet retourenverwaltung.service; then systemctl stop retourenverwaltung.service || return 1; fi
      systemctl disable retourenverwaltung.service || return 1
    fi
  fi
}

install_application_service() {
  local rendered_unit="$1" service_unit="$2" legacy_unit="$3"
  install -m 644 -- "$rendered_unit" "$service_unit" || return 1
  # Older release recovery tools can continue using the original fixed name.
  ln -sfn -- "$service_unit" "$legacy_unit" || return 1
}

start_service_or_restore() {
  local service="$1" app_dir="$2" old_release="$3" old_runtime="$4"
  local old_unit="${5:-}" service_unit="${6:-/etc/systemd/system/$1}"
  if systemctl restart "$service"; then
    sleep 2
    if systemctl is-active --quiet "$service"; then return 0; fi
  fi
  if [[ -n "$old_release" && -n "$old_runtime" ]]; then
    ln -sfn -- "$old_release" "$app_dir/current" || return 1
    ln -sfn -- "$old_runtime" "$app_dir/node" || return 1
    if [[ -n "$old_unit" ]]; then
      install -m 644 -- "$old_unit" "$service_unit" || return 1
      systemctl daemon-reload || return 1
    fi
    if systemctl restart "$service"; then
      sleep 2
      if systemctl is-active --quiet "$service"; then echo 'Die vorherige Programmversion wurde wieder aktiviert.' >&2;
      else echo 'Vorherige Version wiederhergestellt, aber Dienst nicht aktiv. Bitte Logs prüfen.' >&2; fi
    else echo 'Vorherige Version wiederhergestellt, aber Dienststart fehlgeschlagen. Bitte Logs prüfen.' >&2; fi
  fi
  journalctl -u "$service" -n 20 --no-pager >&2 || true
  return 1
}
