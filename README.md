# Modular 

An app for researchers to upload papers and receive a cross-linked map of claims, methods, and observations from those papers.

## What it does

- stores uploaded paper PDFs
- parses PDFs using Grobid service
- extracts from parsed PDF (LLM)
    - core claims per paper
    - methods used in a paper if applicable
    - observations resulting out of each method
- saves coordinates of extract sources so we can find them in the PDF
- links extracts of papers in the same library (LLM)
    - claim2claim: duplicate, contradiction, variant, premise
    - claim2method: if the method could produce observations relevant to the claim
    - observation2claim: support, context, contradict
- some library level summaries

We're using jobs on the DB and parallel workers to make this more efficient.

Ensure code is developed in tiny, modular pieces that are testable independent of the rest of the pipeline.

## Structure

```
modular/
├── app/          # Vite React frontend (runs on http://localhost:5173)
├── api/          # FastAPI backend (runs on http://localhost:8000)
└── package.json  # Root package with dev scripts
```

## Setup

1. Install frontend dependencies:
```bash
cd app && npm install
```

2. Install backend dependencies (requires [uv](https://docs.astral.sh/uv/)):
```bash
cd api && uv sync
```

3. Set up environment variables:
```bash
cp app/.env.example app/.env
cp api/.env.example api/.env
# Then edit both .env files with your keys
```

4. Run GROBID (PDF parser):
```bash
docker run --rm -p 8070:8070 lfoppiano/grobid:0.8.1
```
See [GROBID documentation](https://grobid.readthedocs.io/) for more options.

## Running

**Frontend** (Terminal 1):
```bash
cd app && npm run dev
```

**Backend** (Terminal 2):
```bash
cd api && ./start-dev.sh
```

This starts the API server and worker processes together with prefixed logs. Workers are required to process jobs (PDF parsing, extraction, linking).

Alternatively, run API and workers separately for cleaner debugging:
```bash
# Terminal 2: API only
cd api && uv run uvicorn main:app --reload --port 8000

# Terminal 3: Workers
cd api && uv run python worker.py --workers 4
```

## Accessing

- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/docs
