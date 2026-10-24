#!/usr/bin/env bash
set -euo pipefail
bundle="${1:-releases/latest/retourenboard-install.sh}"
[[ -f "$bundle" ]] || { echo 'FAIL: the download installer is missing.' >&2; exit 1; }
export RETOURENBOARD_INSTALLER_UNDER_TEST="$(cd -- "$(dirname -- "$bundle")" && pwd -P)/$(basename -- "$bundle")"
if command -v cygpath >/dev/null; then
  export RETOURENBOARD_INSTALLER_UNDER_TEST="$(cygpath -m "$RETOURENBOARD_INSTALLER_UNDER_TEST")"
fi
# Execute the built installer with controlled release downloads. No root,
# package installation, systemd or paths outside temporary test data are used.
node --test tests/installer-download.test.js
