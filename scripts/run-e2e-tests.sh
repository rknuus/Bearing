#!/usr/bin/env bash
set -euo pipefail

# Run true E2E tests against Wails dev server with an isolated temp data directory.
# Creates temp dir, starts wails dev, waits for server, runs tests, cleans up.

BEARING_E2E_DIR=$(mktemp -d "${TMPDIR:-/tmp}/bearing-e2e.XXXXXX")
WAILS_PID=""

cleanup() {
  if [[ -n "$WAILS_PID" ]]; then
    echo "Stopping Wails dev server (PID $WAILS_PID)..."
    kill "$WAILS_PID" 2>/dev/null || true
    wait "$WAILS_PID" 2>/dev/null || true
  fi
  if [[ -d "$BEARING_E2E_DIR" ]]; then
    echo "Cleaning up temp data directory: $BEARING_E2E_DIR"
    rm -rf "$BEARING_E2E_DIR"
  fi
}
trap cleanup EXIT

echo "E2E Test Runner"
echo "==============="
echo "Data directory: $BEARING_E2E_DIR"
echo ""

# Start Wails dev server in background
echo "Starting Wails dev server..."
BEARING_DATA_DIR="$BEARING_E2E_DIR" ~/go/bin/wails dev &>/dev/null &
WAILS_PID=$!

# Wait for server to be ready
echo "Waiting for Wails dev server at http://localhost:34115..."
for i in $(seq 1 60); do
  if curl -s -o /dev/null -w '' http://localhost:34115 2>/dev/null; then
    echo "  Server ready (took ${i}s)"
    break
  fi
  if ! kill -0 "$WAILS_PID" 2>/dev/null; then
    echo "ERROR: Wails dev server exited unexpectedly"
    exit 1
  fi
  if [[ $i -eq 60 ]]; then
    echo "ERROR: Wails dev server did not start within 60s"
    exit 1
  fi
  sleep 1
done

echo ""

# Run tests
cd tests/e2e
BEARING_DATA_DIR="$BEARING_E2E_DIR" HEADLESS="${HEADLESS:-false}" npm test
TEST_EXIT=$?

exit $TEST_EXIT
