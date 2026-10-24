#!/usr/bin/env bash

run_test_app() {
  local source_dir="$1" test_node='' test_address='' candidate arch archive args
  for candidate in "$(command -v node || true)" /opt/retourenboard/node/bin/node; do
    if [[ -n "$candidate" && -x "$candidate" ]] && "$candidate" -e "if(Number(process.versions.node.split('.')[0])<24)process.exit(1);require('node:sqlite')" >/dev/null 2>&1; then
      test_node="$candidate"; break
    fi
  done
  if [[ -z "$test_node" ]]; then
    [[ $(uname -s) == Linux ]] || { echo 'Teststart benötigt Node.js 24. Bitte Node.js installieren.' >&2; return 1; }
    for candidate in curl awk sha256sum tar xz mktemp; do
      command -v "$candidate" >/dev/null || { echo "Für den temporären Node-Download fehlt: $candidate. Debian: sudo apt install curl ca-certificates xz-utils" >&2; return 1; }
    done
    case "$(uname -m)" in x86_64) arch=x64 ;; aarch64|arm64) arch=arm64 ;; *) echo 'Node-Testdownload unterstützt x86_64 und ARM64.' >&2; return 1 ;; esac
    test_runtime_temp="$(mktemp -d)"
    trap 'rm -rf -- "$test_runtime_temp"' EXIT
    echo 'Node.js 24 wird nur für diesen Test temporär geladen …'
    curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$test_runtime_temp/SHASUMS256.txt"
    archive="$(awk -v arch="$arch" '$2 ~ ("^node-v24\\.[0-9]+\\.[0-9]+-linux-" arch "\\.tar\\.xz$") {print $2; exit}' "$test_runtime_temp/SHASUMS256.txt")"
    [[ "$archive" =~ ^node-v24\.[0-9]+\.[0-9]+-linux-(x64|arm64)\.tar\.xz$ ]] || { echo 'Kein passendes Node.js-Paket gefunden.' >&2; return 1; }
    curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "https://nodejs.org/dist/latest-v24.x/$archive" -o "$test_runtime_temp/$archive"
    awk -v file="$archive" '$2 == file {print}' "$test_runtime_temp/SHASUMS256.txt" > "$test_runtime_temp/checksum"
    (cd "$test_runtime_temp" && sha256sum --check checksum)
    mkdir "$test_runtime_temp/node"
    tar -xJf "$test_runtime_temp/$archive" -C "$test_runtime_temp/node" --strip-components=1
    test_node="$test_runtime_temp/node/bin/node"
  fi
  args=(--port "$port")
  if [[ "$lan" == true ]]; then args+=(--lan); test_address="$(install_server_address 0.0.0.0)"; fi
  if [[ "$once" == true ]]; then args+=(--once); fi
  RETOURENBOARD_TEST_ADDRESS="$test_address" "$test_node" "$source_dir/scripts/test-server.mjs" "${args[@]}"
  if [[ -n "${test_runtime_temp:-}" ]]; then rm -rf -- "$test_runtime_temp"; trap - EXIT; fi
}
