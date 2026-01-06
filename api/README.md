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

## Docker Setup (Optional)

Run the API and Grobid parser in containers while connecting to Supabase for database and file storage.

### Prerequisites
- Docker Desktop
- Supabase project ([create one free](https://supabase.com))
  - Apply migrations from `supabase/migrations/` to set up the database schema
  - Copy your project credentials (URL, service role key, database URL)

### Quick Start

1. **Configure environment**
   ```bash
   cp api/.env.example api/.env
   # Edit api/.env with your Supabase credentials and Anthropic API key
   ```

2. **Start services** (from repo root)
   ```bash
   docker-compose up
   ```

   This runs:
   - API server + background workers (containerized)
   - Grobid PDF parser (containerized)
   - Connected to your Supabase instance (managed database + file storage)

3. **Access**
   - API: http://localhost:8000
   - API docs: http://localhost:8000/docs
   - Grobid: http://localhost:8070

### Why Database Isn't Containerized

The API requires a database for all operations - the extraction and linking pipeline stores intermediate results, job queue state, and cross-paper relationships in Postgres. We use Supabase's managed Postgres + S3-like storage for PDFs rather than running these in containers because:

1. **Production-realistic setup** - Managed databases/storage are standard for deployed applications
2. **Stateful data** - Papers, extracts, and links persist across container restarts
3. **File storage** - Supabase Storage provides S3-compatible API for PDFs (could be swapped for actual S3/MinIO in other deployments)

## Key Dependencies

- **FastAPI** - Web framework
- **DSPy** - LLM orchestration for extraction and linking
- **Grobid** - PDF parsing (requires separate Grobid server)
- **Supabase** - PostgreSQL database + S3-like file storage
