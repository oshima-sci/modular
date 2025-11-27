# Library Linking Implementation

## Overview

Create a system to automatically link extracts (claims, methods, observations) within libraries whenever new papers are processed or added. Links are stored in `extract_links` table and represent relationships like claim-to-claim (duplicates, contradictions, etc.) and claim-to-observation (evidence relationships).

## Triggers

1. **Paper finishes `extract_elements` job** → queue `LINK_LIBRARY` for each library the paper belongs to
2. **Paper added to library via API** → queue `LINK_LIBRARY` for that library

For both: Do NOT queue if there's still other papers that are connected to the same library with running or pending jobs (`parse_paper`, `extract_elements`). See `maybe_queue_link_library` functions.

## Job Types

### LINK_LIBRARY (Forward Linking)
- **Input**: Claims that are "new" to this library (created or added after last linking job)
- **Operations**:
  - c2c: Compare input claims against ALL claims in library
  - c2o: Compare input claims against ALL observations in library
- **Output**: Links saved to `extract_links` table

### LINK_EVIDENCE_REVERSE (Future - Backward Linking)
- **Trigger**: When new observations are added to a library that already has claims
- **Input**: New observations/methods from recently added papers
- **Operations**:
  - Reverse method selection: Find existing claims these new methods might be relevant to
  - c2o: Compare those existing claims against new observations only
- **Why separate**: Different trigger logic, different selection logic, avoids redundant comparisons

## Key Concepts

### Determining "New" Extracts

An extract is "new" to a library if either:
- `extract.created_at > cutoff` (extract didn't exist during last linking)
- `library_papers.added_at > cutoff` (paper wasn't in library during last linking)

The **cutoff** is the `claimed_at` timestamp of the most recent completed/running `LINK_LIBRARY` job for that library.

If no previous job exists → all extracts are new (new library case).

### Cutoff Stored in Payload

To handle job failures and retries correctly, the cutoff is calculated at queue time and stored in the job payload. This ensures a retried job uses the same cutoff it was originally assigned, even if other jobs have run since.

```python
payload = {
    "library_id": "...",
    "cutoff": "2025-01-15T10:30:00Z"  # or None for new library
}
```

### Concurrent Jobs

Jobs can run concurrently because each handles a distinct time window:
- Job A (claimed T1): processes extracts ≤ T1
- Job B (claimed T2): uses T1 as cutoff, processes extracts > T1
- They don't overlap, can run in parallel

### Deduplication

- `extract_links` has unique constraint on `(from_id, to_id)`
- Use upsert with ignore duplicates when saving links
- Minor overlap in concurrent jobs is handled gracefully

## Database Changes

### New Table: `extract_links`
```sql
create table extract_links (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references extracts(id) on delete cascade,
  to_id uuid not null references extracts(id) on delete cascade,
  content jsonb not null,  -- link_type, reasoning, etc.
  job_id uuid references jobs(id) on delete set null,
  created_at timestamptz default now()
);

create unique index extract_links_from_to_unique on extract_links(from_id, to_id);
```
**Status**: Migration created ✓

### Migration: Preserve `claimed_at` on Job Completion

Currently `complete_job` RPC clears `claimed_at`. Need to preserve it so subsequent jobs can reference it as their cutoff.

## Code Changes

### Already Done
- Added `LINK_LIBRARY` to `JobType` enum
- Created `extract_links` table migration and pushed to DB
- Added `has_pending_processing_jobs_for_library` query
- Added `has_recent_pending_link_job` query (needs fix)
- Created `maybe_queue_link_library` function
- Created `maybe_queue_link_library_for_library` function
- Added `get_libraries_for_paper` to LibraryQueries
- Integrated queue functions into `extract_elements` handler and libraries route

### Still Needed

**Infrastructure:**
- Fix `has_recent_pending_link_job` to only check pending (not running)
- Migration to preserve `claimed_at` on job completion
- Add `get_previous_link_job_claimed_at` query to JobQueue
- Update `maybe_queue_link_library` to calculate and include cutoff in payload

**Queries:**
- Add `get_unlinked_claims_for_library(library_id, cutoff)` to ExtractQueries
- Create `ExtractLinkQueries` class with upsert method for saving links

**Linking Module Refactors:**
- Refactor `claim2claim.py` to accept `input_claims` parameter
- Refactor `claim2observation.py` to accept `input_claims` parameter
    - Current link_observations_to_claims(library_id):
        1. Fetches ALL claims
        2. Fetches ALL observations
        3. For each claim, preselects relevant observations
        4. Links
    - Change: Add function that takes input_claims and compares them against ALL observations. The existing _link_claims_async already takes a claims list, we just need to:
        1. Accept input_claims parameter
        2. Fetch ALL observations from library
        3. Run the existing linking logic

**Handler:**
- Create `handle_link_library` handler in `services/link/handler.py`
- Register handler in `services/jobs/handlers.py`

## Flow Diagrams

### Paper Processing Flow
```
Upload Paper
    ↓
PARSE_PAPER job
    ↓
EXTRACT_ELEMENTS job
    ↓
Creates claims, methods, observations
    ↓
maybe_queue_link_library(paper_id)
    ↓
For each library containing this paper:
    - Check no pending/running PARSE_PAPER or EXTRACT_ELEMENTS for library papers
    - Check no recent pending LINK_LIBRARY job
    - Calculate cutoff from previous job's claimed_at
    - Queue LINK_LIBRARY with {library_id, cutoff}
```

### Adding Paper to Library Flow
```
POST /api/library (with paper_ids)
    ↓
add_papers(library_id, paper_ids)
    ↓
maybe_queue_link_library_for_library(library_id)
    ↓
Same checks and queueing as above
```

### LINK_LIBRARY Job Execution
```
Worker claims job
    ↓
Read library_id and cutoff from payload
    ↓
Fetch claims where created_at > cutoff OR paper.added_at > cutoff
    ↓
If no new claims → return early
    ↓
Run c2c: input_claims vs all library claims
    ↓
Run c2o: input_claims vs all library observations
    ↓
Save links to extract_links (upsert, ignore duplicates)
    ↓
Return summary
```

### Future: LINK_EVIDENCE_REVERSE Flow
```
LINK_LIBRARY completes with new observations
    ↓
Check if library has existing claims (linked before)
    ↓
Queue LINK_EVIDENCE_REVERSE with {library_id, new_observation_paper_ids, cutoff}
    ↓
Worker claims job
    ↓
Fetch new observations from specified papers
    ↓
Reverse method selection: which existing claims might these methods be relevant to?
    ↓
Run c2o for matched claims vs new observations only
    ↓
Save links
```

## Open Questions / Future Considerations

1. **Reverse method selector**: Needs implementation - given methods, find claims they're relevant to (inverse of current method_selector.py)

2. **Link updates**: What happens if we re-extract a paper? Should we delete old links and re-link? Currently not handled.

3. **Performance**: For large libraries, the c2c similarity matrix could get expensive. Current implementation uses similarity threshold (0.75) to group, which helps.

4. **Observability**: Should add metrics/logging for link job duration, claims processed, links created, etc.
