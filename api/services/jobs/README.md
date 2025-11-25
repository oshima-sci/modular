# Jobs System

## Overview

Jobs are async tasks processed by workers. Each job type has a handler that does the actual work.

## Structure

```
services/
  jobs/
    queue.py      # Job CRUD (create, claim, complete)
    handlers.py   # Registry that maps job types → handlers
  parse/
    handler.py    # handle_parse_paper()
  extract/
    handler.py    # handle_extract_claims()
```

## Adding a New Job Type

1. **Add the type to `models/job.py`:**
   ```python
   class JobType(str, Enum):
       PARSE_PAPER = "parse_paper"
       EXTRACT_CLAIMS = "extract_claims"
       MY_NEW_JOB = "my_new_job"  # Add here
   ```

2. **Create a handler in the relevant service folder:**
   ```python
   # services/myservice/handler.py
   def handle_my_new_job(payload: dict) -> dict:
       item_id = payload["item_id"]

       # 1. Fetch data
       # 2. Do work
       # 3. Save results

       return {"result": "..."}
   ```

3. **Register in `services/jobs/handlers.py`:**
   ```python
   from services.myservice import handle_my_new_job

   def _register_default_handlers(self):
       self.register(JobType.PARSE_PAPER, handle_parse_paper)
       self.register(JobType.MY_NEW_JOB, handle_my_new_job)
   ```

## Creating Jobs

From anywhere in the codebase:

```python
from services.jobs import JobQueue
from models import JobType

queue = JobQueue()
queue.create_job_by_type(
    job_type=JobType.PARSE_PAPER,
    payload={"paper_id": "uuid-here"}
)
```

## Job Chaining

To trigger the next job after completion, create it at the end of your handler:

```python
# services/parse/handler.py
def handle_parse_paper(payload: dict) -> dict:
    paper_id = payload["paper_id"]

    # ... do parsing work ...

    # Chain to next job
    queue = JobQueue()
    queue.create_job_by_type(
        job_type=JobType.EXTRACT_CLAIMS,
        payload={"paper_id": paper_id}
    )

    return {"parsed_path": "..."}
```

## Job Lifecycle

```
PENDING → RUNNING → COMPLETED
                 ↘ FAILED (retries until max_attempts)
```

## Current Job Types

| Type | Trigger | Handler | Next Job |
|------|---------|---------|----------|
| `parse_paper` | After PDF upload | `services/parse/handler.py` | `extract_claims` (TODO) |
| `extract_claims` | After parsing | `services/extract/handler.py` | TBD |
