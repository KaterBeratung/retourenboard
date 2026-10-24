#!/usr/bin/env bash

install_config_value() {
  local value
  value="$(awk -v key="$2" 'match($0, "^[[:space:]]*" key "[[:space:]]*=") { value = substr($0, RLENGTH + 1); sub(/^[[:space:]]+/, "", value); sub(/[[:space:]]+$/, "", value) } END { print value }' "$1")"
  # Read selected values as text; never execute an environment file.
  value="${value#\"}"; value="${value%\"}"
  value="${value#\'}"; value="${value%\'}"
  printf '%s' "$value"
}

apply_install_binding() {
  local config="$1" lan="$2" explicit="${3:-false}" node="${4:-$(command -v node)}" current desired mode=auto
  current="$(install_config_value "$config" HOST)"
  if [[ "$explicit" == true ]]; then mode=local; [[ "$lan" == true ]] && mode=lan; fi
  desired="$("$node" "$(dirname -- "${BASH_SOURCE[0]}")/install-binding.mjs" "$config" "$mode" true)" || return 1
  if [[ "$current" != "$desired" ]]; then printf 'Bind-Adresse für diesen Container: HOST=%s\n' "$desired"; fi
}

install_server_address() {
  local bind_host="$1" private_only="${2:-false}" route='' candidates address
  case "$bind_host" in
    0.0.0.0|::)
      # Inspect the default route locally; this sends no network request.
      if command -v ip >/dev/null 2>&1; then route="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<NF;i++) if($i=="src") {print $(i+1);exit}}' || true)"; fi
      candidates="$route $(hostname -I 2>/dev/null || true)"
      ;;
    *) candidates="$bind_host" ;;
  esac
  address="$(printf '%s\n' "$candidates" | awk -v private_only="$private_only" '
    function v4(ip,a,n,i) {
      if(ip !~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/) return 0;
      n=split(ip,a,"."); for(i=1;i<=n;i++) if(a[i]>255) return 0;
      if(a[1]==0 || a[1]==127 || a[1]>=224 || (a[1]==169 && a[2]==254)) return 0;
      return private_only!="true" || a[1]==10 || (a[1]==172 && a[2]>=16 && a[2]<=31) || (a[1]==192 && a[2]==168);
    }
    {for(i=1;i<=NF;i++) if(v4($i)) {print $i;exit}}
  ')"
  if [[ -z "$address" && "$bind_host" != 0.0.0.0 ]]; then
    address="$(printf '%s\n' "$candidates" | awk -v private_only="$private_only" '{for(i=1;i<=NF;i++){s=tolower($i);if(s ~ /:/ && s ~ /^[0-9a-f:]+$/ && s!="::" && s!="::1" && s!~/^fe80:/ && (private_only!="true" || s~/^f[cd][0-9a-f][0-9a-f]:/)) {print "[" s "]";exit}}}')"
  fi
  printf '%s' "$address"
}

print_install_access() {
  local config="$1" app_dir="${2:-}" bind_host port origin server_ip address network
  bind_host="$(install_config_value "$config" HOST)"
  port="$(install_config_value "$config" PORT)"
  origin="$(install_config_value "$config" PUBLIC_ORIGIN)"
  if [[ -n "$app_dir" && -x "$app_dir/node/bin/node" && -f "$app_dir/current/dist/server/network-settings.js" ]]; then
    if network="$("$app_dir/node/bin/node" --env-file="$config" "$app_dir/current/dist/server/network-settings.js" 2>/dev/null)"; then
      port="$(printf '%s\n' "$network" | awk 'index($0,"PORT=")==1 {print substr($0,6)}')"
      origin="$(printf '%s\n' "$network" | awk 'index($0,"PUBLIC_ORIGIN=")==1 {print substr($0,15)}')"
    fi
  fi
  bind_host="${bind_host:-127.0.0.1}"; port="${port:-3000}"
  if [[ -n "$origin" ]]; then
    printf '\nBrowseradresse nach Einrichtung des Reverse Proxys: %s\n' "$origin"
    echo 'Siehe README.md für DNS, Nginx und HTTPS.'
    if [[ "$bind_host" != 127.0.0.1 && "$bind_host" != localhost && "$bind_host" != ::1 ]]; then
      address="$(install_server_address "$bind_host" true)"
      if [[ -n "$address" ]]; then printf 'Zusätzlich über die Container-/Server-IP: http://%s:%s\n' "$address" "$port";
      else echo 'Keine private Container-IP automatisch erkannt. Für direkten HTTP-Zugriff die private Container-IP verwenden.'; fi
      echo 'Lokales HTTP ist unverschlüsselt.'
    fi
    return
  fi
  case "$bind_host" in
    0.0.0.0|::)
      server_ip="$(install_server_address "$bind_host")"
      printf '\nJetzt im Browser öffnen: http://%s:%s\n' "${server_ip:-LXC-IP}" "$port"
      if [[ -z "$server_ip" ]]; then echo 'LXC-IP durch die IP-Adresse deines Containers ersetzen.'; fi
      ;;
    127.0.0.1|localhost|::1)
      address="$bind_host"; if [[ "$address" == *:* ]]; then address="[$address]"; fi
      printf '\nLokal auf dem Server: http://%s:%s\n' "$address" "$port"
      printf 'Für Fernzugriff: ssh -L 3001:%s:%s BENUTZER@SERVER\n' "$address" "$port"
      echo 'Danach auf deinem Rechner http://127.0.0.1:3001 öffnen.'
      ;;
    *)
      address="$bind_host"; if [[ "$address" == *:* ]]; then address="[$address]"; fi
      printf '\nJetzt im Browser öffnen: http://%s:%s\n' "$address" "$port"
      ;;
  esac
}
