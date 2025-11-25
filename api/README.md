# FastAPI Backend

## Setup

1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

## Running

From the root of the monorepo:
```bash
npm run dev
```

Or run the API separately:
```bash
cd api
uvicorn main:app --reload --port 8000
```
