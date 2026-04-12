#!/usr/bin/env bash
set -euo pipefail

# Record automated demo video of Bearing.
# Starts Vite dev server, runs the Playwright demo script, converts output to MP4.

VITE_PID=""

cleanup() {
  if [[ -n "$VITE_PID" ]]; then
    echo "Stopping Vite dev server (PID $VITE_PID)..."
    kill "$VITE_PID" 2>/dev/null || true
    wait "$VITE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "Bearing Demo Video Recorder"
echo "==========================="
echo ""

# Prepare output directories
mkdir -p demo/screenshots demo/video-raw

# Clean previous outputs
echo "Cleaning previous outputs..."
rm -f demo/video-raw/*.webm demo/video-raw/*.mp4
rm -f demo/screenshots/*.png
rm -f demo/video.mp4

# Ensure frontend dependencies are installed
echo "Installing frontend dependencies..."
cd frontend
npm install --silent
cd ..

# Install demo script dependencies
echo "Installing demo dependencies..."
cd tests/demo
npm install --silent
npx playwright install chromium --with-deps 2>/dev/null || npx playwright install chromium
cd ../..

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
echo "Running demo script..."
cd tests/demo
node demo.test.js
DEMO_EXIT=$?
cd ../..

if [[ $DEMO_EXIT -ne 0 ]]; then
  echo "ERROR: Demo script failed with exit code $DEMO_EXIT"
  exit $DEMO_EXIT
fi

# Convert WebM to MP4
echo ""
echo "Converting video to MP4..."
WEBM_FILE=$(ls demo/video-raw/*.webm 2>/dev/null | head -1 || true)
if [[ -n "$WEBM_FILE" ]]; then
  if command -v ffmpeg >/dev/null 2>&1; then
    ffmpeg -y -i "$WEBM_FILE" -c:v libx264 -preset fast -crf 23 demo/video.mp4 2>/dev/null
    echo "Video saved to: demo/video.mp4"
  else
    echo "WARNING: ffmpeg not found. Raw video at: $WEBM_FILE"
    echo "Install ffmpeg: brew install ffmpeg"
  fi
else
  echo "WARNING: No WebM video found in demo/video-raw/"
fi

echo ""
echo "Demo outputs:"
echo "  Video:       demo/video.mp4"
echo "  Screenshots: demo/screenshots/"
ls -la demo/screenshots/ 2>/dev/null || true
echo ""
echo "Done!"
