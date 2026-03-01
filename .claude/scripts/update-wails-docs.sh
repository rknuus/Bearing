#!/bin/bash

set -euo pipefail

# Create target directory
mkdir -p tmp/docs/wails

# Use git sparse-checkout to pull only the docs folder (fast, no full clone)
WAILS_TMP=$(mktemp -d)
git clone \
  --depth=1 \
  --filter=blob:none \
  --sparse \
  https://github.com/wailsapp/wails.git \
  "$WAILS_TMP"

cd "$WAILS_TMP"
git sparse-checkout set website/docs
cd -

# Copy docs into project, replacing previous snapshot
rm -rf tmp/docs/wails/*
cp -r "$WAILS_TMP/website/docs/." tmp/docs/wails/

# Capture the commit SHA for traceability
COMMIT=$(git -C "$WAILS_TMP" rev-parse --short HEAD)
echo "# Wails v2 Docs Snapshot" > tmp/docs/wails/.snapshot
echo "Source: https://github.com/wailsapp/wails" >> tmp/docs/wails/.snapshot
echo "Commit: $COMMIT" >> tmp/docs/wails/.snapshot
echo "Fetched: $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> tmp/docs/wails/.snapshot

# Clean up
rm -rf "$WAILS_TMP"
