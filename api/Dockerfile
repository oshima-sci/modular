# Multi-stage build for smaller final image
FROM python:3.11-slim AS builder

# Install uv for fast dependency resolution
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Set working directory
WORKDIR /app

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install dependencies to a virtual environment
RUN uv sync --frozen --no-dev

# Final stage - minimal runtime image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /app/.venv /app/.venv

# Copy application code
COPY . .

# Ensure venv is in PATH
ENV PATH="/app/.venv/bin:$PATH"

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD python -c "import requests; requests.get('http://localhost:8000/api/health')"

# Run the application
# Default to 4 workers, can be overridden with docker run -e WORKERS=4
ENV WORKERS=4
ENV PRODUCTION=1

# Start workers in background, then start API
CMD ["sh", "-c", "python -u worker.py --workers $WORKERS 2>&1 | sed 's/^/[WORKER] /' & uvicorn main:app --host 0.0.0.0 --port 8000 2>&1 | sed 's/^/[API] /'"]
