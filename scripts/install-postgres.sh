#!/usr/bin/env bash

install_postgres_repository() {
  local distro codename fingerprint
  # os-release is the local operating-system identity, never downloaded code.
  . /etc/os-release
  distro="$ID"; codename="${VERSION_CODENAME:-}"
  case "$distro:$codename" in
    debian:bookworm|debian:trixie|ubuntu:jammy|ubuntu:noble|ubuntu:resolute) ;;
    *) echo 'Lokale PostgreSQL-Einrichtung unterstützt Debian 12/13 und Ubuntu 22.04/24.04/26.04.' >&2; return 1 ;;
  esac
  apt-get install -y --no-install-recommends ca-certificates curl gnupg
  install -d -m 755 /usr/share/postgresql-common/pgdg
  curl --fail --silent --show-error --proto '=https' --tlsv1.2 https://www.postgresql.org/media/keys/ACCC4CF8.asc -o "$temp_dir/postgresql-key.asc"
  fingerprint="$(gpg --batch --show-keys --with-colons "$temp_dir/postgresql-key.asc" 2>/dev/null | awk -F: '$1=="fpr" {print $10;exit}')"
  [[ "$fingerprint" == B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8 ]] || { echo 'PostgreSQL-Signaturschlüssel stimmt nicht.' >&2; return 1; }
  install -m 644 "$temp_dir/postgresql-key.asc" /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  printf '%s\n' 'Types: deb' 'URIs: https://apt.postgresql.org/pub/repos/apt' "Suites: $codename-pgdg" 'Components: main' 'Signed-By: /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc' > /etc/apt/sources.list.d/retourenboard-pgdg.sources
  apt-get update
}

configure_install_database() {
  local source_dir="$1" node="$2" config="$3" data_dir="$4" inspect configured selected group_id major
  inspect="$("$node" "$source_dir/scripts/configure-postgres.mjs" --inspect --config "$config" --data-dir "$data_dir")"
  configured="$(printf '%s' "$inspect" | "$node" -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>console.log(JSON.parse(s).postgresql?"true":"false"))')"
  selected="$database_mode"
  if [[ "$selected" == auto ]]; then
    if [[ "$configured" == true ]]; then selected=existing;
    elif [[ -n "$database_url_file" ]]; then selected=external;
    else selected=local; fi
  fi
  group_id="$(id -g retourenverwaltung)"
  install_postgres_repository
  if [[ "$selected" == local ]]; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends postgresql-18 postgresql-client-18
    if ! pg_lsclusters --no-header | awk '$1=="18"&&$2=="retourenboard" {found=1} END {exit !found}'; then
      install -d -m 700 /var/lib/retourenboard-updater
      (umask 077; printf '%s\n' '18/retourenboard:55432' > /var/lib/retourenboard-updater/local-cluster-prepared)
      pg_createcluster --port 55432 18 retourenboard
    elif [[ ! -f /etc/retourenboard/database-url && ! -f /var/lib/retourenboard-updater/local-cluster-prepared ]]; then
      echo 'Vorhandener retourenboard-Datenbankcluster ohne Zugangskonfiguration. Zugang wiederherstellen; es wird nichts zurückgesetzt.' >&2; return 1
    fi
    # Use the loopback hostname: pg_conftool treats dotted numeric values as numbers.
    pg_conftool 18 retourenboard set listen_addresses localhost
    pg_conftool 18 retourenboard set password_encryption scram-sha-256
    pg_ctlcluster 18 retourenboard start || pg_isready -h 127.0.0.1 -p 55432
  fi
  local args=(--config "$config" --data-dir "$data_dir" --mode "$selected" --group-id "$group_id")
  [[ -z "$database_url_file" ]] || args+=(--url-file "$database_url_file")
  [[ -z "$database_ca_file" ]] || args+=(--ca-file "$database_ca_file")
  "$node" "$source_dir/scripts/configure-postgres.mjs" "${args[@]}" > "$temp_dir/database-status.json"
  major="$("$node" -e 'const f=require("fs");console.log(JSON.parse(f.readFileSync(process.argv[1],"utf8")).serverMajor)' "$temp_dir/database-status.json")"
  [[ "$major" =~ ^(16|17|18)$ ]] || return 1
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "postgresql-client-$major"
  printf 'PostgreSQL %s: Zugang geprüft; Anwendungsrolle ohne Datenbankadministration.\n' "$major"
}
