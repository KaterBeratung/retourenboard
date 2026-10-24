#!/usr/bin/env bash

parse_install_options() {
  mode=install; domain=''; lan=true; binding_set=false; port=3000; port_set=false; once=false
  database_mode=auto; database_url_file=''; database_ca_file=''
  while (($#)); do
    case "$1" in
      --help|-h) usage; return 2 ;;
      --test) [[ "$mode" == install || "$mode" == test ]] || { echo '--test und --dry-run nicht kombinieren.' >&2; return 1; }; mode=test; shift ;;
      --dry-run|--check) [[ "$mode" == install || "$mode" == check ]] || { echo '--test und --dry-run nicht kombinieren.' >&2; return 1; }; mode=check; shift ;;
      --once) once=true; shift ;;
      --database) [[ $# -ge 2 && ( "$2" == local || "$2" == external ) ]] || { echo '--database benötigt local oder external.' >&2; return 1; }; database_mode="$2"; shift 2 ;;
      --database-url-file) [[ $# -ge 2 && "$2" != --* ]] || { echo 'Private Verbindungsdatei fehlt.' >&2; return 1; }; database_url_file="$2"; shift 2 ;;
      --database-ca-file) [[ $# -ge 2 && "$2" != --* ]] || { echo 'CA-Datei fehlt.' >&2; return 1; }; database_ca_file="$2"; shift 2 ;;
      --domain) [[ $# -ge 2 && "$2" != --* ]] || { echo 'Domain fehlt.' >&2; return 1; }; domain="$2"; shift 2 ;;
      --port) [[ $# -ge 2 && "$2" =~ ^[0-9]{1,5}$ ]] || { echo 'Bitte einen Port zwischen 1024 und 65535 angeben.' >&2; return 1; }; port=$((10#$2)); port_set=true; shift 2 ;;
      --lan|--local)
        local requested_lan=true; [[ "$1" == --local ]] && requested_lan=false
        if [[ "$binding_set" == true && "$lan" != "$requested_lan" ]]; then echo '--lan und --local nicht kombinieren.' >&2; return 1; fi
        lan="$requested_lan"; binding_set=true; shift ;;
      *) echo "Unbekannte Option: $1" >&2; return 1 ;;
    esac
  done
  if [[ "$mode" == test && "$port_set" == false ]]; then port=3001; fi
  [[ $port -ge 1024 && $port -le 65535 ]] || { echo 'Port muss zwischen 1024 und 65535 liegen.' >&2; return 1; }
  [[ "$once" == false || "$mode" == test ]] || { echo '--once benötigt --test.' >&2; return 1; }
  [[ "$mode" != test || -z "$domain" ]] || { echo 'Der temporäre HTTP-Test unterstützt --domain nicht.' >&2; return 1; }
  [[ "$database_mode" != local || -z "$database_url_file" ]] || { echo 'Lokale Einrichtung und externe Verbindungsdatei nicht kombinieren.' >&2; return 1; }
  [[ "$mode" != test || ( "$database_mode" == auto && -z "$database_url_file" && -z "$database_ca_file" ) ]] || { echo 'Testbetrieb verwendet eine eigene isolierte PostgreSQL-Datenbank.' >&2; return 1; }
  if [[ -n "$domain" ]] && { [[ ! "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ ]] || [[ "$domain" != *.* ]] || [[ "$domain" == *..* ]]; }; then
    echo 'Bitte einen vollständigen Domainnamen ohne https://, Port oder Pfad angeben.' >&2; return 1
  fi
}

select_app_layout() {
  local source_dir="$1" file manifest runtime_prefix='' version major minor rest
  version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([0-9.]*\)".*/\1/p' "$source_dir/package.json" | head -n 1)"
  IFS=. read -r major minor rest <<< "$version"
  if [[ "$major" =~ ^[0-9]+$ && "$minor" =~ ^[0-9]+$ ]] && ((major > 1 || (major == 1 && minor >= 4))) && [[ ! -d "$source_dir/dist" ]]; then
    echo 'Kompilierter Build fehlt: dist. Vollständiges Paket verwenden oder npm run build ausführen.' >&2; return 1
  fi
  local manifests=(runtime-files.txt)
  app_entry=server/index.js; app_public=public; runtime_dirs=(server shared public scripts deploy)
  if [[ -e "$source_dir/dist" ]]; then
    [[ -d "$source_dir/dist" ]] || { echo 'Ungültiges Build-Verzeichnis: dist' >&2; return 1; }
    runtime_prefix=dist/; manifests+=(compiled-runtime-files.txt)
    app_entry=dist/server/index.js; app_public=dist/public; runtime_dirs=(dist scripts deploy)
    [[ -f "$source_dir/dist/package.json" ]] || { echo 'Build-Metadaten fehlen: dist/package.json' >&2; return 1; }
    local build_version
    version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([0-9.]*\)".*/\1/p' "$source_dir/package.json" | head -n 1)"
    build_version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([0-9.]*\)".*/\1/p' "$source_dir/dist/package.json" | head -n 1)"
    [[ -n "$version" && "$version" == "$build_version" ]] || { echo 'Build-Version und package.json stimmen nicht überein. Build aktualisieren.' >&2; return 1; }
  fi
  for file in package.json deploy/retourenboard.service deploy/retourenboard-updater.service scripts/install-updater.sh scripts/install-updater-guard.sh scripts/start-service.sh scripts/install-network.sh scripts/test-server.mjs scripts/runtime-layout.mjs; do
    [[ -f "$source_dir/$file" ]] || { echo "Projektdatei fehlt: $file" >&2; return 1; }
  done
  for manifest in "${manifests[@]}"; do
    [[ -f "$source_dir/deploy/$manifest" ]] || { echo "Projektdatei fehlt: deploy/$manifest" >&2; return 1; }
    while IFS= read -r file || [[ -n "$file" ]]; do
      file="${file%$'\r'}"; [[ -n "$file" ]] || continue
      if [[ "$file" == */ ]]; then
        [[ -d "$source_dir/$runtime_prefix$file" ]] || { echo "Projektdatei fehlt: $runtime_prefix$file" >&2; return 1; }
      else
        [[ -f "$source_dir/$runtime_prefix$file" ]] || { echo "Projektdatei fehlt: $runtime_prefix$file" >&2; return 1; }
      fi
    done < "$source_dir/deploy/$manifest"
  done
  if [[ -d "$source_dir/previews" ]]; then runtime_dirs+=(previews); fi
  if [[ -d "$source_dir/frontend" ]]; then runtime_dirs+=(frontend); fi
  if [[ -d "$source_dir/docs" ]]; then runtime_dirs+=(docs); fi
}

print_install_plan() {
  local source_dir="$1" version
  version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([0-9.]*\)".*/\1/p' "$source_dir/package.json" | head -n 1)"
  printf 'PROBELAUF – keine Systemänderungen\nVersion: %s\nProgramm: %s\nPort bei Neuinstallation: %s\n' "$version" "$app_entry" "$port"
  if [[ -n "$domain" ]]; then printf 'Öffentliche Adresse: https://%s\n' "$domain";
  elif [[ "$lan" == true ]]; then printf 'Zugriff: Container-/Server-IP, Port %s\n' "$port";
  else printf 'Zugriff: 127.0.0.1:%s\n' "$port"; fi
  if [[ -n "$domain" && "$lan" == true ]]; then printf 'Zusätzlicher direkter HTTP-Zugriff im LAN: Container-IP, Port %s\n' "$port"; fi
  echo 'Ziele bei Installation: /opt/retourenboard, /var/lib/retourenboard, /etc/retourenboard.env'
  echo 'Anwendungsdienst: retourenboard.service (bisheriger Name bleibt als Alias erhalten).'
  if [[ "$database_mode" == external || -n "$database_url_file" ]]; then echo 'Externe PostgreSQL-Datenbank; passende Clientwerkzeuge, kein lokaler Datenbankserver.';
  elif [[ "$database_mode" == local ]]; then echo 'PostgreSQL 18 lokal mit privatem Anwendungszugang einrichten.';
  else echo 'PostgreSQL: vorhandene Verbindung erhalten; bei Neuinstallation PostgreSQL 18 lokal einrichten.'; fi
  echo 'Vorhandene Konten, Daten und Konfiguration werden bei einem Update erhalten.'
  echo 'Paketdateien geprüft. Installation benötigt Debian/Ubuntu, systemd, root und Internet.'
  echo 'Es werden keine Pakete installiert und keine Dienste oder bestehenden Daten verändert.'
}
