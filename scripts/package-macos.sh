#!/usr/bin/env bash
set -euo pipefail
waypoint_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$waypoint_root"
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'macOS packaging requires a Mac.' >&2
  exit 1
fi
pnpm tauri build --bundles app
waypoint_version="$(node -p 'require("./package.json").version')"
waypoint_arch="$(uname -m)"
if [[ "$waypoint_arch" == arm64 ]]; then waypoint_arch=aarch64; fi
waypoint_stage="$(mktemp -d "${TMPDIR:-/tmp}/waypoint-dmg.XXXXXX")"
trap 'rm -rf "$waypoint_stage"' EXIT
mkdir -p src-tauri/target/release/bundle/dmg
ditto src-tauri/target/release/bundle/macos/Waypoint.app "$waypoint_stage/Waypoint.app"
ln -s /Applications "$waypoint_stage/Applications"
waypoint_dmg="$waypoint_root/src-tauri/target/release/bundle/dmg/Waypoint_${waypoint_version}_${waypoint_arch}.dmg"
hdiutil create -volname Waypoint -srcfolder "$waypoint_stage" -format UDZO -ov "$waypoint_dmg"
hdiutil verify "$waypoint_dmg"
printf '%s\n' "$waypoint_dmg"
