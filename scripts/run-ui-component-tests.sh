#!/usr/bin/env bash
set -euo pipefail

# Run Playwright UI component tests against a self-managed Vite dev server.
# Starts Vite, waits for readiness, runs tests, cleans up.

VITE_PID=""

cleanup() {
  if [[ -n "$VITE_PID" ]]; then
    echo "Stopping Vite dev server (PID $VITE_PID)..."
    kill "$VITE_PID" 2>/dev/null || true
    wait "$VITE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "UI Component Test Runner"
echo "========================"
echo ""

# Ensure frontend dependencies are installed
echo "Installing frontend dependencies..."
cd frontend
npm install --silent
cd ..

# Start Vite dev server in background
echo "Starting Vite dev server..."
cd frontend
npx vite &>/dev/null &
VITE_PID=$!
cd ..

# Wait for server to be ready
echo "Waiting for Vite dev server at http://localhost:5173..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w '' http://localhost:5173 2>/dev/null; then
    echo "  Server ready (took ${i}s)"
    break
  fi
  if ! kill -0 "$VITE_PID" 2>/dev/null; then
    echo "ERROR: Vite dev server exited unexpectedly"
    exit 1
  fi
  if [[ $i -eq 30 ]]; then
    echo "ERROR: Vite dev server did not start within 30s"
    exit 1
  fi
  sleep 1
done

echo ""

# Ensure test dependencies are installed
cd tests/ui-component
npm install --silent
npx playwright install chromium --with-deps 2>/dev/null || npx playwright install chromium

# Run tests
HEADLESS="${HEADLESS:-false}" npm test
TEST_EXIT=$?

exit $TEST_EXIT
