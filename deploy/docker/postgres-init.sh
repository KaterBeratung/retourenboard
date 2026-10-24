#!/usr/bin/env bash
set -Eeuo pipefail
[[ ${RETOURENBOARD_DATABASE_PASSWORD:-} =~ ^[a-f0-9]{64}$ ]] || { echo 'Generated application database password missing.' >&2; exit 1; }
# Credentials go through stdin; the application role has no cluster-level powers.
{
  printf "CREATE ROLE retourenboard LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '%s';\n" "$RETOURENBOARD_DATABASE_PASSWORD"
  printf '%s\n' 'CREATE DATABASE retourenboard OWNER retourenboard;' 'REVOKE ALL ON DATABASE retourenboard FROM PUBLIC;'
} | psql --username "$POSTGRES_USER" --dbname postgres --set ON_ERROR_STOP=1
psql --username "$POSTGRES_USER" --dbname retourenboard --set ON_ERROR_STOP=1 <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
