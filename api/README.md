# API

FastAPI backend with background job processing for PDF parsing, LLM extraction, and cross-paper linking.

## Architecture

```
api/
├── main.py          # FastAPI app entry point
├── worker.py        # Background job worker (multiprocessing)
├── routes/          # API endpoints
├── services/        # Business logic by domain
│   ├── parse/       # PDF parsing via Grobid
│   ├── extract/     # LLM extraction via DSPy
│   ├── link/        # Claim/observation linking
│   ├── jobs/        # Job queue management
│   └── vector/      # Embeddings
├── db/queries/      # Database query classes
├── models/          # Pydantic schemas
└── dependencies/    # FastAPI dependencies (auth)
```

## Two Entry Points

| Entry | Purpose |
|-------|---------|
| `main.py` | FastAPI server - handles HTTP requests |
| `worker.py` | Background worker - processes async jobs from queue |

## Job Types

The worker processes these job types from a Postgres-backed queue:

| Job | Description |
|-----|-------------|
| `PARSE_PAPER` | Parse PDF via Grobid → extract document structure |
| `EXTRACT_ELEMENTS` | LLM extraction → claims, observations, methods |
| `LINK_LIBRARY` | Link claims/observations across papers in a library |

## Setup

```bash
cd api
uv sync
```

## Running

**API + workers together (recommended for dev):**
```bash
./start-dev.sh --workers 4
```

**Or run separately:**
```bash
uv run uvicorn main:app --reload --port 8000  # API only
uv run python worker.py --workers 4           # Workers only
```

**From monorepo root:**
```bash
npm run dev  # Frontend + API (no workers)
```

## Key Dependencies

- **FastAPI** - Web framework
- **DSPy** - LLM orchestration for extraction and linking
- **Grobid** - PDF parsing (requires separate Grobid server)
- **Supabase** - PostgreSQL database
