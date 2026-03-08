#!/usr/bin/env bash
set -euo pipefail

# Run true E2E tests against Wails dev server with an isolated temp data directory.
# Creates temp dir, starts wails dev, waits for server, runs tests, cleans up.

E2E_PORT=34215
E2E_VITE_PORT=5174
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
echo "Dev server port: $E2E_PORT"
echo ""

# Pre-flight: ensure dedicated E2E port is free
if curl -s -o /dev/null -w '' "http://localhost:$E2E_PORT" 2>/dev/null; then
  echo "ERROR: Port $E2E_PORT is already in use. Aborting to avoid data pollution."
  exit 1
fi

# Start Wails dev server in background
echo "Starting Wails dev server on port $E2E_PORT..."
WAILS_LOG="$BEARING_E2E_DIR/wails-dev.log"
BEARING_DATA_DIR="$BEARING_E2E_DIR" VITE_PORT="$E2E_VITE_PORT" ~/go/bin/wails dev -devserver "localhost:$E2E_PORT" &>"$WAILS_LOG" &
WAILS_PID=$!

# Wait for server to be ready
echo "Waiting for Wails dev server at http://localhost:$E2E_PORT..."
for i in $(seq 1 60); do
  if curl -s -o /dev/null -w '' "http://localhost:$E2E_PORT" 2>/dev/null; then
    echo "  Server ready (took ${i}s)"
    break
  fi
  if ! kill -0 "$WAILS_PID" 2>/dev/null; then
    echo "ERROR: Wails dev server exited unexpectedly"
    echo "--- Wails log ---"
    cat "$WAILS_LOG" 2>/dev/null || true
    echo "--- end log ---"
    exit 1
  fi
  if [[ $i -eq 60 ]]; then
    echo "ERROR: Wails dev server did not start within 60s"
    exit 1
  fi
  sleep 1
done

echo ""

# Ensure dependencies are installed
cd tests/e2e
npm install --silent
npx playwright install chromium --with-deps 2>/dev/null || npx playwright install chromium

# Run tests
BEARING_DATA_DIR="$BEARING_E2E_DIR" WAILS_DEV_URL="http://localhost:$E2E_PORT" HEADLESS="${HEADLESS:-false}" npm test
TEST_EXIT=$?

exit $TEST_EXIT
