#!/bin/bash
# Start API server and workers together
# Usage: ./start.sh [--workers N]
#
# Logs are prefixed with [API] and [WORKER] for clarity.
# For cleaner debugging, run in separate terminals instead:
#   Terminal 1: uv run uvicorn main:app --reload
#   Terminal 2: uv run python worker.py --workers 2

set -e

# Change to the api directory (where .env lives)
cd "$(dirname "$0")"

WORKERS=4
if [[ "$1" == "--workers" ]]; then
    WORKERS=${2:-4}
fi

echo "=========================================="
echo "Starting API + $WORKERS workers"
echo "=========================================="

# Use full path to uv if available (for systemd), otherwise use uv from PATH
UV_BIN="${UV_BIN:-$(command -v uv 2>/dev/null || echo /root/.local/bin/uv)}"

# Start workers in background, prefix output (unbuffered for real-time logs)
"$UV_BIN" run python -u worker.py --workers "$WORKERS" 2>&1 | stdbuf -oL sed 's/^/[WORKER] /' &
WORKER_PID=$!

# Trap to kill workers when script exits
trap "echo 'Shutting down...'; kill $WORKER_PID 2>/dev/null" EXIT

# Start API, prefix output (unbuffered for real-time logs)
if [ -n "$PRODUCTION" ] || [ ! -t 0 ]; then
    "$UV_BIN" run uvicorn main:app --host 0.0.0.0 --port 8000 2>&1 | stdbuf -oL sed 's/^/[API] /'
else
    "$UV_BIN" run uvicorn main:app --reload --host 0.0.0.0 --port 8000 2>&1 | stdbuf -oL sed 's/^/[API] /'
fi
