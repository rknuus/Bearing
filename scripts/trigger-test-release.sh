#!/usr/bin/env bash
set -euo pipefail

command -v gh >/dev/null 2>&1 || { echo "Error: gh not found. Install with: brew install gh"; exit 1; }

TAG="v0.0.0-test.$(date +%s)"

cleanup() {
    echo "Cleaning up..."
    gh release delete "$TAG" --yes 2>/dev/null || true
    git push origin --delete "$TAG" 2>/dev/null || true
    git tag -d "$TAG" 2>/dev/null || true
}
trap cleanup EXIT

echo "Pushing test tag $TAG..."
git tag "$TAG"
git push origin "$TAG"

echo "Waiting for workflow run..."
RUN_ID=""
for _ in $(seq 1 60); do
    RUN_ID=$(gh run list --branch="$TAG" --limit=1 --json databaseId --jq '.[0].databaseId' 2>/dev/null)
    if [[ -n "$RUN_ID" ]]; then break; fi
    sleep 2
done

if [[ -z "$RUN_ID" ]]; then
    echo "Error: workflow run not found after 120s"
    exit 1
fi

echo "Watching run $RUN_ID..."
gh run watch "$RUN_ID"
