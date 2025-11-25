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

1. Install Node dependencies:
```bash
npm install
cd app && npm install && cd ..
```

2. Set up Python environment for the API:
```bash
./setup.sh
```

Or manually:
```bash
cd api
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
deactivate
cd ..
```

## Running

Start both frontend and backend simultaneously:
```bash
npm run dev
```

Or run them separately:
```bash
# Frontend only
npm run dev:app

# Backend only (make sure to activate venv first)
cd api && source venv/bin/activate && uvicorn main:app --reload --port 8000
```

## Accessing

- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/docs
