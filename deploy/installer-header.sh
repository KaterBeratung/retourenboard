#!/usr/bin/env bash
# Generated download installer. Rebuild with npm run package.
set -Eeuo pipefail
umask 077
repository='https://github.com/KaterBeratung/retourenboard'

usage() {
  cat <<'HELP'
retourenboard. installieren oder aktualisieren:
  bash retourenboard-install.sh          (als root in der LXC-Konsole)
  sudo bash retourenboard-install.sh     (mit einem normalen Linux-Konto)
  bash retourenboard-install.sh --dry-run
  bash retourenboard-install.sh --test --once
  bash retourenboard-install.sh --local
  sudo bash retourenboard-install.sh --archive ./retourenboard-linux.tar.gz
  bash retourenboard-install.sh ./retourenboard-linux.tar.gz --dry-run
  sudo bash retourenboard-install.sh --domain retouren.example.com

Zuerst wird im Ordner dieses Skripts, danach im aktuellen Arbeitsordner gesucht:
retourenboard-linux.tar.gz hat Vorrang, sonst das höchste versionierte Paket
retourenboard-linux-X.Y.Z.tar.gz. Nur wenn kein lokales Paket vorhanden ist,
wird die neueste veröffentlichte Version von GitHub geladen und SHA256-geprüft.
Mit --archive DATEI oder einem direkten .tar.gz-Dateipfad wird das lokale
Paket verwendet, ohne GitHub abzufragen. Eine vorhandene DATEI.sha256 wird geprüft.
Weitere Optionen werden unverändert an den Installer im Paket übergeben.

Standardmäßig über http://CONTAINER-IP:3000 erreichbar. Die tatsächliche
Container-/Server-IP wird am Ende ausgegeben. Dort den ersten Administrator anlegen.
--local beschränkt den Zugriff auf localhost; --lan setzt den Container-Zugriff ausdrücklich.
DNS, Zertifikat und Reverse Proxy werden separat eingerichtet.

Updates erhalten Konten, Daten, Domain und Port. Eine alte localhost-Bindung wird
standardmäßig für Container-Zugriff geöffnet; --local behält localhost bei.
Die Systeminstallation benötigt Debian/Ubuntu mit systemd, x86_64/ARM64 und Internet.
GitHub-Downloads benötigen curl; ein lokaler Probelauf benötigt kein Internet.
Falls curl fehlt: sudo apt install curl ca-certificates
--dry-run / --check sucht oder lädt und prüft das Paket ohne Systemänderungen.
--test startet mit frischen, temporären Daten auf Port 3001, ohne Installation.
--port 3002 wählt einen anderen Port; --once prüft den Teststart automatisch.
Strg+C beendet den Test und entfernt seine Daten. Root ist für Tests nicht nötig.
HELP
}

for argument in "$@"; do
  case "$argument" in --help|-h) usage; exit 0 ;; esac
done
local_archive=''
forwarded_args=()
while (($#)); do
  case "$1" in
    --archive)
      [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || { echo '--archive benötigt eine lokale TAR.GZ-Datei.' >&2; exit 1; }
      [[ -z "$local_archive" ]] || { echo 'Nur eine lokale TAR.GZ-Datei angeben.' >&2; exit 1; }
      local_archive="$2"; shift 2 ;;
    --domain|--port|--database|--database-url-file|--database-ca-file)
      forwarded_args+=("$1"); shift
      if (($#)); then forwarded_args+=("$1"); shift; fi ;;
    --*) forwarded_args+=("$1"); shift ;;
    *.tar.gz)
      [[ -z "$local_archive" ]] || { echo 'Nur eine lokale TAR.GZ-Datei angeben.' >&2; exit 1; }
      local_archive="$1"; shift ;;
    *) forwarded_args+=("$1"); shift ;;
  esac
done
programs=(awk sed head tail sort sha256sum tar gzip mktemp cp basename dirname)
for program in "${programs[@]}"; do
  command -v "$program" >/dev/null || {
    echo "Grundprogramm fehlt: $program. Für Downloads: sudo apt install curl ca-certificates" >&2
    exit 1
  }
done

if [[ -z "$local_archive" ]]; then
  installer_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
  for directory in "$installer_dir" "$(pwd -P)"; do
    if [[ -e "$directory/retourenboard-linux.tar.gz" || -L "$directory/retourenboard-linux.tar.gz" ]]; then
      local_archive="$directory/retourenboard-linux.tar.gz"
      break
    fi
    archive_names=()
    for candidate in "$directory"/retourenboard-linux-*.tar.gz; do
      name="${candidate##*/}"
      [[ "$name" =~ ^retourenboard-linux-[0-9]+\.[0-9]+\.[0-9]+\.tar\.gz$ ]] || continue
      archive_names+=("$name")
    done
    if ((${#archive_names[@]})); then
      name="$(printf '%s\n' "${archive_names[@]}" | sort -V | tail -n 1)"
      local_archive="$directory/$name"
      break
    fi
  done
fi
if [[ -z "$local_archive" ]] && ! command -v curl >/dev/null; then
  echo 'Kein lokales Programmpaket gefunden. Für den GitHub-Download fehlt curl: sudo apt install curl ca-certificates' >&2
  exit 1
fi

temp_dir="$(mktemp -d)"
trap 'rm -rf -- "$temp_dir"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# BEGIN EXTRACT_BUNDLE
has_checksum=true
if [[ -n "$local_archive" ]]; then
  [[ -f "$local_archive" && -r "$local_archive" && ! -L "$local_archive" ]] || { echo 'Lokale TAR.GZ-Datei fehlt, ist nicht lesbar oder ist ein symbolischer Link.' >&2; exit 1; }
  asset_name="$(basename -- "$local_archive")"
  echo "Lokales Programmpaket: $asset_name"
  cp -- "$local_archive" "$temp_dir/package.tar.gz"
  if [[ -e "$local_archive.sha256" || -L "$local_archive.sha256" ]]; then
    [[ -f "$local_archive.sha256" && ! -L "$local_archive.sha256" ]] || { echo 'Ungültige lokale Prüfsummen-Datei.' >&2; exit 1; }
    cp -- "$local_archive.sha256" "$temp_dir/package.sha256"
  else
    has_checksum=false
    printf 'SHA256 (lokal berechnet): '
    sha256sum "$temp_dir/package.tar.gz" | awk '{print $1}'
  fi
else
  echo 'Neueste veröffentlichte retourenboard-Version wird ermittelt …'
  # Resolve latest once, then pin both downloads to the same immutable tag.
  # Versioned assets work without a GitHub API token or JSON parser.
  curl_options=(--fail --silent --show-error --location --proto '=https' --proto-redir '=https' --tlsv1.2 --retry 2 --connect-timeout 15)
  if ! release_url="$(curl "${curl_options[@]}" --head --max-time 60 --header 'Cache-Control: no-cache' --output /dev/null --write-out '%{url_effective}' "$repository/releases/latest")"; then
    echo 'Das neueste GitHub-Release konnte nicht ermittelt werden. Internetzugang prüfen und erneut versuchen.' >&2
    exit 1
  fi
  if [[ "$release_url" =~ ^https://github\.com/KaterBeratung/retourenboard/releases/tag/(v?([0-9]+\.[0-9]+\.[0-9]+))$ ]]; then
    release_tag="${BASH_REMATCH[1]}"
    release_version="${BASH_REMATCH[2]}"
  else
    echo 'Unerwartete Release-Adresse. Es wurde kein Programmpaket ausgeführt.' >&2
    exit 1
  fi
  echo "Programmpaket $release_version wird von GitHub geladen …"
  asset_name=''
  for candidate in "retourenboard-linux-$release_version.tar.gz" retourenboard-linux.tar.gz; do
    if curl "${curl_options[@]}" --max-time 600 --output "$temp_dir/package.tar.gz" "$repository/releases/download/$release_tag/$candidate"; then
      asset_name="$candidate"
      break
    fi
  done
  [[ -n "$asset_name" ]] || { echo 'Das Programmpaket konnte nicht geladen werden. Das GitHub-Release muss ein retourenboard-linux-TAR enthalten.' >&2; exit 1; }
  if ! curl "${curl_options[@]}" --max-time 60 --output "$temp_dir/package.sha256" "$repository/releases/download/$release_tag/$asset_name.sha256"; then
    echo 'Die SHA256-Prüfsummen-Datei fehlt oder konnte nicht geladen werden. Installation abgebrochen.' >&2
    exit 1
  fi
fi
if [[ "$has_checksum" == true ]]; then
  checksum_record=''; IFS= read -r checksum_record < "$temp_dir/package.sha256" || true
  checksum_record="${checksum_record%$'\r'}"
  checksum_pattern='^([a-fA-F0-9]{64})[[:space:]]+(\*?.+)$'
  if [[ ! "$checksum_record" =~ $checksum_pattern ]]; then
    echo 'Ungültige SHA256-Prüfsummen-Datei. Installation abgebrochen.' >&2; exit 1
  fi
  expected_sha256="${BASH_REMATCH[1]}"; checksum_name="${BASH_REMATCH[2]}"; checksum_name="${checksum_name#\*}"
  if [[ "$checksum_name" != "$asset_name" || "$(awk 'NF { count++ } END { print count+0 }' "$temp_dir/package.sha256")" != 1 ]]; then
    echo 'Ungültige SHA256-Prüfsummen-Datei. Installation abgebrochen.' >&2
    exit 1
  fi
  if ! printf '%s  %s\n' "$expected_sha256" "$temp_dir/package.tar.gz" | sha256sum --check --status; then
    echo 'Die SHA256-Prüfsumme stimmt nicht. Bitte den Download erneut versuchen.' >&2
    exit 1
  fi
fi
# Our builds contain regular files/directories only. Reject escaping paths and
# links before extracting any package archive, including in dry runs.
tar -tzf "$temp_dir/package.tar.gz" > "$temp_dir/entries"
while IFS= read -r entry; do
  while [[ "$entry" == ./* ]]; do entry="${entry#./}"; done
  if [[ -z "$entry" || "$entry" == /* || "$entry" == *\\* || "$entry" == *:* || "/$entry/" == *'/../'* ]]; then
    echo 'Ungültiger Pfad im Programmpaket. Installation abgebrochen.' >&2
    exit 1
  fi
done < "$temp_dir/entries"
if ! tar -tvzf "$temp_dir/package.tar.gz" | awk 'substr($0,1,1)!="-" && substr($0,1,1)!="d" { bad=1 } END { exit bad }'; then
  echo 'Unzulässiger Dateityp im Programmpaket. Installation abgebrochen.' >&2
  exit 1
fi
mkdir "$temp_dir/app"
tar -xzf "$temp_dir/package.tar.gz" -C "$temp_dir/app" --no-same-owner --no-same-permissions
[[ -f "$temp_dir/app/package.json" && -f "$temp_dir/app/scripts/install-linux.sh" ]] || { echo 'Das Programmpaket ist unvollständig.' >&2; exit 1; }
package_version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([0-9.]*\)".*/\1/p' "$temp_dir/app/package.json" | head -n 1)"
[[ "$package_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Ungültige Paketversion. Installation abgebrochen.' >&2; exit 1; }
if [[ -z "$local_archive" && "$package_version" != "$release_version" ]]; then
  echo 'Paketversion und GitHub-Release stimmen nicht überein. Installation abgebrochen.' >&2; exit 1
fi
if [[ "$has_checksum" == true ]]; then echo 'SHA256 geprüft.'; fi
echo "retourenboard. $package_version wird vorbereitet …"
# END EXTRACT_BUNDLE
bash "$temp_dir/app/scripts/install-linux.sh" "${forwarded_args[@]}"
