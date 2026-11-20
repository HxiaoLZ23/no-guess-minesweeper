#!/usr/bin/env bash
# Prepare a playable static site under dist/site for OpenShip (Linux) / local builds.
# Idempotent: clears the output directory before copying.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist/site"

rm -rf "$OUT"
mkdir -p "$OUT"

copy_file() {
  local src="$ROOT/$1"
  if [[ -f "$src" ]]; then
    cp "$src" "$OUT/$1"
  else
    echo "warn: missing file $1" >&2
  fi
}

copy_file index.html
copy_file styles.css
copy_file sw.js
copy_file manifest.json
copy_file icon.svg
copy_file version.json
copy_file cloud.json
copy_file start.bat

if [[ -d "$ROOT/js" ]]; then
  cp -R "$ROOT/js" "$OUT/js"
else
  echo "error: js/ not found" >&2
  exit 1
fi

if [[ -d "$ROOT/assets" ]]; then
  cp -R "$ROOT/assets" "$OUT/assets"
else
  echo "error: assets/ not found" >&2
  exit 1
fi

echo "Prepared static site at $OUT"
