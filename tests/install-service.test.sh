#!/usr/bin/env bash
set -euo pipefail
source scripts/start-service.sh

# Simulate systemd failures without touching services or filesystem paths.
events=''
attempts=0
mode='restart-failure'
systemctl() {
  events+="systemctl $*;"
  if [[ $1 == restart ]]; then
    attempts=$((attempts+1))
    if [[ $mode == restart-failure && $attempts -eq 1 ]]; then return 1; fi
    return 0
  fi
  if [[ $1 == daemon-reload ]]; then return 0; fi
  [[ $mode == success || ( $mode == restore-success && $attempts -eq 2 ) ]]
}
ln() { events+="ln $*;"; }
sleep() { :; }
journalctl() { :; }

if start_service_or_restore app.service /opt/test /old/release /old/runtime; then
  echo 'FAIL: failed restart must report failure' >&2; exit 1
fi
[[ $events == *'ln -sfn -- /old/release /opt/test/current;'* ]]
[[ $events == *'ln -sfn -- /old/runtime /opt/test/node;'* ]]
[[ $attempts -eq 2 ]]

events=''; attempts=0; mode='inactive'
if start_service_or_restore app.service /opt/test /old/release /old/runtime; then
  echo 'FAIL: inactive new service must report failure' >&2; exit 1
fi
[[ $attempts -eq 2 ]]

events=''; attempts=0; mode='success'
start_service_or_restore app.service /opt/test /old/release /old/runtime
[[ $attempts -eq 1 && $events != *'ln '* ]]

# The old release can have a different entry point; restore its matching unit.
fixture_dir="$(mktemp -d)"
trap 'rm -rf -- "$fixture_dir"' EXIT
printf 'ExecStart=/opt/test/node/bin/node server/index.js\n' > "$fixture_dir/old.service"
printf 'ExecStart=/opt/test/node/bin/node dist/server/index.js\n' > "$fixture_dir/current.service"
events=''; attempts=0; mode='restore-success'
if start_service_or_restore app.service /opt/test /old/release /old/runtime "$fixture_dir/old.service" "$fixture_dir/current.service"; then
  echo 'FAIL: restored old unit must still report the failed update' >&2; exit 1
fi
cmp "$fixture_dir/old.service" "$fixture_dir/current.service"
[[ $events == *'systemctl daemon-reload;systemctl restart app.service;'* ]]
echo 'PASS: failed updates restore release, runtime and matching service unit; successful start keeps the new version.'
