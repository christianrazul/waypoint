#!/usr/bin/env bash
# Pull latest, rebuild, and replace the installed Waypoint.app.
# Usage: scripts/update-macos.sh [--no-pull]
set -euo pipefail
waypoint_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$waypoint_root"
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'macOS only.' >&2
  exit 1
fi

if [[ "${1:-}" != --no-pull ]]; then
  git pull --ff-only
fi
pnpm install --frozen-lockfile
./scripts/package-macos.sh

built="$waypoint_root/src-tauri/target/release/bundle/macos/Waypoint.app"
installed=/Applications/Waypoint.app

# Quit the running app (menu-bar only, so there is no Dock window).
if pgrep -x waypoint >/dev/null || pgrep -f "$installed/Contents/MacOS" >/dev/null; then
  osascript -e 'tell application id "app.waypoint.presenter" to quit' >/dev/null 2>&1 || true
  sleep 1
  pkill -f "$installed/Contents/MacOS" 2>/dev/null || true
fi

rm -rf "$installed"
ditto "$built" "$installed"
echo "Updated $installed"
open "$installed"
