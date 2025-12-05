#!/bin/bash
# Start API server and workers together (dev version, no stdbuf dependency)
# Usage: ./start-dev.sh [--workers N]

set -e

cd "$(dirname "$0")"

WORKERS=4
if [[ "$1" == "--workers" ]]; then
    WORKERS=${2:-4}
fi

echo "=========================================="
echo "Starting API + $WORKERS workers (dev mode)"
echo "=========================================="

UV_BIN="${UV_BIN:-$(command -v uv 2>/dev/null || echo /root/.local/bin/uv)}"

# Start workers in background, prefix output
"$UV_BIN" run python -u worker.py --workers "$WORKERS" 2>&1 | sed 's/^/[WORKER] /' &
WORKER_PID=$!

trap "echo 'Shutting down...'; kill $WORKER_PID 2>/dev/null" EXIT

# Start API with reload
"$UV_BIN" run uvicorn main:app --reload --host 0.0.0.0 --port 8000 2>&1 | sed 's/^/[API] /'
