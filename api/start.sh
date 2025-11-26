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

# Start workers in background, prefix output
uv run python worker.py --workers "$WORKERS" 2>&1 | sed 's/^/[WORKER] /' &
WORKER_PID=$!

# Trap to kill workers when script exits
trap "echo 'Shutting down...'; kill $WORKER_PID 2>/dev/null" EXIT

# Start API, prefix output
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000 2>&1 | sed 's/^/[API] /'
